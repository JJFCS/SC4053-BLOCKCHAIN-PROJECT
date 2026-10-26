// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

contract DomainRegistrarBidRulesTest is Test {
	DomainRegistrar internal registrar;
	uint256 internal deposit;
	uint256 internal bid = 0.004 ether;
	bytes32 internal salt = bytes32(uint256(123)); // Fixed test data, never a real bid salt.
	address internal alice = address(101);
	address internal bob = address(102);
	address internal carol = address(103);

	function setUp() public {
		registrar = new DomainRegistrar();
		registrar.startRound();
		deposit = registrar.COMMIT_DEPOSIT();
		vm.deal(alice, 10 * deposit);
		vm.deal(bob, 10 * deposit);
		vm.deal(carol, 10 * deposit);
	}

	function test_CommitmentLookupSeparatesWalletsAndRejectsUnknownRounds() public {
		assertEq(registrar.getCommitmentId(1, alice), 0);
		DomainRegistrar.CommitmentInfo memory empty = registrar.getCommitmentForRound(1, alice);
		assertEq(empty.bidder, address(0));
		assertEq(empty.digest, bytes32(0));
		assertEq(empty.deposit, 0);
		assertFalse(empty.revealed);
		assertFalse(empty.settled);

		uint256 id = _commitNew(1, alice, "alice", bid);
		assertEq(registrar.getCommitmentId(1, alice), id);
		assertEq(registrar.getCommitmentId(1, bob), 0);
		DomainRegistrar.CommitmentInfo memory info = registrar.getCommitmentForRound(1, alice);
		assertEq(info.bidder, alice);
		assertEq(info.roundId, 1);
		assertEq(info.deposit, deposit);
		assertEq(info.digest, registrar.getCommitment(id).digest);
		assertFalse(info.revealed);

		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.getCommitmentId(0, alice);
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.getCommitmentForRound(2, alice);
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.getCommitmentId(type(uint256).max, alice);
	}

	function test_BothCommitEntryPointsEnforceOneCommitmentPerWallet() public {
		bytes32 firstDigest = registrar.computeCommitment(1, alice, "alice", bid, salt);
		vm.prank(alice);
		uint256 firstId = registrar.commit{value: deposit}(1, firstDigest);
		vm.prank(alice);
		vm.expectRevert(bytes("ALREADY COMMITTED"));
		registrar.commitBid{value: deposit}(1, keccak256("different hash"));

		uint256 secondId = _commitNew(1, bob, "bob", bid);
		vm.prank(bob);
		vm.expectRevert(bytes("ALREADY COMMITTED"));
		registrar.commit{value: deposit}(1, keccak256("another hash"));

		assertEq(firstId, 1);
		assertEq(secondId, 2);
		assertEq(registrar.getCommitmentId(1, alice), firstId);
		assertEq(registrar.getCommitmentId(1, bob), secondId);
		assertEq(registrar.commitmentCount(), 2);
		assertEq(registrar.totalLockedDeposits(), 2 * deposit);
		assertEq(address(registrar).balance, 2 * deposit);
		assertEq(alice.balance, 9 * deposit);
		assertEq(bob.balance, 9 * deposit);
	}

	function test_RejectedCommitsLeaveWalletSlotAndSequenceUnused() public {
		bytes32 digest = registrar.computeCommitment(1, alice, "alice", bid, salt);
		vm.startPrank(alice);
		vm.expectRevert(bytes("INCORRECT DEPOSIT"));
		registrar.commitBid{value: deposit - 1}(1, digest);
		vm.expectRevert(bytes("INCORRECT DEPOSIT"));
		registrar.commitBid{value: deposit + 1}(1, digest);
		vm.expectRevert(bytes("EMPTY COMMITMENT"));
		registrar.commitBid{value: deposit}(1, bytes32(0));
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.commitBid{value: deposit}(0, digest);
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.commitBid{value: deposit}(2, digest);
		vm.stopPrank();

		assertEq(registrar.getCommitmentId(1, alice), 0);
		assertEq(registrar.commitmentCount(), 0);
		assertEq(registrar.totalLockedDeposits(), 0);
		assertEq(address(registrar).balance, 0);
		assertEq(alice.balance, 10 * deposit);
		assertEq(_commitNew(1, alice, "alice", bid), 1);
	}

	function test_NewCommitEntryPointHonorsExactDeadline() public {
		DomainRegistrar.RoundInfo memory round = registrar.getRound(1);
		vm.warp(round.commitEnd - 1);
		_commitNew(1, alice, "alice", bid);
		vm.warp(round.commitEnd);
		vm.prank(bob);
		vm.expectRevert(bytes("NOT COMMIT PHASE"));
		registrar.commitBid{value: deposit}(1, keccak256("too late"));
		assertEq(registrar.getCommitmentId(1, bob), 0);
		assertEq(registrar.commitmentCount(), 1);
	}

	function test_RevealByRoundUsesCallersOwnCommitment() public {
		uint256 id = _commitNew(1, alice, "alice", bid);
		vm.warp(registrar.getRound(1).commitEnd);
		vm.prank(bob);
		vm.expectRevert(bytes("NO COMMITMENT"));
		registrar.revealBid(1, "alice", bid, salt);
		vm.prank(alice);
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.revealBid(2, "alice", bid, salt);
		_assertUnused(id, alice);

		vm.prank(alice);
		registrar.revealBid(1, "alice", bid, salt);
		DomainRegistrar.CommitmentInfo memory info = registrar.getCommitmentForRound(1, alice);
		assertTrue(info.revealed);
		assertTrue(info.valid);
		assertEq(info.labelHash, keccak256("alice"));
		assertEq(info.bidWei, bid);
		assertEq(registrar.getAuctionForRound(1, "alice").winningCommitmentId, id);
		assertEq(registrar.ownerOf("alice"), address(0));
	}

	function test_FailedRevealDetailsPreserveRecordAndAllowCorrectRetry() public {
		uint256 id = _commitNew(1, alice, "alice", bid);
		vm.warp(registrar.getRound(1).commitEnd);
		vm.startPrank(alice);
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.revealBid(1, "al", bid, salt);
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.revealBid(1, "Alice", bid, salt);
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.revealBid(1, "alice.ntu", bid, salt);
		vm.expectRevert(bytes("INVALID BID"));
		registrar.revealBid(1, "alice", 0, salt);
		vm.expectRevert(bytes("INVALID BID"));
		registrar.revealBid(1, "alice", deposit + 1, salt);
		vm.expectRevert(bytes("COMMITMENT MISMATCH"));
		registrar.revealBid(1, "other", bid, salt);
		vm.expectRevert(bytes("COMMITMENT MISMATCH"));
		registrar.revealBid(1, "alice", bid + 1, salt);
		vm.expectRevert(bytes("COMMITMENT MISMATCH"));
		registrar.revealBid(1, "alice", bid, bytes32(uint256(456)));
		vm.stopPrank();
		_assertUnused(id, alice);

		vm.prank(alice);
		registrar.revealBid(1, "alice", bid, salt);
		assertTrue(registrar.getCommitment(id).revealed);
		assertEq(registrar.getRound(1).pendingDomainCount, 1);
	}

	function test_BothRevealEntryPointsRejectRepeatedReveal() public {
		uint256 aliceId = _commitNew(1, alice, "alice", bid);
		uint256 bobId = _commitNew(1, bob, "bob", bid);
		vm.warp(registrar.getRound(1).commitEnd);
		vm.prank(alice);
		registrar.revealBid(1, "alice", bid, salt);
		vm.prank(alice);
		vm.expectRevert(bytes("ALREADY REVEALED"));
		registrar.reveal(aliceId, "alice", bid, salt);
		vm.prank(bob);
		assertTrue(registrar.reveal(bobId, "bob", bid, salt));
		vm.prank(bob);
		vm.expectRevert(bytes("ALREADY REVEALED"));
		registrar.revealBid(1, "bob", bid, salt);
		assertEq(registrar.getRound(1).pendingDomainCount, 2);
	}

	function test_RevealByRoundHonorsStartAndEndBoundaries() public {
		uint256 firstId = _commitNew(1, alice, "alice", bid);
		uint256 lateId = _commitNew(1, bob, "bob", bid);
		DomainRegistrar.RoundInfo memory round = registrar.getRound(1);
		vm.warp(round.commitEnd - 1);
		vm.prank(alice);
		vm.expectRevert(bytes("NOT REVEAL PHASE"));
		registrar.revealBid(1, "alice", bid, salt);
		_assertUnused(firstId, alice);
		vm.warp(round.commitEnd);
		vm.prank(alice);
		registrar.revealBid(1, "alice", bid, salt);
		vm.warp(round.revealEnd);
		vm.prank(bob);
		vm.expectRevert(bytes("NOT REVEAL PHASE"));
		registrar.revealBid(1, "bob", bid, salt);
		assertFalse(registrar.getCommitment(lateId).revealed);
		assertEq(registrar.getRound(1).pendingDomainCount, 1);
	}

	function test_NewRoundAllowsSameWalletAndKeepsOldRecord() public {
		uint256 firstId = _commitNew(1, alice, "alice", bid);
		bytes32 firstDigest = registrar.getCommitment(firstId).digest;
		vm.warp(registrar.getRound(1).revealEnd);
		registrar.startRound();
		uint256 secondId = _commitNew(2, alice, "bob", bid);
		assertEq(secondId, firstId + 1);
		assertEq(registrar.getCommitmentId(1, alice), firstId);
		assertEq(registrar.getCommitmentId(2, alice), secondId);
		assertEq(registrar.getCommitmentForRound(1, alice).digest, firstDigest);
		assertFalse(registrar.getCommitmentForRound(1, alice).revealed);

		vm.warp(registrar.getRound(2).commitEnd);
		vm.prank(alice);
		vm.expectRevert(bytes("NOT REVEAL PHASE"));
		registrar.revealBid(1, "alice", bid, salt);
		vm.prank(alice);
		registrar.revealBid(2, "bob", bid, salt);
		assertFalse(registrar.getCommitmentForRound(1, alice).revealed);
		assertTrue(registrar.getCommitmentForRound(2, alice).revealed);
		assertEq(registrar.getRound(1).pendingDomainCount, 0);
		assertEq(registrar.getRound(2).pendingDomainCount, 1);
		assertEq(registrar.totalLockedDeposits(), 2 * deposit);
	}

	function test_ChangedChainCannotRevealUntilOriginalContextRestored() public {
		uint256 id = _commitNew(1, alice, "alice", bid);
		uint256 originalChain = block.chainid;
		vm.warp(registrar.getRound(1).commitEnd);
		vm.chainId(originalChain + 1);
		vm.prank(alice);
		vm.expectRevert(bytes("COMMITMENT MISMATCH"));
		registrar.revealBid(1, "alice", bid, salt);
		vm.chainId(originalChain);
		_assertUnused(id, alice);
		vm.prank(alice);
		registrar.revealBid(1, "alice", bid, salt);
		assertTrue(registrar.getCommitment(id).revealed);
	}

	function test_CopiedHashDoesNotWorkForAnotherWalletOrContract() public {
		uint256 id = _commitNew(1, alice, "alice", bid);
		bytes32 digest = registrar.getCommitment(id).digest;
		vm.prank(bob);
		registrar.commitBid{value: deposit}(1, digest);
		DomainRegistrar other = new DomainRegistrar();
		other.startRound();
		vm.prank(alice);
		other.commitBid{value: deposit}(1, digest);
		vm.warp(other.getRound(1).commitEnd);
		vm.prank(bob);
		vm.expectRevert(bytes("COMMITMENT MISMATCH"));
		registrar.revealBid(1, "alice", bid, salt);
		vm.prank(alice);
		vm.expectRevert(bytes("COMMITMENT MISMATCH"));
		other.revealBid(1, "alice", bid, salt);
		assertFalse(registrar.getCommitmentForRound(1, bob).revealed);
		assertFalse(other.getCommitmentForRound(1, alice).revealed);
		vm.prank(alice);
		registrar.revealBid(1, "alice", bid, salt);
		assertEq(registrar.getAuctionForRound(1, "alice").highestBidder, alice);
	}

	function test_ShortNamesRejectedByDomainOperations() public {
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.ownerOf("ab");
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.reservedRound("ab");
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.resolve("ab");
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.getAuctionForRound(1, "ab");
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.finalizeDomain(1, "ab");
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.finalizeName("ab");
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.setAddress("ab", alice);
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.sendToDomain("ab", alice);
		assertEq(registrar.getRound(1).pendingDomainCount, 0);
	}

	function testFuzz_SecondHashCannotReplaceWalletCommitment(bytes32 otherDigest, bool useLegacyFirst) public {
		vm.assume(otherDigest != bytes32(0));
		bytes32 digest = registrar.computeCommitment(1, alice, "alice", bid, salt);
		vm.prank(alice);
		if (useLegacyFirst) {
			registrar.commit{value: deposit}(1, digest);
		} else {
			registrar.commitBid{value: deposit}(1, digest);
		}
		vm.prank(alice);
		vm.expectRevert(bytes("ALREADY COMMITTED"));
		if (useLegacyFirst) {
			registrar.commitBid{value: deposit}(1, otherDigest);
		} else {
			registrar.commit{value: deposit}(1, otherDigest);
		}
		assertEq(registrar.getCommitmentId(1, alice), 1);
		assertEq(registrar.getCommitmentForRound(1, alice).digest, digest);
		assertEq(registrar.commitmentCount(), 1);
		assertEq(registrar.totalLockedDeposits(), deposit);
		assertEq(address(registrar).balance, deposit);
		assertEq(alice.balance, 9 * deposit);
	}

	function _commitNew(uint256 roundId, address bidder, string memory label, uint256 amount) internal returns (uint256) {
		bytes32 digest = registrar.computeCommitment(roundId, bidder, label, amount, salt);
		vm.prank(bidder);
		registrar.commitBid{value: deposit}(roundId, digest);
		return registrar.getCommitmentId(roundId, bidder);
	}

	function _assertUnused(uint256 id, address bidder) internal view {
		DomainRegistrar.CommitmentInfo memory info = registrar.getCommitment(id);
		assertEq(info.bidder, bidder);
		assertEq(info.digest, registrar.computeCommitment(1, bidder, "alice", bid, salt));
		assertEq(info.deposit, deposit);
		assertFalse(info.revealed);
		assertFalse(info.valid);
		assertFalse(info.settled);
		assertEq(info.labelHash, bytes32(0));
		assertEq(info.bidWei, 0);
		assertEq(registrar.getRound(1).pendingDomainCount, 0);
		assertEq(registrar.reservedRound("alice"), 0);
		assertEq(registrar.ownerOf("alice"), address(0));
		assertEq(registrar.totalLockedDeposits(), registrar.commitmentCount() * deposit);
		assertEq(address(registrar).balance, registrar.commitmentCount() * deposit);
	}
}
