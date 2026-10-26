// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

// this is a test helper only - accepts ETH , rejects it , or tries nested calls
contract DomainPaymentReceiver {
    DomainRegistrar public registrar;
    bool public rejectPayments;
    bool public attemptReentry;
    bool public reentryAttempted;
    bool public paymentReentrySucceeded;
    bool public refundReentrySucceeded;
    bool public treasuryReentrySucceeded;
    bytes32 public paymentReentryError;
    bytes32 public refundReentryError;
    bytes32 public treasuryReentryError;

    constructor(DomainRegistrar target) {
        if (address(target) == address(0)) {
            registrar = new DomainRegistrar();
        } else {
            registrar = target;
        }
    }

    function configure(bool reject, bool reenter) external {
        rejectPayments = reject;
        attemptReentry = reenter;
    }

    function withdrawRefund()   external returns (uint256) {
        return registrar.withdrawRefund();
    }

    function withdrawTreasury() external returns (uint256) {
        return registrar.withdrawTreasury();
    }

    receive() external payable {
        require(!rejectPayments, "RECEIVER REJECTED");
        if (!attemptReentry) return;

        // we attempt each call once and do not recurse forever if a guard is missing
        attemptReentry   = false;
        reentryAttempted = true;

        (bool paymentSuccess, bytes memory paymentData) = address(registrar).call{value: 1}(
            abi.encodeWithSelector(
                DomainRegistrar.sendToDomain.selector, "alice", address(this)
            )
        );
        (bool refundSuccess, bytes memory refundData) = address(registrar).call(
            abi.encodeWithSelector(DomainRegistrar.withdrawRefund.selector)
        );
        (bool treasurySuccess, bytes memory treasuryData) = address(registrar).call(
            abi.encodeWithSelector(DomainRegistrar.withdrawTreasury.selector)
        );

        paymentReentrySucceeded  = paymentSuccess;
        refundReentrySucceeded   = refundSuccess;
        treasuryReentrySucceeded = treasurySuccess;
        paymentReentryError      = keccak256(paymentData);
        refundReentryError       = keccak256(refundData);
        treasuryReentryError     = keccak256(treasuryData);
    }
}

contract DomainRegistrarPaymentsTest is Test {
    DomainRegistrar internal registrar;
    DomainPaymentReceiver internal treasuryReceiver;
    DomainPaymentReceiver internal paymentReceiver;
    uint256 internal deposit;
    uint256 internal winningId;
    bytes32 internal salt;
    uint256 internal constant WINNING_BID = 0.006 ether;

    address internal owner = address(101);
    address internal loser = address(102);
    address internal payer = address(103);
    address internal replacement   = address(104);
    address internal pendingBidder = address(105);

    event DomainPayment(bytes32 indexed labelHash, address indexed sender, address indexed recipient, string label, uint256 amountWei);

    function setUp() public {
        treasuryReceiver = new DomainPaymentReceiver(DomainRegistrar(address(0)));
        registrar        = treasuryReceiver.registrar();
        paymentReceiver  = new DomainPaymentReceiver(registrar);
        deposit          = registrar.COMMIT_DEPOSIT();
        salt             = bytes32(uint256(123));  // note that fixed salt is for these local tests only

        vm.deal(owner, 10 ether);
        vm.deal(loser, 10 ether);
        vm.deal(payer, 10 ether);
        vm.deal(pendingBidder, 10 ether);
        vm.deal(address(paymentReceiver), 10 ether);
        vm.deal(address(treasuryReceiver), 10 ether);

        winningId          = _commitBid(owner, "alice", WINNING_BID);
        uint256 loserId    = _commitBid(loser, "alice", 0.004 ether);
        uint256 receiverId = _commitBid(address(paymentReceiver), "alice", 0.003 ether);
        uint256 treasuryId = _commitBid(address(treasuryReceiver), "alice", 0.002 ether);
        uint256 pendingId  = _commitBid(pendingBidder, "pending", 0.005 ether);

        vm.warp(registrar.auctionStart() + 120);
        vm.prank(owner);
        assertTrue(registrar.reveal(winningId,  "alice",   WINNING_BID, salt));
        vm.prank(loser);
        assertTrue(registrar.reveal(loserId,    "alice",   0.004 ether, salt));
        vm.prank(address(paymentReceiver));
        assertTrue(registrar.reveal(receiverId, "alice",   0.003 ether, salt));
        vm.prank(address(treasuryReceiver));
        assertTrue(registrar.reveal(treasuryId, "alice",   0.002 ether, salt));
        vm.prank(pendingBidder);
        assertTrue(registrar.reveal(pendingId,  "pending", 0.005 ether, salt));

        vm.warp(registrar.auctionStart() + 240);
        registrar.finalizeName("alice");
        registrar.settleCommit(winningId);
        registrar.settleCommit(loserId);
        registrar.settleCommit(receiverId);
        registrar.settleCommit(treasuryId);
        // Leave "pending" reserved and its deposit locked to test escrow isolation
        _pointAliceTo(address(paymentReceiver));
    }

    function test_ForwardsExactValueAndEmitsPayment() public {
        uint256 amount          = 0.003000000000000001 ether;
        uint256 receiverBefore  = address(paymentReceiver).balance;
        uint256 payerBefore     = payer.balance;
        uint256 registrarBefore = address(registrar).balance;

        vm.expectEmit(true, true, true, true, address(registrar));
        emit DomainPayment(
            keccak256(bytes("alice")), payer, address(paymentReceiver), "alice", amount
        );
        _send(address(paymentReceiver), amount);

        assertEq(address(paymentReceiver).balance, receiverBefore + amount);
        assertEq(payer.balance, payerBefore - amount);
        assertEq(address(registrar).balance, registrarBefore);
        _assertOriginalCredits();
    }

    function test_OneWeiPaymentSucceeds() public {
        uint256 receiverBefore = address(paymentReceiver).balance;
        _send(address(paymentReceiver), 1);
        assertEq(address(paymentReceiver).balance, receiverBefore + 1);
        _assertOriginalCredits();
    }

    function test_UsesUpdatedAddressAfterFreshConfirmation() public {
        _pointAliceTo(replacement);
        uint256 oldReceiverBefore = address(paymentReceiver).balance;
        uint256 newReceiverBefore = replacement.balance;
        _send(replacement, 0.002 ether);

        assertEq(replacement.balance, newReceiverBefore + 0.002 ether);
        assertEq(address(paymentReceiver).balance, oldReceiverBefore);
        assertEq(registrar.ownerOf("alice"), owner);
        assertEq(registrar.resolve("alice"), replacement);
        _assertOriginalCredits();
    }

    function test_RejectsStaleRecipientWithoutPayingEitherAddress() public {
        address previewed = registrar.resolve("alice");
        _pointAliceTo(replacement);
        uint256 oldReceiverBefore = previewed.balance;
        uint256 newReceiverBefore = replacement.balance;
        uint256 payerBefore = payer.balance;
        uint256 registrarBefore = address(registrar).balance;

        vm.expectRevert(bytes("RECIPIENT CHANGED"));
        _send(previewed, 0.002 ether);

        assertEq(previewed.balance, oldReceiverBefore);
        assertEq(replacement.balance, newReceiverBefore);
        assertEq(payer.balance, payerBefore);
        assertEq(address(registrar).balance, registrarBefore);
        _assertOriginalCredits();
    }

    function test_RejectsZeroPayment() public {
        vm.expectRevert(bytes("ZERO PAYMENT"));
        _send(address(paymentReceiver), 0);
        _assertOriginalCredits();
    }

    function test_RejectsInvalidLabels() public {
        vm.expectRevert(bytes("INVALID LABEL"));
        vm.prank(payer);
        registrar.sendToDomain{value: 1}("Alice", address(paymentReceiver));

        vm.expectRevert(bytes("INVALID LABEL"));
        vm.prank(payer);
        registrar.sendToDomain{value: 1}("alice.ntu", address(paymentReceiver));

        vm.expectRevert(bytes("INVALID LABEL"));
        vm.prank(payer);
        registrar.sendToDomain{value: 1}("", address(paymentReceiver));
        _assertOriginalCredits();
    }

    function test_RejectsAvailableName() public {
        vm.expectRevert(bytes("UNREGISTERED NAME"));
        vm.prank(payer);
        registrar.sendToDomain{value: 1}("unknown", address(paymentReceiver));
        _assertOriginalCredits();
    }

    function test_RejectsReservedNameEvenAfterRevealDeadline() public {
        assertEq(registrar.ownerOf("pending"), address(0));
        assertEq(registrar.reservedRound("pending"), 1);
        assertEq(registrar.resolve("pending"), address(0));

        vm.expectRevert(bytes("UNREGISTERED NAME"));
        vm.prank(payer);
        registrar.sendToDomain{value: 1}("pending", pendingBidder);
        _assertOriginalCredits();
    }

    function test_RejectsIncorrectExpectedRecipients() public {
        vm.expectRevert(bytes("RECIPIENT CHANGED"));
        _send(address(0), 1);
        vm.expectRevert(bytes("RECIPIENT CHANGED"));
        _send(address(registrar), 1);
        vm.expectRevert(bytes("RECIPIENT CHANGED"));
        _send(replacement, 1);
        _assertOriginalCredits();
    }

    function test_RejectingReceiverRevertsPaymentAndAllowsRetry() public {
        paymentReceiver.configure(true, false);
        uint256 receiverBefore  = address(paymentReceiver).balance;
        uint256 payerBefore     = payer.balance;
        uint256 registrarBefore = address(registrar).balance;

        vm.expectRevert(bytes("ETH TRANSFER FAILED"));
        _send(address(paymentReceiver), 0.002 ether);

        assertEq(address(paymentReceiver).balance, receiverBefore);
        assertEq(payer.balance, payerBefore);
        assertEq(address(registrar).balance, registrarBefore);
        _assertOriginalCredits();

        paymentReceiver.configure(false, false);
        _send(address(paymentReceiver), 0.002 ether);
        assertEq(address(paymentReceiver).balance, receiverBefore + 0.002 ether);
        _assertOriginalCredits();
    }

    function test_RejectingReceiverDoesNotBlockAnotherDomain() public {
        paymentReceiver.configure(true, false);
        vm.expectRevert(bytes("ETH TRANSFER FAILED"));
        _send(address(paymentReceiver), 1);

        registrar.finalizeName("pending");
        uint256 recipientBefore = pendingBidder.balance;
        vm.prank(payer);
        registrar.sendToDomain{value: 0.002 ether}("pending", pendingBidder);

        assertEq(pendingBidder.balance, recipientBefore + 0.002 ether);
        _assertOriginalCredits();
    }

    function test_ExtraEtherInRegistrarIsNotForwarded() public {
        // note we are simulating extra ETH arriving independently of the registra's functions
        vm.deal(address(registrar), address(registrar).balance + 7);
        uint256 registrarBefore   = address(registrar).balance;
        uint256 receiverBefore    = address(paymentReceiver).balance;
        _send(address(paymentReceiver), 0.002 ether);

        assertEq(address(registrar).balance, registrarBefore);
        assertEq(address(paymentReceiver).balance, receiverBefore + 0.002 ether);
        _assertOriginalCredits();
        assertEq(address(registrar).balance, _accountedFor() + 7);
    }

    function test_PaymentCallbackCannotReenterPaymentsOrWithdrawals() public {
        paymentReceiver.configure(false, true);
        uint256 registrarBefore = address(registrar).balance;
        uint256 receiverBefore  = address(paymentReceiver).balance;
        _send(address(paymentReceiver), 0.002 ether);

        assertEq(address(paymentReceiver).balance, receiverBefore + 0.002 ether);
        assertEq(address(registrar).balance, registrarBefore);
        _assertReentryBlocked(paymentReceiver);
        _assertOriginalCredits();
    }

    function test_PaymentToTreasuryCannotWithdrawItsCredit() public {
        _pointAliceTo(address(treasuryReceiver));
        treasuryReceiver.configure(false, true);
        uint256 registrarBefore = address(registrar).balance;
        uint256 receiverBefore  = address(treasuryReceiver).balance;
        _send(address(treasuryReceiver), 0.002 ether);

        assertEq(address(treasuryReceiver).balance, receiverBefore + 0.002 ether);
        assertEq(address(registrar).balance, registrarBefore);
        _assertReentryBlocked(treasuryReceiver);
        _assertOriginalCredits();
    }

    function test_RefundCallbackCannotEnterDomainPayments() public {
        paymentReceiver.configure(false, true);
        uint256 registrarBefore = address(registrar).balance;
        uint256 receiverBefore  = address(paymentReceiver).balance;
        uint256 refundsBefore   = registrar.totalRefundCredits();
        uint256 paid            = paymentReceiver.withdrawRefund();

        assertEq(paid, deposit);
        assertEq(address(paymentReceiver).balance, receiverBefore + paid);
        assertEq(address(registrar).balance, registrarBefore - paid);
        assertEq(registrar.refundCredits(address(paymentReceiver)), 0);
        assertEq(registrar.totalRefundCredits(), refundsBefore - paid);
        assertEq(registrar.treasuryCredit(), WINNING_BID);
        assertEq(registrar.totalLockedDeposits(), deposit);
        _assertReentryBlocked(paymentReceiver);
        _assertAccounting();
    }

    function test_TreasuryCallbackCannotEnterDomainPayments() public {
        _pointAliceTo(address(treasuryReceiver));
        treasuryReceiver.configure(false, true);
        uint256 registrarBefore = address(registrar).balance;
        uint256 receiverBefore  = address(treasuryReceiver).balance;
        uint256 refundsBefore   = registrar.totalRefundCredits();
        uint256 paid            = treasuryReceiver.withdrawTreasury();

        assertEq(paid, WINNING_BID);
        assertEq(address(treasuryReceiver).balance, receiverBefore + paid);
        assertEq(address(registrar).balance, registrarBefore - paid);
        assertEq(registrar.treasuryCredit(), 0);
        assertEq(registrar.refundCredits(address(treasuryReceiver)), deposit);
        assertEq(registrar.totalRefundCredits(), refundsBefore);
        assertEq(registrar.totalLockedDeposits(), deposit);
        _assertReentryBlocked(treasuryReceiver);
        _assertAccounting();
    }

    function _commitBid(address bidder, string memory label, uint256 bidWei) internal returns (uint256) {
        bytes32 digest = registrar.computeCommitment(1, bidder, label, bidWei, salt);
        vm.prank(bidder);
        return registrar.commit{value: deposit}(1, digest);
    }

    function _pointAliceTo(address target) internal {
        vm.prank(owner);
        registrar.setAddress("alice", target);
    }

    function _send(address expectedRecipient, uint256 amount) internal {
        vm.prank(payer);
        registrar.sendToDomain{value: amount}("alice", expectedRecipient);
    }

    function _assertReentryBlocked(DomainPaymentReceiver receiver) internal view {
        bytes32 expectedError = keccak256(abi.encodeWithSignature("Error(string)", "REENTRANT WITHDRAWAL"));
        assertTrue(receiver.reentryAttempted());
        assertFalse(receiver.paymentReentrySucceeded());
        assertFalse(receiver.refundReentrySucceeded());
        assertFalse(receiver.treasuryReentrySucceeded());
        assertEq(receiver.paymentReentryError(), expectedError);
        assertEq(receiver.refundReentryError(), expectedError);
        assertEq(receiver.treasuryReentryError(), expectedError);
    }

    function _assertOriginalCredits() internal view {
        assertEq(registrar.totalLockedDeposits(), deposit);
        assertEq(registrar.totalRefundCredits(), 4 * deposit - WINNING_BID);
        assertEq(registrar.treasuryCredit(), WINNING_BID);
        assertEq(registrar.refundCredits(owner), deposit - WINNING_BID);
        assertEq(registrar.refundCredits(loser), deposit);
        assertEq(registrar.refundCredits(address(paymentReceiver)), deposit);
        assertEq(registrar.refundCredits(address(treasuryReceiver)), deposit);
        assertEq(registrar.refundCredits(payer), 0);
        assertEq(registrar.refundCredits(pendingBidder), 0);
        assertEq(registrar.commitmentCount(), 5);
        _assertAccounting();
    }

    function _accountedFor() internal view returns (uint256) {
        return registrar.totalLockedDeposits() + registrar.totalRefundCredits() + registrar.treasuryCredit();
    }

    function _assertAccounting() internal view {
        // extra unsolicited eth is allowed and existing obligations must stay funded
        assertGe(address(registrar).balance, _accountedFor());
    }
}
