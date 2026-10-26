// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

contract DomainRegistrarResolutionTest is Test {
    DomainRegistrar internal registrar;
    uint256 internal deposit;
    uint256 internal winningId;
    uint256 internal otherId;
    bytes32 internal salt;

    address internal alice      = address(101);
    address internal bob        = address(102);
    address internal carol      = address(103);
    address internal nextTarget = address(104);

    function setUp() public {
        registrar = new DomainRegistrar(address(this));
        registrar.startRound();
        deposit   = registrar.COMMIT_DEPOSIT();
        salt      = bytes32(uint256(123));

        vm.deal(alice, 10 * deposit);
        vm.deal(bob,   10 * deposit);
        vm.deal(carol, 10 * deposit);

        uint256 aliceId = _commitBid(alice, "alice", 0.004 ether);
        winningId       = _commitBid(bob, "alice", 0.006 ether);
        otherId         = _commitBid(carol, "bob", 0.005 ether);

        vm.warp(registrar.getRound(1).startTime + 120);

        vm.prank(alice);
        assertTrue(registrar.reveal(aliceId,   "alice", 0.004 ether, salt));
        vm.prank(bob);
        assertTrue(registrar.reveal(winningId, "alice", 0.006 ether, salt));
        vm.prank(carol);
        assertTrue(registrar.reveal(otherId,   "bob",   0.005 ether, salt));
    }

    function test_FinalizationSetsInitialResolutionToWinner() public {
        _finalizeAlice();

        DomainRegistrar.DomainInfo memory domain = registrar.getDomain("alice");

        assertEq(registrar.ownerOf("alice"), bob);
        assertEq(registrar.resolve("alice"), bob);
        assertEq(domain.owner, bob);
        assertEq(domain.resolutionAddress, bob);
        assertEq(domain.winningCommitmentId, winningId);
        assertEq(domain.priceWei, 0.006 ether);
    }

    function test_OwnerCanUpdateAddressWithoutChangingOwnership() public {
        _finalizeAlice();

        vm.prank(bob);
        registrar.setAddress("alice", carol);

        DomainRegistrar.DomainInfo memory domain = registrar.getDomain("alice");

        assertEq(registrar.ownerOf("alice"), bob);
        assertEq(registrar.resolve("alice"), carol);
        assertEq(domain.owner, bob);
        assertEq(domain.resolutionAddress, carol);
        assertEq(domain.roundId, 1);
        assertEq(domain.winningCommitmentId, winningId);
        assertEq(domain.priceWei, 0.006 ether);
    }

    function test_OnlyOwnerCanUpdateIncludingAfterAddressChange() public {
        _finalizeAlice();

        vm.expectRevert(bytes("NOT OWNER"));
        vm.prank(alice);
        registrar.setAddress("alice", nextTarget);

        vm.prank(bob);
        registrar.setAddress("alice", carol);

        // here receiving payments for a name does not grant ownership of it
        vm.expectRevert(bytes("NOT OWNER"));
        vm.prank(carol);
        registrar.setAddress("alice", nextTarget);

        assertEq(registrar.ownerOf("alice"), bob);
        assertEq(registrar.resolve("alice"), carol);
    }

    function test_RejectsZeroAndRegistrarTargets() public {
        _finalizeAlice();

        vm.expectRevert(bytes("ZERO ADDRESS"));
        vm.prank(bob);
        registrar.setAddress("alice", address(0));

        vm.expectRevert(bytes("INVALID TARGET"));
        vm.prank(bob);
        registrar.setAddress("alice", address(registrar));

        assertEq(registrar.resolve("alice"), bob);
    }

    function test_ReservedAndUnknownNamesCannotBeUpdated() public {
        assertEq(registrar.ownerOf("alice"), address(0));
        assertEq(registrar.resolve("alice"), address(0));
        assertEq(registrar.reservedRound("alice"), 1);
        assertEq(registrar.reservedRound("unknown"), 0);

        vm.expectRevert(bytes("UNREGISTERED NAME"));
        vm.prank(bob);
        registrar.setAddress("alice", carol);

        vm.expectRevert(bytes("UNREGISTERED NAME"));
        vm.prank(bob);
        registrar.setAddress("unknown", carol);

        assertEq(registrar.resolve("alice"), address(0));
        assertEq(registrar.ownerOf("unknown"), address(0));
    }

    function test_ReservationClearsOnlyAfterFinalization() public {
        assertEq(registrar.reservedRound("alice"), 1);

        vm.warp(registrar.getRound(1).startTime + 240);

        assertEq(registrar.reservedRound("alice"), 1);
        assertEq(registrar.ownerOf("alice"), address(0));

        registrar.finalizeName("alice");

        assertEq(registrar.reservedRound("alice"), 0);
        assertEq(registrar.ownerOf("alice"), bob);
        // note the completed auction remains available as historical info
        assertEq(registrar.getAuction("alice").roundId, 1);
    }

    function test_InvalidLabelsRejectedByResolutionOperations() public {
        _finalizeAlice();

        vm.expectRevert(bytes("INVALID LABEL"));
        vm.prank(bob);
        registrar.setAddress("Alice", carol);

        vm.expectRevert(bytes("INVALID LABEL"));
        registrar.ownerOf("Alice");

        vm.expectRevert(bytes("INVALID LABEL"));
        registrar.reservedRound("alice.ntu");

        vm.expectRevert(bytes("INVALID LABEL"));
        registrar.resolve("Alice");
    }

    function test_AddressUpdateDoesNotChangeAnotherDomain() public {
        _finalizeAlice();
        registrar.finalizeName("bob");

        vm.prank(bob);
        registrar.setAddress("alice", nextTarget);

        assertEq(registrar.ownerOf("alice"), bob);
        assertEq(registrar.resolve("alice"), nextTarget);
        assertEq(registrar.ownerOf("bob"), carol);
        assertEq(registrar.resolve("bob"), carol);
        assertEq(registrar.getDomain("bob").winningCommitmentId, otherId);
    }

    function test_OwnerCanUpdateAgainAndRestoreInitialAddress() public {
        _finalizeAlice();

        vm.startPrank(bob);
        registrar.setAddress("alice", carol);
        registrar.setAddress("alice", nextTarget);
        assertEq(registrar.resolve("alice"), nextTarget);
        registrar.setAddress("alice", bob);
        vm.stopPrank();

        assertEq(registrar.ownerOf("alice"), bob);
        assertEq(registrar.resolve("alice"), bob);
        assertEq(registrar.reservedRound("alice"), 0);
    }

    function _commitBid(address bidder,string memory label,uint256 amount) internal returns (uint256) {
        bytes32 digest = registrar.computeCommitment(1, bidder, label, amount, salt);
        vm.prank(bidder);
        return registrar.commit{value: deposit}(1, digest);
    }

    function _finalizeAlice() internal {
        vm.warp(registrar.getRound(1).startTime + 240);
        registrar.finalizeName("alice");
    }
}
