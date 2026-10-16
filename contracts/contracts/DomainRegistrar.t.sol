
// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

contract DomainRegistrarTest is Test {
    DomainRegistrar internal registrar;

    function setUp() public {
        registrar = new DomainRegistrar();
    }

    function test_AcceptsCanonicalLabels() public view {
        assertTrue(registrar.isValidLabel("alice"));  // we ask the registrar whether the value "alice" is valid otherwise it will fail
        assertTrue(registrar.isValidLabel("a"));
        assertTrue(registrar.isValidLabel("0"));
        assertTrue(registrar.isValidLabel("alice123"));
        assertTrue(registrar.isValidLabel("alice-bob"));
        assertTrue(registrar.isValidLabel("a--b"));
    }

    function test_Accepts32ByteLabel() public view {
        assertTrue(
            registrar.isValidLabel("abcdefghijklmnopqrstuvwxyz123456")
        );
    }

    function test_RejectsEmptyAnd33ByteLabels() public view {
        assertFalse(registrar.isValidLabel(""));
        assertFalse(
            registrar.isValidLabel("abcdefghijklmnopqrstuvwxyz1234567")
        );
    }

    function test_RejectsUppercaseAndSuffix() public view {
        assertFalse(registrar.isValidLabel("Alice"));
        assertFalse(registrar.isValidLabel("alice.ntu"));
    }

    function test_RejectsWhitespaceAndPunctuation() public view {
        assertFalse(registrar.isValidLabel(" alice"));
        assertFalse(registrar.isValidLabel("alice "));
        assertFalse(registrar.isValidLabel("ali ce"));
        assertFalse(registrar.isValidLabel("alice_bob"));
        assertFalse(registrar.isValidLabel("alice/bob"));
    }

    function test_RejectsNonAsciiLabels() public view {
        assertFalse(registrar.isValidLabel(unicode"álîce"));
        assertFalse(registrar.isValidLabel(unicode"张三"));
    }

    function test_RejectsHyphensAtEdges() public view {
        assertFalse(registrar.isValidLabel("-alice"));
        assertFalse(registrar.isValidLabel("alice-"));
        assertFalse(registrar.isValidLabel("-"));
    }

    function test_ClockStartsAtDeployment() public {
        uint256 deployedAt = block.timestamp;
        DomainRegistrar freshRegistrar = new DomainRegistrar();

        assertEq(freshRegistrar.auctionStart() , deployedAt);  // the first argument is the actual and the second is the expected
        assertEq(freshRegistrar.getCurrentRound() , 1);
    }

    function test_RoundOneIncludesBothWindows() public {
        uint256 start = registrar.auctionStart();

        // this basically allows us to control the times in a local environment so i do not have to wait like minutes .. it just means
        // advance the test clock to exactly 119 seconds after deployment and then check that round 1 has begun
        vm.warp(start + 119);
        assertEq(registrar.getCurrentRound(), 1);

        vm.warp(start + 120);
        assertEq(registrar.getCurrentRound(), 1);

        vm.warp(start + 239);
        assertEq(registrar.getCurrentRound(), 1);
    }

    function test_RoundTwoStartsAt240Seconds() public {
        uint256 start = registrar.auctionStart();

        vm.warp(start + 240);

        assertEq(registrar.getCurrentRound(), 2);
    }

    function test_ComputesLaterRoundIds() public {
        uint256 start = registrar.auctionStart();

        vm.warp(start + 480);
        assertEq(registrar.getCurrentRound(), 3);

        vm.warp(start + 977);
        assertEq(registrar.getCurrentRound(), 5);
    }

    function test_ClockOriginStaysFixed() public {
        uint256 start = registrar.auctionStart();

        vm.warp(start + 600);

        assertEq(registrar.auctionStart(), start);
    }

    function test_RoundOneDeadlines() public view {
        uint256 start = registrar.auctionStart();
        DomainRegistrar.RoundInfo memory info = registrar.getRound(1);

        assertEq(info.startTime, start);
        assertEq(info.commitEnd, start + 120);
        assertEq(info.revealEnd, start + 240);
    }

    function test_StartsInCommitPhase() public view {
        assertTrue(
            registrar.getRound(1).phase == DomainRegistrar.Phase.Commit
        );
    }

    function test_CommitEndsAt120Seconds() public {
        uint256 start = registrar.auctionStart();

        vm.warp(start + 119);
        assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Commit);

        vm.warp(start + 120);
        assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Reveal);
    }

    function test_RevealEndsAt240Seconds() public {
        uint256 start = registrar.auctionStart();

        vm.warp(start + 239);
        assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Reveal);

        vm.warp(start + 240);
        assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Ended);
    }

    function test_RoundTwoFollowsItsOwnSchedule() public {
        uint256 start = registrar.auctionStart();

        assertTrue(registrar.getRound(2).phase == DomainRegistrar.Phase.NotStarted);

        vm.warp(start + 239);
        assertTrue(registrar.getRound(2).phase == DomainRegistrar.Phase.NotStarted);

        vm.warp(start + 240);
        assertTrue(registrar.getRound(2).phase == DomainRegistrar.Phase.Commit);

        vm.warp(start + 360);
        assertTrue(registrar.getRound(2).phase == DomainRegistrar.Phase.Reveal);

        vm.warp(start + 480);
        assertTrue(registrar.getRound(2).phase == DomainRegistrar.Phase.Ended);
    }

    function test_LaterRoundDeadlines() public view {
        uint256 start = registrar.auctionStart();
        DomainRegistrar.RoundInfo memory info = registrar.getRound(3);

        assertEq(info.startTime, start + 480);
        assertEq(info.commitEnd, start + 600);
        assertEq(info.revealEnd, start + 720);
    }

    function test_RejectsRoundZero() public {
        vm.expectRevert(bytes("INVALID ROUND"));
        registrar.getRound(0);
    }

    function test_CommitmentChangesWhenBidDetailsChange() public view {
        bytes32 salt = bytes32(uint256(123));
        bytes32 original = registrar.computeCommitment(1 , address(1) , "alice" , 0.004 ether , salt);

        // this changes only the round
        assertNotEq(
            original,
            registrar.computeCommitment(2 , address(1) , "alice" , 0.004 ether , salt)
        );

        // this changes only the bidder
        assertNotEq(
            original,
            registrar.computeCommitment(1 , address(2) , "alice" , 0.004 ether , salt)
        );

        // this changes only the name
        assertNotEq(
            original,
            registrar.computeCommitment(1 , address(1) , "bob" ,   0.004 ether , salt)
        );

        // this changes only the bid amount
        assertNotEq(
            original,
            registrar.computeCommitment(1 , address(1) , "alice" , 0.005 ether , salt)
        );

        // this changes only the salt
        assertNotEq(
            original,
            registrar.computeCommitment(1 , address(1) , "alice" , 0.004 ether , bytes32(uint256(456)))
        );
    }

    function test_CommitmentStaysTheSameAsTimePasses() public {
        bytes32 salt = bytes32(uint256(123));
        bytes32 original = registrar.computeCommitment(1, address(1), "alice", 0.004 ether, salt);

        vm.warp(registrar.auctionStart() + 240);
        bytes32 later = registrar.computeCommitment(1, address(1), "alice", 0.004 ether, salt);
        assertEq(original, later);
    }

    function test_CommitmentChangesForAnotherRegistrar() public {
        DomainRegistrar otherRegistrar = new DomainRegistrar();
        bytes32 salt   = bytes32(uint256(123));
        bytes32 first  = registrar.computeCommitment(1, address(1), "alice", 0.004 ether, salt);
        bytes32 second = otherRegistrar.computeCommitment(1, address(1), "alice", 0.004 ether, salt);
        assertNotEq(first, second);
    }

}
