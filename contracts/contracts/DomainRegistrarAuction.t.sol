
// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

contract DomainRegistrarAuctionTest is Test {
    DomainRegistrar internal registrar;
    uint256 internal deposit;
    bytes32 internal salt;

    address internal alice = address(101);
    address internal bob   = address(102);
    address internal carol = address(103);

    function setUp() public {
        registrar = new DomainRegistrar(address(this));
        registrar.startRound();
        deposit   = registrar.COMMIT_DEPOSIT();
        salt      = bytes32(uint256(123));

        vm.deal(alice, 10 * deposit);
        vm.deal(bob,   10 * deposit);
        vm.deal(carol, 10 * deposit);
    }

    function test_UnknownNameHasNoAuction() public view {
        DomainRegistrar.AuctionInfo memory auction = registrar.getAuction("alice");
        assertEq(auction.roundId, 0);
        assertEq(auction.winningCommitmentId, 0);
        assertEq(auction.highestBidder, address(0));
        assertEq(auction.highestBidWei, 0);
    }

    function test_FirstValidRevealSetsLeader() public {
        uint256 id = _commitBid(1, alice, "alice", 0.004 ether);

        vm.warp(registrar.getRound(1).startTime + 120);
        assertTrue(_revealBid(id, alice, "alice", 0.004 ether));

        DomainRegistrar.AuctionInfo memory auction = registrar.getAuction("alice");

        assertEq(auction.roundId, 1);
        assertEq(auction.winningCommitmentId, id);
        assertEq(auction.highestBidder, alice);
        assertEq(auction.highestBidWei, 0.004 ether);
    }

    function test_HigherBidReplacesLeaderAndLowerBidDoesNot() public {
        uint256 aliceId = _commitBid(1, alice, "alice", 0.004 ether);
        uint256 bobId   = _commitBid(1, bob,   "alice", 0.006 ether);
        uint256 carolId = _commitBid(1, carol, "alice", 0.003 ether);

        vm.warp(registrar.getRound(1).startTime + 120);

        assertTrue(_revealBid(aliceId, alice, "alice", 0.004 ether));
        assertTrue(_revealBid(bobId,   bob,   "alice", 0.006 ether));
        assertTrue(_revealBid(carolId, carol, "alice", 0.003 ether));

        DomainRegistrar.AuctionInfo memory auction = registrar.getAuction("alice");

        assertEq(auction.winningCommitmentId, bobId);
        assertEq(auction.highestBidder, bob);
        assertEq(auction.highestBidWei, 0.006 ether);

        // note that losing a valid competition will not make the bid invalid
        assertTrue(registrar.getCommitment(aliceId).valid);
        assertTrue(registrar.getCommitment(carolId).valid);

        assertEq(registrar.totalLockedDeposits(), 3 * deposit);
        assertEq(address(registrar).balance, 3 * deposit);
    }

    function test_EarlierCommitmentWinsTieWhenRevealedLast() public {
        uint256 aliceId = _commitBid(1, alice, "alice", 0.004 ether);
        uint256 bobId   = _commitBid(1, bob,   "alice", 0.004 ether);

        vm.warp(registrar.getRound(1).startTime + 120);

        // here bob will be revealed first but alice commited earlier
        assertTrue(_revealBid(bobId,   bob,   "alice", 0.004 ether));
        assertEq(registrar.getAuction("alice").winningCommitmentId, bobId);

        assertTrue(_revealBid(aliceId, alice, "alice", 0.004 ether));
        assertEq(registrar.getAuction("alice").winningCommitmentId, aliceId);
    }

    function test_LaterCommitmentDoesNotReplaceEqualBid() public {
        uint256 aliceId = _commitBid(1, alice, "alice", 0.004 ether);
        uint256 bobId   = _commitBid(1, bob,   "alice", 0.004 ether);

        vm.warp(registrar.getRound(1).startTime + 120);

        assertTrue(_revealBid(aliceId, alice, "alice", 0.004 ether));
        assertTrue(_revealBid(bobId,   bob,   "alice", 0.004 ether));

        assertEq(registrar.getAuction("alice").winningCommitmentId, aliceId);
    }

    function test_DifferentNamesHaveSeparateLeaders() public {
        uint256 aliceId = _commitBid(1, alice, "alice", 0.004 ether);
        uint256 bobId   = _commitBid(1, bob,    "bob",  0.006 ether);

        vm.warp(registrar.getRound(1).startTime + 120);

        assertTrue(_revealBid(aliceId, alice, "alice", 0.004 ether));
        assertTrue(_revealBid(bobId,   bob,   "bob",   0.006 ether));

        assertEq(registrar.getAuction("alice").winningCommitmentId, aliceId);
        assertEq(registrar.getAuction("bob").winningCommitmentId, bobId);
    }

    function test_InvalidRevealsDoNotReserveName() public {
        uint256 uppercaseId = _commitBid(1, alice, "Alice", 0.004 ether);
		uint256 zeroId = _commitBid(1, bob, "alice", 0);
		uint256 largeId = _commitBid(1, carol, "alice", deposit + 1);
		address validBidder = address(104);
		vm.deal(validBidder, deposit);
		uint256 validId = _commitBid(1, validBidder, "alice", 0.004 ether);

        vm.warp(registrar.getRound(1).startTime + 120);

		vm.expectRevert(bytes("INVALID LABEL"));
		_revealBid(uppercaseId, alice, "Alice", 0.004 ether);
        assertEq(registrar.getAuction("Alice").roundId, 0);

		vm.expectRevert(bytes("INVALID BID"));
		_revealBid(zeroId, bob, "alice", 0);
		vm.expectRevert(bytes("INVALID BID"));
		_revealBid(largeId, carol, "alice", deposit + 1);
        assertEq(registrar.getAuction("alice").roundId, 0);

        assertTrue(_revealBid(validId, validBidder, "alice", 0.004 ether));
        assertEq(registrar.getAuction("alice").winningCommitmentId, validId);
    }

    function test_LaterRoundCannotReplaceReservedName() public {
        uint256 firstId = _commitBid(1, alice, "alice", 0.004 ether);
        uint256 start   = registrar.getRound(1).startTime;

        vm.warp(start + 120);
        assertTrue(_revealBid(firstId, alice, "alice", 0.004 ether));

        vm.warp(start + 240);
        registrar.startRound();
        uint256 laterId = _commitBid(2, bob,  "alice", 0.009 ether);

        vm.warp(start + 360);
		vm.expectRevert(bytes("NAME RESERVED"));
		_revealBid(laterId, bob, "alice", 0.009 ether);

        DomainRegistrar.AuctionInfo memory auction = registrar.getAuction("alice");

        assertEq(auction.roundId, 1);
        assertEq(auction.winningCommitmentId, firstId);
        assertEq(auction.highestBidder, alice);
        assertEq(auction.highestBidWei, 0.004 ether);

        assertFalse(registrar.getCommitment(laterId).revealed);
        assertFalse(registrar.getCommitment(laterId).valid);
    }

    function test_UnrevealedBidDoesNotReserveName() public {
        _commitBid(1, alice, "alice", 0.004 ether);

        uint256 start = registrar.getRound(1).startTime;

        // we need to make sure no one reveals in round 1
        vm.warp(start + 240);
        registrar.startRound();
        uint256 laterId = _commitBid(2, bob, "alice", 0.006 ether);

        vm.warp(start + 360);
        assertTrue(_revealBid(laterId, bob,  "alice", 0.006 ether));

        DomainRegistrar.AuctionInfo memory auction = registrar.getAuction("alice");

        assertEq(auction.roundId, 2);
        assertEq(auction.winningCommitmentId, laterId);
        assertEq(auction.highestBidder, bob);
    }

    function _commitBid(uint256 roundId , address bidder , string memory label , uint256 amount) internal returns (uint256) {
        bytes32 digest = registrar.computeCommitment(roundId,bidder,label,amount,salt);
        vm.prank(bidder);
        return registrar.commit{value: deposit}(roundId, digest);
    }

    function _revealBid(uint256 id,address bidder,string memory label,uint256 amount) internal returns (bool) {
        vm.prank(bidder);
        return registrar.reveal(id, label, amount, salt);
    }

}
