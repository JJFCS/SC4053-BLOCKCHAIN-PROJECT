
// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

contract DomainRegistrarRevealTest is Test {
    DomainRegistrar internal registrar;
    uint256 internal deposit;
    uint256 internal bidWei;
    bytes32 internal salt;
    uint256 internal commitmentId;

    function setUp() public {
        registrar = new DomainRegistrar();
        registrar.startRound();
        deposit   = registrar.COMMIT_DEPOSIT();
        bidWei    = 0.004 ether;
        salt      = bytes32(uint256(123));

        vm.deal(address(this), 10 * deposit);

        commitmentId = _commitBid("alice", bidWei);
    }

    function test_RevealStartsAt120SecondsAndStoresBid() public {
        uint256 start = registrar.getRound(1).startTime;

        vm.warp(start + 119);

        vm.expectRevert(bytes("NOT REVEAL PHASE"));
        registrar.reveal(commitmentId, "alice", bidWei, salt);

        vm.warp(start + 120);

        assertTrue(registrar.reveal(commitmentId, "alice", bidWei, salt));

        DomainRegistrar.CommitmentInfo memory info = registrar.getCommitment(commitmentId);

        assertTrue(info.revealed);
        assertTrue(info.valid);
        assertEq(info.labelHash, keccak256(bytes("alice")));
        assertEq(info.bidWei, bidWei);
        assertEq(info.deposit, deposit);

        assertEq(registrar.totalLockedDeposits(), deposit);
        assertEq(address(registrar).balance, deposit);
    }

    function test_RevealEndsAt240Seconds() public {
		address lateBidder = address(123);
		uint256 lateId = _commitAs(lateBidder, "bob", bidWei);
        uint256 start  = registrar.getRound(1).startTime;

        vm.warp(start + 239);

        assertTrue(registrar.reveal(commitmentId, "alice", bidWei, salt));

        vm.warp(start + 240);

        vm.expectRevert(bytes("NOT REVEAL PHASE"));
		vm.prank(lateBidder);
        registrar.reveal(lateId, "bob", bidWei, salt);

        assertFalse(registrar.getCommitment(lateId).revealed);
    }

    function test_RevealUsesOriginalRound() public {
        // Round 2 is revealing, but this commitment still belongs to ended round 1.
        uint256 start = registrar.getRound(1).startTime;
        vm.warp(start + 240);
        registrar.startRound();
        vm.warp(start + 360);
        assertTrue(registrar.getRound(2).phase == DomainRegistrar.Phase.Reveal);

        vm.expectRevert(bytes("NOT REVEAL PHASE"));
        registrar.reveal(commitmentId, "alice", bidWei, salt);

        assertFalse(registrar.getCommitment(commitmentId).revealed);
    }

    function test_RevealRejectsChangedDetailsAndAllowsRetry() public {
        vm.warp(registrar.getRound(1).startTime + 120);

        vm.expectRevert(bytes("COMMITMENT MISMATCH"));
        registrar.reveal(commitmentId, "bob", bidWei, salt);

        vm.expectRevert(bytes("COMMITMENT MISMATCH"));
        registrar.reveal(commitmentId, "alice", bidWei + 1, salt);

        vm.expectRevert(bytes("COMMITMENT MISMATCH"));
        registrar.reveal(commitmentId, "alice", bidWei, bytes32(uint256(456)));

        assertFalse(registrar.getCommitment(commitmentId).revealed);
        assertTrue(registrar.reveal(commitmentId, "alice", bidWei, salt));
    }

    function test_RevealRejectsSecondReveal() public {
        vm.warp(registrar.getRound(1).startTime + 120);

        assertTrue(registrar.reveal(commitmentId, "alice", bidWei, salt));

        vm.expectRevert(bytes("ALREADY REVEALED"));
        registrar.reveal(commitmentId, "alice", bidWei, salt);
    }

    function test_RevealRejectsInvalidLabelWithoutConsuming() public {
		address invalidBidder = address(123);
        uint256 invalidId = _commitAs(invalidBidder, "Alice", bidWei);

        vm.warp(registrar.getRound(1).startTime + 120);

		vm.expectRevert(bytes("INVALID LABEL"));
		vm.prank(invalidBidder);
		registrar.reveal(invalidId, "Alice", bidWei, salt);

        DomainRegistrar.CommitmentInfo memory info = registrar.getCommitment(invalidId);

        assertFalse(info.revealed);
        assertFalse(info.valid);
		assertEq(info.labelHash, bytes32(0));
		assertEq(info.bidWei, 0);

		vm.expectRevert(bytes("INVALID LABEL"));
		vm.prank(invalidBidder);
        registrar.reveal(invalidId, "Alice", bidWei, salt);
    }

    function test_RevealChecksBidLimits() public {
        uint256 zeroId    = _commitAs(address(123), "zero", 0);
        uint256 largeId   = _commitAs(address(124), "large", deposit + 1);
        uint256 minimumId = _commitAs(address(125), "minimum", 1);
        uint256 maximumId = _commitAs(address(126), "maximum", deposit);

        vm.warp(registrar.getRound(1).startTime + 120);

		vm.expectRevert(bytes("INVALID BID"));
		vm.prank(address(123));
		registrar.reveal(zeroId, "zero", 0, salt);
		vm.expectRevert(bytes("INVALID BID"));
		vm.prank(address(124));
		registrar.reveal(largeId, "large", deposit + 1, salt);
        assertFalse(registrar.getCommitment(zeroId).valid);
        assertFalse(registrar.getCommitment(largeId).valid);

		vm.prank(address(125));
        assertTrue(registrar.reveal(minimumId, "minimum", 1, salt));
		vm.prank(address(126));
        assertTrue(registrar.reveal(maximumId, "maximum", deposit, salt));
        assertFalse(registrar.getCommitment(zeroId).revealed);
        assertFalse(registrar.getCommitment(largeId).revealed);
		assertEq(registrar.getRound(1).pendingDomainCount, 2);
    }

    function test_CopiedHashCannotBeRevealedByAnotherBidder() public {
        address otherBidder  = address(123);
        bytes32 copiedDigest = registrar.getCommitment(commitmentId).digest;
        vm.deal(otherBidder, deposit);
        vm.prank(otherBidder);
        uint256 copiedId = registrar.commit{value: deposit}(
            1,
            copiedDigest
        );

        vm.warp(registrar.getRound(1).startTime + 120);
        vm.startPrank(otherBidder);
        vm.expectRevert(bytes("NOT BIDDER"));
        registrar.reveal(commitmentId, "alice", bidWei, salt);
        vm.expectRevert(bytes("COMMITMENT MISMATCH"));
        registrar.reveal(copiedId, "alice", bidWei, salt);
        vm.stopPrank();

        assertFalse(registrar.getCommitment(commitmentId).revealed);
        assertFalse(registrar.getCommitment(copiedId).revealed);

        assertTrue(registrar.reveal(commitmentId, "alice", bidWei, salt));
    }

    function test_RevealRejectsUnknownId() public {
        vm.warp(registrar.getRound(1).startTime + 120);
        vm.expectRevert(bytes("INVALID COMMITMENT"));

        registrar.reveal(0, "alice", bidWei, salt);

        // each test starts with only commitment 1
        vm.expectRevert(bytes("INVALID COMMITMENT"));
        registrar.reveal(2, "alice", bidWei, salt);
    }

    function _commitBid(string memory label, uint256 amount) internal returns (uint256) {
        bytes32 digest = registrar.computeCommitment(
            1,
            address(this),
            label,
            amount,
            salt
        );
        return registrar.commit{value: deposit}(1, digest);
    }

	function _commitAs(address bidder, string memory label, uint256 amount) internal returns (uint256) {
		vm.deal(bidder, deposit);
		bytes32 digest = registrar.computeCommitment(1, bidder, label, amount, salt);
		vm.prank(bidder);
		return registrar.commit{value: deposit}(1, digest);
	}
}
