
// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

contract DomainRegistrarOwnershipTest is Test {
    DomainRegistrar internal registrar;
    uint256         internal deposit;
    uint256         internal winningId;
    bytes32         internal salt;
    address         internal alice    = address(101);
    address         internal bob      = address(102);
    address         internal outsider = address(103);

    function setUp() public {
        registrar = new DomainRegistrar();
        deposit   = registrar.COMMIT_DEPOSIT();
        salt      = bytes32(uint256(123));

        vm.deal(alice, 10 * deposit);
        vm.deal(bob,   10 * deposit);

        uint256 aliceId = _commitBid(1, alice, "alice", 0.004 ether);
        winningId       = _commitBid(1, bob,   "alice", 0.006 ether);

        vm.warp(registrar.auctionStart() + 120);

        vm.prank(alice);
        assertTrue(registrar.reveal(aliceId,   "alice", 0.004 ether, salt));

        vm.prank(bob);
        assertTrue(registrar.reveal(winningId, "alice", 0.006 ether, salt));
    }

    function test_PendingAndUnknownNamesHaveNoOwner() public view {
        assertEq(registrar.resolve("alice"), address(0));
        assertEq(registrar.resolve("bob"),   address(0));

        assertEq(registrar.getDomain("alice").owner,address(0));
        assertEq(registrar.getDomain("bob").owner,  address(0));
    }

    function test_FinalizationStartsAt240Seconds() public {
        uint256 start = registrar.auctionStart();

        vm.warp(start + 239);

        vm.expectRevert(bytes("ROUND NOT ENDED"));
        registrar.finalizeName("alice");

        assertEq(registrar.resolve("alice"), address(0));

        vm.warp(start + 240);

        address owner = registrar.finalizeName("alice");

        DomainRegistrar.DomainInfo memory domain = registrar.getDomain("alice");

        assertEq(owner, bob);
        assertEq(domain.owner, bob);
        assertEq(domain.roundId, 1);
        assertEq(domain.winningCommitmentId, winningId);
        assertEq(domain.priceWei, 0.006 ether);
        assertEq(registrar.resolve("alice"), bob);

        // the finalization records ownership without moving deposits
        assertEq(registrar.totalLockedDeposits(), 2 * deposit);
        assertEq(address(registrar).balance,      2 * deposit);
    }

    function test_AnyoneCanFinalizeForWinningBidder() public {
        vm.warp(registrar.auctionStart() + 240);
        vm.prank(outsider);
        address owner = registrar.finalizeName("alice");

        assertEq(owner, bob);
        assertEq(registrar.resolve("alice"), bob);
    }

    function test_RejectsSecondFinalization() public {
        vm.warp(registrar.auctionStart() + 240);
        registrar.finalizeName("alice");
        vm.expectRevert(bytes("ALREADY FINALIZED"));
        registrar.finalizeName("alice");
        assertEq(registrar.resolve("alice"), bob);
    }

    function test_RejectsInvalidAndUnknownNames() public {
        vm.warp(registrar.auctionStart() + 240);

        vm.expectRevert(bytes("INVALID LABEL"));
        registrar.finalizeName("Alice");

        vm.expectRevert(bytes("INVALID LABEL"));
        registrar.finalizeName("alice.ntu");

        vm.expectRevert(bytes("NO WINNING BID"));
        registrar.finalizeName("bob");

        assertEq(registrar.resolve("alice"), address(0));
    }

    function test_CanFinalizeAnOlderRound() public {
        vm.warp(registrar.auctionStart() + 977);

        assertEq(registrar.getCurrentRound(), 5);

        registrar.finalizeName("alice");

        assertEq(registrar.resolve("alice"), bob);
        assertEq(registrar.getDomain("alice").roundId, 1);
    }

    function test_RegisteredNameCannotBeTakenByLaterRound() public {
        uint256 start = registrar.auctionStart();

        vm.warp(start + 240);
        registrar.finalizeName("alice");

        uint256 laterId = _commitBid(2, alice, "alice", 0.009 ether);

        vm.warp(start + 360);

        vm.prank(alice);
        bool valid = registrar.reveal(laterId,"alice",0.009 ether,salt);

        assertFalse(valid);
        assertTrue(registrar.getCommitment(laterId).revealed);
        assertFalse(registrar.getCommitment(laterId).valid);

        assertEq(registrar.resolve("alice"), bob);
        assertEq(registrar.getDomain("alice").winningCommitmentId,winningId);
    }

    function test_WithoutValidRevealThereIsNoOwner() public {
        // use another registrar to test names without a valid reveal
        DomainRegistrar otherRegistrar = new DomainRegistrar();
        uint256 start = otherRegistrar.auctionStart();

        bytes32 unopenedDigest = otherRegistrar.computeCommitment(1, alice, "unopened", 0.004 ether, salt);
        bytes32 invalidDigest = otherRegistrar.computeCommitment(1, alice, "invalid", 0, salt);

        vm.prank(alice);
        otherRegistrar.commit{value: deposit}(1, unopenedDigest);

        vm.prank(alice);
        uint256 invalidId = otherRegistrar.commit{value: deposit}(1,invalidDigest);

        vm.warp(start + 120);

        vm.prank(alice);
        bool valid = otherRegistrar.reveal(invalidId,"invalid",0,salt);
        assertFalse(valid);

        vm.warp(start + 240);

        vm.expectRevert(bytes("NO WINNING BID"));
        otherRegistrar.finalizeName("unopened");

        vm.expectRevert(bytes("NO WINNING BID"));
        otherRegistrar.finalizeName("invalid");

        assertEq(otherRegistrar.resolve("unopened"), address(0));
        assertEq(otherRegistrar.resolve("invalid"),  address(0));
    }

    function _commitBid(uint256 roundId,address bidder,string memory label,uint256 amount) internal returns (uint256) {
        bytes32 digest = registrar.computeCommitment(roundId,bidder,label,amount,salt);
        vm.prank(bidder);
        return registrar.commit{value: deposit}(roundId, digest);
    }
}
