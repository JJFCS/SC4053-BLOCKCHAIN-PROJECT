
// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

contract DomainRegistrarSettlementTest is Test {
    DomainRegistrar internal registrar;
    uint256         internal deposit;
    bytes32         internal salt;
    uint256         internal aliceId;
    uint256         internal bobId;
    uint256         internal invalidId;
    uint256         internal unrevealedId;
    address         internal alice    = address(101);
    address         internal bob      = address(102);
    address         internal carol    = address(103);
    address         internal dave     = address(104);
    address         internal outsider = address(105);

    function setUp() public {
        registrar = new DomainRegistrar();
        registrar.startRound();
        deposit   = registrar.COMMIT_DEPOSIT();
        salt      = bytes32(uint256(123));

        vm.deal(alice, 10 * deposit);
        vm.deal(bob,   10 * deposit);
        vm.deal(carol, 10 * deposit);
        vm.deal(dave,  10 * deposit);

        aliceId      = _commitBid(alice, "alice", 0.004 ether);
        bobId        = _commitBid(bob, "alice", 0.006 ether);
        invalidId    = _commitBid(carol, "invalid", 0);
        unrevealedId = _commitBid(dave, "unopened", 0.003 ether);

        vm.warp(registrar.getRound(1).startTime + 120);

        vm.prank(alice);assertTrue(registrar.reveal(aliceId, "alice", 0.004 ether, salt));
        vm.prank(bob);assertTrue(registrar.reveal(bobId, "alice", 0.006 ether, salt));
        vm.prank(carol);
		vm.expectRevert(bytes("INVALID BID"));
		registrar.reveal(invalidId, "invalid", 0, salt);
    }

    function test_SettlementStartsAt240SecondsAndCreditsWinner() public {
        uint256 start = registrar.getRound(1).startTime;

        vm.warp(start + 239);
        vm.expectRevert(bytes("ROUND NOT ENDED"));
        registrar.settleCommit(bobId);

        assertFalse(registrar.getCommitment(bobId).settled);
        assertEq(registrar.totalLockedDeposits(), 4 * deposit);

        vm.warp(start + 240);

        vm.prank(outsider);
        (uint256 refund, uint256 proceeds) = registrar.settleCommit(bobId);

        assertEq(refund, 0.004 ether);
        assertEq(proceeds, 0.006 ether);
        assertEq(registrar.refundCredits(bob), 0.004 ether);
        assertEq(registrar.refundCredits(outsider), 0);
        assertEq(registrar.totalRefundCredits(), 0.004 ether);
        assertEq(registrar.treasuryCredit(), 0.006 ether);
        assertEq(registrar.totalLockedDeposits(), 3 * deposit);
        assertTrue(registrar.getCommitment(bobId).settled);

        // the settlement records credits without sending eth
        assertEq(bob.balance, 9 * deposit);
        assertEq(address(registrar).balance, 4 * deposit);

        _assertAccounting();
    }

    function test_ValidLoserGetsFullDeposit() public {
        vm.warp(registrar.getRound(1).startTime + 240);

        (uint256 refund, uint256 proceeds) = registrar.settleCommit(aliceId);

        assertEq(refund, deposit);
        assertEq(proceeds, 0);
        assertEq(registrar.refundCredits(alice), deposit);
        assertEq(registrar.totalRefundCredits(), deposit);
        assertEq(registrar.treasuryCredit(), 0);
        assertTrue(registrar.getCommitment(aliceId).valid);
        assertTrue(registrar.getCommitment(aliceId).settled);

        _assertAccounting();
    }

    function test_RejectedRevealRemainsUnrevealedAtSettlement() public {
        vm.warp(registrar.getRound(1).startTime + 240);

        (uint256 refund, uint256 proceeds) = registrar.settleCommit(invalidId);

		// This step changes reveal validation. Non-reveal economics are updated next.
        assertEq(refund, 0);
        assertEq(proceeds, deposit);
        assertEq(registrar.refundCredits(carol), 0);
        assertEq(registrar.treasuryCredit(), deposit);

        DomainRegistrar.CommitmentInfo memory info = registrar.getCommitment(invalidId);

        assertFalse(info.revealed);
        assertFalse(info.valid);
        assertTrue(info.settled);

        _assertAccounting();
    }

    function test_UnrevealedDepositBecomesTreasuryCredit() public {
        vm.warp(registrar.getRound(1).startTime + 240);

        vm.prank(outsider);
        (uint256 refund, uint256 proceeds) = registrar.settleCommit(unrevealedId);

        assertEq(refund, 0);
        assertEq(proceeds, deposit);
        assertEq(registrar.refundCredits(dave), 0);
        assertEq(registrar.refundCredits(outsider), 0);
        assertEq(registrar.totalRefundCredits(), 0);
        assertEq(registrar.treasuryCredit(), deposit);
        assertEq(registrar.treasury(), address(this));
        assertTrue(registrar.getCommitment(unrevealedId).settled);
        assertFalse(registrar.getCommitment(unrevealedId).revealed);

        _assertAccounting();
    }

    function test_RejectsUnknownAndRepeatedSettlement() public {
        vm.warp(registrar.getRound(1).startTime + 240);

        uint256 unknownId = registrar.commitmentCount() + 1;

        vm.expectRevert(bytes("INVALID COMMITMENT"));
        registrar.settleCommit(0);

        vm.expectRevert(bytes("INVALID COMMITMENT"));
        registrar.settleCommit(unknownId);

        registrar.settleCommit(bobId);

        vm.expectRevert(bytes("ALREADY SETTLED"));
        registrar.settleCommit(bobId);

        assertEq(registrar.refundCredits(bob), 0.004 ether);
        assertEq(registrar.treasuryCredit(), 0.006 ether);
        assertEq(registrar.totalLockedDeposits(), 3 * deposit);

        _assertAccounting();
    }

    function test_CanSettleBeforeFinalizing() public {
        vm.warp(registrar.getRound(1).startTime + 240);

        registrar.settleCommit(bobId);
        assertEq(registrar.resolve("alice"), address(0));

        registrar.finalizeName("alice");

        assertEq(registrar.resolve("alice"), bob);
        assertEq(registrar.refundCredits(bob), 0.004 ether);
        assertEq(registrar.treasuryCredit(), 0.006 ether);

        _assertAccounting();
    }

    function test_CanSettleAfterFinalizing() public {
        vm.warp(registrar.getRound(1).startTime + 240);

        registrar.finalizeName("alice");
        registrar.settleCommit(bobId);

        assertEq(registrar.resolve("alice"), bob);
        assertEq(registrar.refundCredits(bob), 0.004 ether);
        assertEq(registrar.treasuryCredit(), 0.006 ether);

        _assertAccounting();
    }

    function test_AllDepositsRemainAccountedForInLaterRound() public {
        // Explicitly start rounds 2-5 while the original round's work remains pending.
        for (uint256 i = 0; i < 4; ++i) {
            uint256 deadline = registrar.getRound(registrar.getCurrentRound()).revealEnd;
            vm.warp(deadline);
            registrar.startRound();
        }
        vm.warp(registrar.getRound(1).startTime + 977);

        assertEq(registrar.getCurrentRound(), 5);

        registrar.settleCommit(unrevealedId);
        registrar.settleCommit(invalidId);
        registrar.settleCommit(aliceId);
        registrar.settleCommit(bobId);

        assertEq(registrar.totalLockedDeposits(), 0);
        assertEq(registrar.refundCredits(alice), deposit);
        assertEq(registrar.refundCredits(bob), 0.004 ether);
        assertEq(registrar.refundCredits(carol), 0);
        assertEq(registrar.refundCredits(dave), 0);

        assertEq(registrar.totalRefundCredits(),deposit + 0.004 ether);
        assertEq(registrar.treasuryCredit(),2 * deposit + 0.006 ether);
        assertEq(address(registrar).balance, 4 * deposit);

        _assertAccounting();
    }

    function _commitBid(address bidder,string memory label,uint256 amount) internal returns (uint256) {
        bytes32 digest = registrar.computeCommitment(1,bidder,label,amount,salt);
        vm.prank(bidder);
        return registrar.commit{value: deposit}(1, digest);
    }

    function _assertAccounting() internal view {
        uint256 accountedFor = registrar.totalLockedDeposits() + registrar.totalRefundCredits() + registrar.treasuryCredit();
        assertEq(address(registrar).balance, accountedFor);
    }
}
