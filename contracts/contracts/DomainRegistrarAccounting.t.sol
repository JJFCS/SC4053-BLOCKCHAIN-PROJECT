// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

// Test wallet: can reject ETH, attempt nested calls, or finalize a pending auction.
contract AccountingWallet {
	DomainRegistrar public registrar;
	bool public rejectETH;
	bool public tryReentry;
	bool public withdrawalReentrySucceeded;
	bool public paymentReentrySucceeded;
	bytes32 public withdrawalReentryError;
	bytes32 public paymentReentryError;
	uint256 public finalizeOnReceive;

	function configure(DomainRegistrar target, bool reject, bool reenter, uint256 finalizeRound) external {
		registrar = target;
		rejectETH = reject;
		tryReentry = reenter;
		finalizeOnReceive = finalizeRound;
	}

	function withdraw() external {
		registrar.withdraw();
	}

	receive() external payable {
		require(!rejectETH, "REJECT ETH");
		if (finalizeOnReceive != 0) {
			uint256 roundId = finalizeOnReceive;
			finalizeOnReceive = 0;
			registrar.finalizeDomain(roundId, "bob");
		}
		if (tryReentry) {
			tryReentry = false;
			(bool withdrawn, bytes memory withdrawalData) = address(registrar).call(
				abi.encodeWithSelector(DomainRegistrar.withdraw.selector)
			);
			(bool paid, bytes memory paymentData) = address(registrar).call{value: 1}(
				abi.encodeWithSelector(DomainRegistrar.sendToDomain.selector, "alice", address(this))
			);
			withdrawalReentrySucceeded = withdrawn;
			paymentReentrySucceeded = paid;
			withdrawalReentryError = keccak256(withdrawalData);
			paymentReentryError = keccak256(paymentData);
		}
	}
}

contract DomainRegistrarAccountingTest is Test {
	DomainRegistrar internal registrar;
	uint256 internal deposit;
	uint256 internal penalty;
	bytes32 internal salt = bytes32(uint256(123));
	address internal alice = address(101);
	address internal bob = address(102);
	address internal carol = address(103);
	address internal dave = address(104);
	address internal treasury = address(900);

	function setUp() public {
		registrar = new DomainRegistrar(treasury);
		registrar.startRound();
		deposit = registrar.COMMIT_DEPOSIT();
		penalty = registrar.NON_REVEAL_PENALTY();
		vm.deal(alice, 10 * deposit);
		vm.deal(bob, 10 * deposit);
		vm.deal(carol, 10 * deposit);
		vm.deal(dave, 10 * deposit);
	}

	function test_FullDepositBidCanSettleWithZeroRefundAfterTreasuryWithdraws() public {
		_bidAndReveal(alice, "alice", deposit);
		_end();
		registrar.finalizeDomain(1, "alice");
		assertEq(registrar.totalLockedDeposits(), 0);
		assertEq(registrar.withdrawalCredits(treasury), deposit);
		vm.prank(treasury);
		registrar.withdraw();
		assertEq(address(registrar).balance, 0);
		vm.prank(alice);
		registrar.settleBid(1);
		assertTrue(registrar.getCommitmentForRound(1, alice).settled);
		assertEq(registrar.withdrawalCredits(alice), 0);
		vm.prank(alice);
		vm.expectRevert(bytes("NO CREDIT"));
		registrar.withdraw();
		vm.prank(alice);
		vm.expectRevert(bytes("ALREADY SETTLED"));
		registrar.settleBid(1);
		_assertAccounting(0);
	}

	function test_OneWeiWinningBidPreservesTheRemainingDeposit() public {
		_bidAndReveal(alice, "alice", 1);
		_end();
		registrar.finalizeDomain(1, "alice");
		assertEq(registrar.withdrawalCredits(treasury), 1);
		assertEq(registrar.totalLockedDeposits(), deposit - 1);
		vm.prank(treasury);
		registrar.withdraw();
		vm.prank(alice);
		registrar.settleBid(1);
		assertEq(registrar.withdrawalCredits(alice), deposit - 1);
		vm.prank(alice);
		registrar.withdraw();
		_assertAccounting(0);
		assertEq(address(registrar).balance, 0);
	}

	function test_TreasuryMayAlsoBeWinnerAndWithdrawCombinedCreditOnce() public {
		registrar = new DomainRegistrar(alice);
		registrar.startRound();
		_bidAndReveal(alice, "alice", 0.06 ether);
		_end();
		registrar.finalizeDomain(1, "alice");
		vm.prank(alice);
		registrar.settleBid(1);
		assertEq(registrar.withdrawalCredits(alice), deposit);
		assertEq(registrar.totalWithdrawalCredits(), deposit);
		uint256 beforeBalance = alice.balance;
		vm.prank(alice);
		registrar.withdraw();
		assertEq(alice.balance, beforeBalance + deposit);
		vm.prank(alice);
		vm.expectRevert(bytes("NO CREDIT"));
		registrar.withdrawTreasury();
		_assertAccounting(0);
	}

	function test_TreasuryMayWithdrawItsPriceBeforeItsWinnerRefundIsSettled() public {
		registrar = new DomainRegistrar(alice);
		registrar.startRound();
		_bidAndReveal(alice, "alice", 0.06 ether);
		_end();
		registrar.finalizeDomain(1, "alice");
		vm.prank(alice);
		registrar.withdraw();
		assertEq(address(registrar).balance, deposit - 0.06 ether);
		vm.prank(alice);
		registrar.settleBid(1);
		assertEq(registrar.withdrawalCredits(alice), deposit - 0.06 ether);
		vm.prank(alice);
		registrar.withdraw();
		assertEq(address(registrar).balance, 0);
		_assertAccounting(0);
	}

	function test_TreasuryAsLosingBidderReceivesItsRefundPlusWinningPrice() public {
		registrar = new DomainRegistrar(bob);
		registrar.startRound();
		_commit(1, alice, "alice", 0.06 ether);
		_commit(1, bob, "alice", 0.04 ether);
		vm.warp(registrar.getRound(1).commitEnd);
		_reveal(alice, "alice", 0.06 ether);
		_reveal(bob, "alice", 0.04 ether);
		_end();
		registrar.finalizeDomain(1, "alice");
		vm.prank(bob);
		registrar.settleBid(1);
		assertEq(registrar.withdrawalCredits(bob), deposit + 0.06 ether);
		vm.prank(bob);
		registrar.withdraw();
		vm.prank(alice);
		registrar.settleBid(1);
		assertEq(registrar.withdrawalCredits(alice), deposit - 0.06 ether);
		_assertAccounting(0);
	}

	function test_NoValidRevealsCreateOnlyPenaltyCreditsAndNoOwner() public {
		_commit(1, alice, "alice", 0.04 ether);
		_commit(1, bob, "bob", 0.05 ether);
		_end();
		vm.prank(alice);
		registrar.settleBid(1);
		vm.prank(bob);
		registrar.settleBid(1);
		assertEq(registrar.getRound(1).pendingDomainCount, 0);
		assertEq(registrar.ownerOf("alice"), address(0));
		assertEq(registrar.reservedRound("alice"), 0);
		assertEq(registrar.ownerOf("bob"), address(0));
		assertEq(registrar.withdrawalCredits(treasury), 2 * penalty);
		assertEq(registrar.withdrawalCredits(alice), deposit - penalty);
		assertEq(registrar.withdrawalCredits(bob), deposit - penalty);
		vm.expectRevert(bytes("NO WINNING BID"));
		registrar.finalizeDomain(1, "alice");
		_assertAccounting(0);
	}

	function test_RejectingWalletsDoNotBlockFinalizationOrSettlementAndCanRetryWithdrawal() public {
		AccountingWallet treasuryWallet = new AccountingWallet();
		AccountingWallet bidderWallet = new AccountingWallet();
		registrar = new DomainRegistrar(address(treasuryWallet));
		registrar.startRound();
		treasuryWallet.configure(registrar, true, false, 0);
		bidderWallet.configure(registrar, true, false, 0);
		vm.deal(address(bidderWallet), deposit);
		_bidAndReveal(address(bidderWallet), "alice", 0.06 ether);
		_end();
		registrar.finalizeDomain(1, "alice");
		vm.prank(address(bidderWallet));
		registrar.settleBid(1);
		assertEq(registrar.withdrawalCredits(address(treasuryWallet)), 0.06 ether);
		assertEq(registrar.withdrawalCredits(address(bidderWallet)), deposit - 0.06 ether);
		vm.expectRevert(bytes("ETH TRANSFER FAILED"));
		treasuryWallet.withdraw();
		vm.expectRevert(bytes("ETH TRANSFER FAILED"));
		bidderWallet.withdraw();
		assertEq(registrar.totalWithdrawalCredits(), deposit);
		assertEq(address(registrar).balance, deposit);
		treasuryWallet.configure(registrar, false, false, 0);
		treasuryWallet.withdraw();
		bidderWallet.configure(registrar, false, false, 0);
		bidderWallet.withdraw();
		assertEq(address(registrar).balance, 0);
		_assertAccounting(0);
	}

	function test_CanonicalWithdrawalCannotReenterItselfOrDomainPayments() public {
		AccountingWallet wallet = new AccountingWallet();
		wallet.configure(registrar, false, true, 0);
		vm.deal(address(wallet), deposit);
		_bidAndReveal(address(wallet), "alice", 0.06 ether);
		_end();
		registrar.finalizeDomain(1, "alice");
		vm.prank(address(wallet));
		registrar.settleBid(1);
		wallet.withdraw();
		bytes32 expected = keccak256(abi.encodeWithSignature("Error(string)", "REENTRANT WITHDRAWAL"));
		assertFalse(wallet.withdrawalReentrySucceeded());
		assertFalse(wallet.paymentReentrySucceeded());
		assertEq(wallet.withdrawalReentryError(), expected);
		assertEq(wallet.paymentReentryError(), expected);
		assertEq(registrar.withdrawalCredits(address(wallet)), 0);
		assertEq(registrar.withdrawalCredits(treasury), 0.06 ether);
		_assertAccounting(0);
	}

	function test_CreditCreatedDuringWithdrawalCallbackRemainsClaimable() public {
		AccountingWallet wallet = new AccountingWallet();
		registrar = new DomainRegistrar(address(wallet));
		registrar.startRound();
		wallet.configure(registrar, false, false, 1);
		_commit(1, alice, "alice", 0.06 ether);
		_commit(1, bob, "bob", 0.04 ether);
		vm.warp(registrar.getRound(1).commitEnd);
		_reveal(alice, "alice", 0.06 ether);
		_reveal(bob, "bob", 0.04 ether);
		_end();
		registrar.finalizeDomain(1, "alice");
		wallet.withdraw(); // Its callback finalizes bob, creating a new treasury credit.
		assertEq(address(wallet).balance, 0.06 ether);
		assertEq(registrar.withdrawalCredits(address(wallet)), 0.04 ether);
		assertEq(registrar.getRound(1).pendingDomainCount, 0);
		wallet.withdraw();
		assertEq(address(wallet).balance, 0.1 ether);
		assertEq(registrar.withdrawalCredits(address(wallet)), 0);
		_assertAccounting(0);
	}

	function test_ExtraETHDoesNotIncreaseAnyWithdrawalEntitlement() public {
		_bidAndReveal(alice, "alice", 0.06 ether);
		_end();
		vm.deal(address(registrar), deposit + 7);
		registrar.finalizeDomain(1, "alice");
		vm.prank(alice);
		registrar.settleBid(1);
		vm.prank(alice);
		registrar.withdraw();
		vm.prank(treasury);
		registrar.withdraw();
		assertEq(address(registrar).balance, 7);
		vm.prank(treasury);
		vm.expectRevert(bytes("NO CREDIT"));
		registrar.withdraw();
		_assertAccounting(7);
	}

	function testFuzz_AccountingAcrossSettlementAndWithdrawalOrders(uint96 bidSeed, uint8 orderSeed, bool treasuryFirst) public {
		uint256 winningBid = bound(uint256(bidSeed), 2, deposit);
		_commit(1, alice, "alice", winningBid);
		_commit(1, bob, "alice", 1);
		_commit(1, carol, "unopened", 0.02 ether);
		vm.warp(registrar.getRound(1).commitEnd);
		_reveal(bob, "alice", 1);
		_reveal(alice, "alice", winningBid);
		_end();
		registrar.finalizeDomain(1, "alice");
		registrar.startRound();
		_commit(2, dave, "later", 0.02 ether);
		uint256 extra = uint256(orderSeed) % 4;
		vm.deal(address(registrar), address(registrar).balance + extra);
		if (treasuryFirst) {
			vm.prank(treasury);
			registrar.withdraw();
		}
		address[3] memory bidders = [alice, bob, carol];
		for (uint256 i = 0; i < 3; ++i) {
			address bidder = bidders[(i + uint256(orderSeed)) % 3];
			vm.prank(bidder);
			registrar.settleBid(1);
			_assertAccounting(extra);
			uint256 credit = registrar.withdrawalCredits(bidder);
			if (credit > 0) {
				vm.prank(bidder);
				registrar.withdraw();
			}
			_assertAccounting(extra);
		}
		assertEq(registrar.withdrawalCredits(treasury), treasuryFirst ? penalty : winningBid + penalty);
		vm.prank(treasury);
		registrar.withdraw();
		assertEq(alice.balance, 10 * deposit - winningBid);
		assertEq(bob.balance, 10 * deposit);
		assertEq(carol.balance, 10 * deposit - penalty);
		assertEq(treasury.balance, winningBid + penalty);
		assertEq(registrar.totalLockedDeposits(), deposit);
		assertEq(registrar.totalWithdrawalCredits(), 0);
		assertEq(address(registrar).balance, deposit + extra);
		assertFalse(registrar.getCommitmentForRound(2, dave).settled);
		assertEq(registrar.getRound(2).pendingDomainCount, 0);
		_assertAccounting(extra);
	}

	function _bidAndReveal(address bidder, string memory label, uint256 bid) internal {
		_commit(1, bidder, label, bid);
		vm.warp(registrar.getRound(1).commitEnd);
		_reveal(bidder, label, bid);
	}

	function _commit(uint256 roundId, address bidder, string memory label, uint256 bid) internal {
		bytes32 digest = registrar.computeCommitment(roundId, bidder, label, bid, salt);
		vm.prank(bidder);
		registrar.commitBid{value: deposit}(roundId, digest);
	}

	function _reveal(address bidder, string memory label, uint256 bid) internal {
		vm.prank(bidder);
		registrar.revealBid(1, label, bid, salt);
	}

	function _end() internal {
		vm.warp(registrar.getRound(1).revealEnd);
	}

	function _assertAccounting(uint256 extra) internal view {
		assertEq(address(registrar).balance, registrar.totalLockedDeposits() + registrar.totalWithdrawalCredits() + extra);
	}
}
