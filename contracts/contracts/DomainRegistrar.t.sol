
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

        vm.warp(block.timestamp + 240);
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

    function test_CommitmentChangesForAnotherChain() public {
        uint256 originalChainId = block.chainid;
        bytes32 salt = bytes32(uint256(123));
        bytes32 original   = registrar.computeCommitment(1, address(1), "alice", 0.004 ether, salt);

        vm.chainId(originalChainId + 1);  // this one is a testing tool that changes block.chainid in the testing env

        bytes32 otherChain = registrar.computeCommitment(1, address(1), "alice", 0.004 ether, salt);

        vm.chainId(originalChainId);

        assertNotEq(original, otherChain);
    }

}
