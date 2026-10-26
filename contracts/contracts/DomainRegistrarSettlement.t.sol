// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

contract DomainRegistrarSettlementTest is Test {
	DomainRegistrar internal registrar;
	uint256 internal deposit;
	uint256 internal penalty;
	bytes32 internal salt = bytes32(uint256(123));
	uint256 internal aliceId;
	uint256 internal bobId;
	uint256 internal invalidId;
	uint256 internal unrevealedId;
	address internal alice = address(101);
	address internal bob = address(102);
	address internal carol = address(103);
	address internal dave = address(104);
	address internal outsider = address(105);
	address internal treasury = address(900);
	uint256 internal constant WINNING_BID = 0.06 ether;

	function setUp() public {
		registrar = new DomainRegistrar(treasury);
		registrar.startRound();
		deposit = registrar.COMMIT_DEPOSIT();
		penalty = registrar.NON_REVEAL_PENALTY();
		vm.deal(alice, 10 * deposit);
		vm.deal(bob, 10 * deposit);
		vm.deal(carol, 10 * deposit);
		vm.deal(dave, 10 * deposit);
		aliceId = _commit(1, alice, "alice", 0.04 ether);
		bobId = _commit(1, bob, "alice", WINNING_BID);
		invalidId = _commit(1, carol, "invalid", 0);
		unrevealedId = _commit(1, dave, "unopened", 0.03 ether);
		vm.warp(registrar.getRound(1).commitEnd);
		vm.prank(alice);
		registrar.revealBid(1, "alice", 0.04 ether, salt);
		vm.prank(bob);
		registrar.revealBid(1, "alice", WINNING_BID, salt);
		vm.prank(carol);
		vm.expectRevert(bytes("INVALID BID"));
		registrar.revealBid(1, "invalid", 0, salt);
	}

	function test_DeploymentUsesFixedDefaultsAndSuppliedTreasury() public view {
		assertEq(deposit, 0.1 ether);
		assertEq(penalty, 0.001 ether);
		assertGt(penalty, 0);
		assertLt(penalty, deposit);
		assertEq(registrar.treasury(), treasury);
		DomainRegistrar.RoundInfo memory round = registrar.getRound(1);
		assertEq(round.deposit, deposit);
		assertEq(round.nonRevealPenalty, penalty);
		assertEq(round.treasury, treasury);
		assertEq(round.commitEnd - round.startTime, 120);
		assertEq(round.revealEnd - round.commitEnd, 120);
	}

	function test_RejectsZeroTreasuryAtDeployment() public {
		vm.expectRevert(bytes("ZERO TREASURY"));
		new DomainRegistrar(address(0));
	}

	function test_FinalizationCreditsWinningPaymentExactlyOnceWithoutSendingETH() public {
		_end();
		vm.prank(outsider);
		registrar.finalizeDomain(1, "alice");
		assertEq(registrar.withdrawalCredits(treasury), WINNING_BID);
		assertEq(registrar.totalWithdrawalCredits(), WINNING_BID);
		assertEq(registrar.totalLockedDeposits(), 4 * deposit - WINNING_BID);
		assertEq(treasury.balance, 0);
		assertEq(bob.balance, 9 * deposit);
		assertEq(registrar.ownerOf("alice"), bob);
		assertEq(registrar.getRound(1).pendingDomainCount, 0);
		vm.expectRevert(bytes("ALREADY FINALIZED"));
		registrar.finalizeDomain(1, "alice");
		vm.expectRevert(bytes("ALREADY FINALIZED"));
		registrar.finalizeName("alice");
		assertEq(registrar.withdrawalCredits(treasury), WINNING_BID);
		_assertAccounting();
	}

	function test_SettlementStartsAtRevealDeadlineAndRequiresFinalization() public {
		uint256 deadline = registrar.getRound(1).revealEnd;
		vm.warp(deadline - 1);
		vm.prank(bob);
		vm.expectRevert(bytes("ROUND NOT ENDED"));
		registrar.settleBid(1);
		vm.warp(deadline);
		vm.prank(bob);
		vm.expectRevert(bytes("DOMAIN NOT FINALIZED"));
		registrar.settleBid(1);
		assertFalse(registrar.getCommitment(bobId).settled);
		assertEq(registrar.totalWithdrawalCredits(), 0);
		assertEq(registrar.totalLockedDeposits(), 4 * deposit);
		registrar.finalizeDomain(1, "alice");
		vm.prank(bob);
		(uint256 refund, uint256 proceeds) = registrar.settleCommit(bobId);
		assertEq(refund, deposit - WINNING_BID);
		assertEq(proceeds, 0); // The price was credited during finalization.
		assertEq(registrar.withdrawalCredits(bob), deposit - WINNING_BID);
		assertEq(registrar.withdrawalCredits(treasury), WINNING_BID);
		assertEq(registrar.totalLockedDeposits(), 3 * deposit);
		assertTrue(registrar.getCommitmentForRound(1, bob).settled);
		_assertAccounting();
	}

	function test_LosingBidAlsoWaitsForFinalizationThenGetsFullDeposit() public {
		_end();
		vm.prank(alice);
		vm.expectRevert(bytes("DOMAIN NOT FINALIZED"));
		registrar.settleBid(1);
		assertFalse(registrar.getCommitment(aliceId).settled);
		registrar.finalizeDomain(1, "alice");
		vm.prank(alice);
		registrar.settleBid(1);
		assertEq(registrar.withdrawalCredits(alice), deposit);
		assertEq(registrar.withdrawalCredits(treasury), WINNING_BID);
		_assertAccounting();
	}

	function test_UnrevealedBidSettlesWithoutFinalizingOtherDomains() public {
		_end();
		vm.prank(dave);
		(uint256 refund, uint256 proceeds) = registrar.settleCommit(unrevealedId);
		assertEq(refund, deposit - penalty);
		assertEq(proceeds, penalty);
		assertEq(registrar.withdrawalCredits(dave), 0.099 ether);
		assertEq(registrar.withdrawalCredits(treasury), penalty);
		assertEq(registrar.getRound(1).pendingDomainCount, 1);
		assertEq(registrar.ownerOf("alice"), address(0));
		assertTrue(registrar.getCommitment(unrevealedId).settled);
		_assertAccounting();
	}

	function test_RejectedRevealFollowsNonRevealPenaltyPolicy() public {
		_end();
		vm.prank(carol);
		registrar.settleBid(1);
		DomainRegistrar.CommitmentInfo memory info = registrar.getCommitment(invalidId);
		assertFalse(info.revealed);
		assertFalse(info.valid);
		assertTrue(info.settled);
		assertEq(registrar.withdrawalCredits(carol), deposit - penalty);
		assertEq(registrar.withdrawalCredits(treasury), penalty);
		assertEq(registrar.reservedRound("invalid"), 0);
		_assertAccounting();
	}

	function test_AnotherWalletCannotSettleRecordedBid() public {
		_end();
		vm.prank(outsider);
		vm.expectRevert(bytes("NOT BIDDER"));
		registrar.settleCommit(bobId);
		vm.prank(outsider);
		vm.expectRevert(bytes("NO COMMITMENT"));
		registrar.settleBid(1);
		assertFalse(registrar.getCommitment(bobId).settled);
		assertEq(registrar.withdrawalCredits(outsider), 0);
		_assertAccounting();
	}

	function test_RejectsMissingAndRepeatedSettlementAcrossEntryPoints() public {
		_end();
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.settleBid(0);
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.settleBid(2);
		vm.expectRevert(bytes("INVALID COMMITMENT"));
		registrar.settleCommit(0);
		vm.expectRevert(bytes("INVALID COMMITMENT"));
		registrar.settleCommit(5);
		vm.prank(dave);
		registrar.settleBid(1);
		vm.startPrank(dave);
		vm.expectRevert(bytes("ALREADY SETTLED"));
		registrar.settleBid(1);
		vm.expectRevert(bytes("ALREADY SETTLED"));
		registrar.settleCommit(unrevealedId);
		vm.stopPrank();
		assertEq(registrar.withdrawalCredits(dave), deposit - penalty);
		assertEq(registrar.withdrawalCredits(treasury), penalty);
		_assertAccounting();
	}

	function test_AllDepositsRemainClaimableDuringLaterRound() public {
		_end();
		registrar.startRound();
		_commit(2, alice, "later", 0.02 ether);
		DomainRegistrar.RoundInfo memory later = registrar.getRound(2);
		registrar.finalizeDomain(1, "alice");
		_settle(alice);
		_settle(bob);
		_settle(carol);
		_settle(dave);
		assertEq(registrar.withdrawalCredits(alice), deposit);
		assertEq(registrar.withdrawalCredits(bob), deposit - WINNING_BID);
		assertEq(registrar.withdrawalCredits(carol), deposit - penalty);
		assertEq(registrar.withdrawalCredits(dave), deposit - penalty);
		assertEq(registrar.withdrawalCredits(treasury), WINNING_BID + 2 * penalty);
		assertEq(registrar.totalWithdrawalCredits(), 4 * deposit);
		assertEq(registrar.totalLockedDeposits(), deposit);
		vm.prank(bob);
		registrar.withdraw();
		vm.prank(treasury);
		registrar.withdraw();
		assertEq(registrar.totalLockedDeposits(), deposit);
		DomainRegistrar.RoundInfo memory afterClaims = registrar.getRound(2);
		assertEq(afterClaims.startTime, later.startTime);
		assertEq(afterClaims.commitEnd, later.commitEnd);
		assertEq(afterClaims.revealEnd, later.revealEnd);
		assertEq(afterClaims.pendingDomainCount, 0);
		_assertAccounting();
	}

	function _commit(uint256 roundId, address bidder, string memory label, uint256 amount) internal returns (uint256) {
		bytes32 digest = registrar.computeCommitment(roundId, bidder, label, amount, salt);
		vm.prank(bidder);
		registrar.commitBid{value: deposit}(roundId, digest);
		return registrar.getCommitmentId(roundId, bidder);
	}

	function _settle(address bidder) internal {
		vm.prank(bidder);
		registrar.settleBid(1);
	}

	function _end() internal {
		vm.warp(registrar.getRound(1).revealEnd);
	}

	function _assertAccounting() internal view {
		assertEq(address(registrar).balance, registrar.totalLockedDeposits() + registrar.totalWithdrawalCredits());
	}
}
