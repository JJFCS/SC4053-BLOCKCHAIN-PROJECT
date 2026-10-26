
// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

// this is a test helper - it accepts ETH , rejects it , or tries calling withdrawals again
contract WithdrawalReceiver {
    DomainRegistrar public registrar;
    bool public rejectPayments;
    bool public attemptReentry;
    bool public reentryAttempted;
    bool public refundReentrySucceeded;
    bool public treasuryReentrySucceeded;
	bool public withdrawalReentrySucceeded;
    bytes32 public refundReentryError;
    bytes32 public treasuryReentryError;
	bytes32 public withdrawalReentryError;

    constructor(DomainRegistrar target) {
        if (address(target) == address(0)) {
            registrar = new DomainRegistrar(address(this));
        } else {
            registrar = target;
        }
    }

    function configure(bool reject, bool reenter) external {
        rejectPayments = reject;
        attemptReentry = reenter;
    }

    function withdrawRefund() external returns (uint256) {
        return registrar.withdrawRefund();
    }

    function withdrawTreasury() external returns (uint256) {
        return registrar.withdrawTreasury();
    }

    receive() external payable {
        require(!rejectPayments, "RECEIVER REJECTED");

        // here we attempt each nested withdrawal once even if the guard is broken
        if (attemptReentry) {
            attemptReentry   = false;
            reentryAttempted = true;

            (bool refundSuccess,   bytes memory refundData)   = address(registrar).call(abi.encodeWithSelector(DomainRegistrar.withdrawRefund.selector));
            (bool treasurySuccess, bytes memory treasuryData) = address(registrar).call(abi.encodeWithSelector(DomainRegistrar.withdrawTreasury.selector));
			(bool withdrawalSuccess, bytes memory withdrawalData) = address(registrar).call(abi.encodeWithSelector(DomainRegistrar.withdraw.selector));

            refundReentrySucceeded   = refundSuccess;
            treasuryReentrySucceeded = treasurySuccess;
            refundReentryError       = keccak256(refundData);
            treasuryReentryError     = keccak256(treasuryData);
			withdrawalReentrySucceeded = withdrawalSuccess;
			withdrawalReentryError = keccak256(withdrawalData);
        }
    }
}

contract DomainRegistrarWithdrawalTest is Test {
    DomainRegistrar    internal registrar;
    WithdrawalReceiver internal treasuryReceiver;
    WithdrawalReceiver internal refundReceiver;
    uint256 internal deposit;
    bytes32 internal salt;

    address internal alice    = address(101);
    address internal bob      = address(102);
    address internal outsider = address(103);

    function setUp() public {
        // note that this receiver creates the registrar so it becomes its treasury
        treasuryReceiver = new WithdrawalReceiver(DomainRegistrar(address(0)));
        registrar        = treasuryReceiver.registrar();
        registrar.startRound();
        refundReceiver   = new WithdrawalReceiver(registrar);
        deposit          = registrar.COMMIT_DEPOSIT();
        salt             = bytes32(uint256(123));

        vm.deal(alice, 10 * deposit);
        vm.deal(bob, 10 * deposit);
        vm.deal(address(refundReceiver), 10 * deposit);

        uint256 aliceId    = _commitBid(1, alice, "alice", 0.004 ether);
        uint256 bobId      = _commitBid(1, bob,   "alice", 0.006 ether);
        uint256 receiverId = _commitBid(1, address(refundReceiver), "alice", 0.003 ether);

        vm.warp(registrar.getRound(1).startTime + 120);

        vm.prank(alice);
        assertTrue(registrar.reveal(aliceId,    "alice", 0.004 ether, salt));
        vm.prank(bob);
        assertTrue(registrar.reveal(bobId,      "alice", 0.006 ether, salt));
        vm.prank(address(refundReceiver));
        assertTrue(registrar.reveal(receiverId, "alice", 0.003 ether, salt));

        vm.warp(registrar.getRound(1).startTime + 240);
		registrar.finalizeDomain(1, "alice");
		vm.prank(alice);
        registrar.settleCommit(aliceId);
		vm.prank(bob);
        registrar.settleCommit(bobId);
		vm.prank(address(refundReceiver));
        registrar.settleCommit(receiverId);
    }

    function test_RefundPaysCallerAndClearsCredit() public {
        uint256 balanceBefore = alice.balance;
        uint256 refundsBefore = registrar.totalWithdrawalCredits();

        vm.prank(alice);
        uint256 paid = registrar.withdrawRefund();

        assertEq(paid, deposit);
        assertEq(alice.balance, balanceBefore + paid);
        assertEq(registrar.withdrawalCredits(alice), 0);
        assertEq(registrar.totalWithdrawalCredits(), refundsBefore - paid);
        assertEq(registrar.withdrawalCredits(bob), deposit - 0.006 ether);
        assertEq(registrar.withdrawalCredits(address(refundReceiver)), deposit);
        _assertAccounting();
    }

    function test_RejectsEmptyAndRepeatedRefunds() public {
        vm.expectRevert(bytes("NO CREDIT"));
        vm.prank(outsider);
        registrar.withdrawRefund();

        assertEq(registrar.withdrawalCredits(alice), deposit);

        vm.prank(alice);
        registrar.withdrawRefund();

        vm.expectRevert(bytes("NO CREDIT"));
        vm.prank(alice);
        registrar.withdrawRefund();
        _assertAccounting();
    }

    function test_TreasuryAccessAndRepeatedWithdrawal() public {
        vm.expectRevert(bytes("NOT TREASURY"));
        vm.prank(alice);
        registrar.withdrawTreasury();

        uint256 balanceBefore = address(treasuryReceiver).balance;
        uint256 refundsBefore = registrar.totalWithdrawalCredits();
        uint256 paid = treasuryReceiver.withdrawTreasury();

        assertEq(paid, 0.006 ether);
        assertEq(address(treasuryReceiver).balance, balanceBefore + paid);
        assertEq(registrar.withdrawalCredits(registrar.treasury()), 0);
        assertEq(registrar.totalWithdrawalCredits(), refundsBefore - paid);

        vm.expectRevert(bytes("NO CREDIT"));
        treasuryReceiver.withdrawTreasury();
        _assertAccounting();
    }

    function test_TreasuryCannotWithdrawRefundsOrLockedDeposits() public {
        registrar.startRound();
        _commitBid(2, alice, "later", 0.003 ether);
        uint256 refundsBefore = registrar.totalWithdrawalCredits();
        uint256 balanceBefore = address(registrar).balance;

        treasuryReceiver.withdrawTreasury();

        assertEq(registrar.withdrawalCredits(registrar.treasury()), 0);
        assertEq(registrar.totalLockedDeposits(), deposit);
        assertEq(registrar.totalWithdrawalCredits(), refundsBefore - 0.006 ether);
        assertEq(address(registrar).balance, balanceBefore - 0.006 ether);
        _assertAccounting();
    }

    function test_FailedRefundCanBeRetriedWithoutBlockingOthers() public {
        refundReceiver.configure(true, false);
        uint256 refundsBefore = registrar.totalWithdrawalCredits();
        uint256 balanceBefore = address(registrar).balance;

        vm.expectRevert(bytes("ETH TRANSFER FAILED"));
        refundReceiver.withdrawRefund();

        assertEq(registrar.withdrawalCredits(address(refundReceiver)), deposit);
        assertEq(registrar.totalWithdrawalCredits(), refundsBefore);
        assertEq(address(registrar).balance, balanceBefore);

        // here alice can still withdraw while the other receiver rejects payments
        vm.prank(alice);
        registrar.withdrawRefund();
        assertEq(registrar.withdrawalCredits(alice), 0);
        _assertAccounting();

        refundReceiver.configure(false, false);
        uint256 receiverBalanceBefore = address(refundReceiver).balance;
        uint256 paid = refundReceiver.withdrawRefund();

        assertEq(paid, deposit);
        assertEq(address(refundReceiver).balance, receiverBalanceBefore + paid);
        assertEq(registrar.withdrawalCredits(address(refundReceiver)), 0);
        _assertAccounting();
    }

    function test_FailedTreasuryPaymentCanBeRetried() public {
        treasuryReceiver.configure(true, false);
        uint256 refundsBefore = registrar.totalWithdrawalCredits();
        uint256 balanceBefore = address(registrar).balance;

        vm.expectRevert(bytes("ETH TRANSFER FAILED"));
        treasuryReceiver.withdrawTreasury();

        assertEq(registrar.withdrawalCredits(registrar.treasury()), 0.006 ether);
        assertEq(registrar.totalWithdrawalCredits(), refundsBefore);
        assertEq(address(registrar).balance, balanceBefore);

        vm.prank(alice);
        registrar.withdrawRefund();

        treasuryReceiver.configure(false, false);
        uint256 paid = treasuryReceiver.withdrawTreasury();

        assertEq(paid, 0.006 ether);
        assertEq(registrar.withdrawalCredits(registrar.treasury()), 0);
        _assertAccounting();
    }

    function test_RefundCallbackCannotReenterWithdrawals() public {
        refundReceiver.configure(false, true);
        uint256 balanceBefore = address(refundReceiver).balance;

        uint256 paid = refundReceiver.withdrawRefund();

        assertEq(paid, deposit);
        assertEq(address(refundReceiver).balance, balanceBefore + paid);
        assertEq(registrar.withdrawalCredits(address(refundReceiver)), 0);
        _assertReentryBlocked(refundReceiver);
        _assertAccounting();
    }

    function test_TreasuryCallbackCannotReenterWithdrawals() public {
        treasuryReceiver.configure(false, true);
        uint256 balanceBefore = address(treasuryReceiver).balance;
        uint256 paid = treasuryReceiver.withdrawTreasury();

        assertEq(paid, 0.006 ether);
        assertEq(address(treasuryReceiver).balance, balanceBefore + paid);
        assertEq(registrar.withdrawalCredits(registrar.treasury()), 0);
        _assertReentryBlocked(treasuryReceiver);
        _assertAccounting();
    }

    function test_AllCreditsCanBeWithdrawn() public {
        treasuryReceiver.withdrawTreasury();
        _assertAccounting();
        refundReceiver.withdrawRefund();
        _assertAccounting();

        vm.prank(bob);
        registrar.withdrawRefund();
        _assertAccounting();
        vm.prank(alice);
        registrar.withdrawRefund();

        assertEq(registrar.totalLockedDeposits(), 0);
        assertEq(registrar.totalWithdrawalCredits(), 0);
        assertEq(registrar.withdrawalCredits(registrar.treasury()), 0);
        assertEq(address(registrar).balance, 0);
        _assertAccounting();
    }

    function _commitBid(uint256 roundId,address bidder,string memory label,uint256 amount) internal returns (uint256) {
        bytes32 digest = registrar.computeCommitment(roundId, bidder, label, amount, salt);
        vm.prank(bidder);
        return registrar.commit{value: deposit}(roundId, digest);
    }

    function _assertReentryBlocked(WithdrawalReceiver receiver) internal view {
        bytes32 expectedError = keccak256(
            abi.encodeWithSignature("Error(string)", "REENTRANT WITHDRAWAL")
        );

        assertTrue(receiver.reentryAttempted());
        assertFalse(receiver.refundReentrySucceeded());
        assertFalse(receiver.treasuryReentrySucceeded());
		assertFalse(receiver.withdrawalReentrySucceeded());
        assertEq(receiver.refundReentryError(), expectedError);
        assertEq(receiver.treasuryReentryError(), expectedError);
		assertEq(receiver.withdrawalReentryError(), expectedError);
    }

    function _assertAccounting() internal view {
        uint256 accountedFor = registrar.totalLockedDeposits() + registrar.totalWithdrawalCredits();
        assertEq(address(registrar).balance, accountedFor);
    }
}
