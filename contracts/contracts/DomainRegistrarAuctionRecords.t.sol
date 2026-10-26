// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

contract DomainRegistrarAuctionRecordsTest is Test {
	DomainRegistrar internal registrar;
	uint256 internal deposit;
	bytes32 internal salt;
	address internal alice = address(101);
	address internal bob = address(102);
	address internal carol = address(103);
	address internal dave = address(104);
	address internal outsider = address(105);

	function setUp() public {
		registrar = new DomainRegistrar();
		registrar.startRound();
		deposit = registrar.COMMIT_DEPOSIT();
		salt = bytes32(uint256(123)); // Fixed salt for local tests only.
		vm.deal(alice, 10 * deposit);
		vm.deal(bob, 10 * deposit);
		vm.deal(carol, 10 * deposit);
		vm.deal(dave, 10 * deposit);
	}

	function test_CommitDoesNotCreateNamedAuctionOrPendingDomain() public {
		_commit(1, alice, "alice", 0.004 ether);
		assertEq(_pending(1), 0);
		assertEq(registrar.reservedRound("alice"), 0);
		_assertEmptyAuction(1, "alice");
	}

	function test_CompetingValidRevealsCountDomainOnce() public {
		uint256 first = _commit(1, alice, "alice", 0.004 ether);
		uint256 higher = _commit(1, bob, "alice", 0.006 ether);
		uint256 lower = _commit(1, carol, "alice", 0.003 ether);
		_toReveal(1);

		assertTrue(_reveal(first, alice, "alice", 0.004 ether));
		assertEq(_pending(1), 1);
		assertTrue(_reveal(higher, bob, "alice", 0.006 ether));
		assertEq(_pending(1), 1);
		assertTrue(_reveal(lower, carol, "alice", 0.003 ether));
		assertEq(_pending(1), 1);

		DomainRegistrar.AuctionInfo memory auction = registrar.getAuctionForRound(1, "alice");
		assertEq(auction.roundId, 1);
		assertEq(auction.winningCommitmentId, higher);
		assertEq(auction.highestBidder, bob);
		assertEq(auction.highestBidWei, 0.006 ether);
		assertFalse(auction.finalized);
		assertEq(registrar.reservedRound("alice"), 1);
		assertEq(registrar.getAuction("alice").winningCommitmentId, higher);
	}

	function test_DifferentNamesHaveSeparatePendingEntries() public {
		uint256 aliceId = _commit(1, alice, "alice", 0.004 ether);
		uint256 bobId = _commit(1, bob, "bob", 0.005 ether);
		_toReveal(1);
		assertTrue(_reveal(aliceId, alice, "alice", 0.004 ether));
		assertTrue(_reveal(bobId, bob, "bob", 0.005 ether));

		assertEq(_pending(1), 2);
		assertEq(registrar.getAuctionForRound(1, "alice").winningCommitmentId, aliceId);
		assertEq(registrar.getAuctionForRound(1, "bob").winningCommitmentId, bobId);
		assertEq(registrar.ownerOf("alice"), address(0));
		assertEq(registrar.ownerOf("bob"), address(0));
	}

	function test_InvalidAndUnrevealedCommitmentsDoNotCreatePendingDomains() public {
		uint256 uppercase = _commit(1, alice, "Alice", 0.004 ether);
		uint256 zero = _commit(1, bob, "zero", 0);
		uint256 large = _commit(1, carol, "large", deposit + 1);
		_commit(1, dave, "unopened", 0.004 ether);
		_toReveal(1);

		assertFalse(_reveal(uppercase, alice, "Alice", 0.004 ether));
		assertFalse(_reveal(zero, bob, "zero", 0));
		assertFalse(_reveal(large, carol, "large", deposit + 1));
		assertEq(_pending(1), 0);
		_assertEmptyAuction(1, "zero");
		_assertEmptyAuction(1, "large");
		_assertEmptyAuction(1, "unopened");
		assertEq(registrar.getAuction("Alice").winningCommitmentId, 0);
	}

	function test_FinalizationUpdatesHistoryReservationAndCounterExactlyOnce() public {
		uint256 aliceId = _commit(1, alice, "alice", 0.004 ether);
		uint256 bobId = _commit(1, bob, "bob", 0.005 ether);
		_toReveal(1);
		assertTrue(_reveal(aliceId, alice, "alice", 0.004 ether));
		assertTrue(_reveal(bobId, bob, "bob", 0.005 ether));
		_endRound(1);
		uint256 balanceBefore = address(registrar).balance;

		vm.prank(outsider);
		assertEq(registrar.finalizeDomain(1, "alice"), alice);
		assertEq(_pending(1), 1);
		assertEq(registrar.reservedRound("alice"), 0);
		assertEq(registrar.reservedRound("bob"), 1);
		assertEq(registrar.ownerOf("alice"), alice);
		assertTrue(registrar.getAuctionForRound(1, "alice").finalized);
		assertTrue(registrar.getAuction("alice").finalized);
		assertFalse(registrar.getAuctionForRound(1, "bob").finalized);

		vm.expectRevert(bytes("ALREADY FINALIZED"));
		registrar.finalizeDomain(1, "alice");
		vm.expectRevert(bytes("ALREADY FINALIZED"));
		registrar.finalizeName("alice");
		assertEq(_pending(1), 1);

		registrar.finalizeDomain(1, "bob");
		assertEq(_pending(1), 0);
		assertTrue(registrar.getAuctionForRound(1, "bob").finalized);
		assertEq(address(registrar).balance, balanceBefore);
	}

	function test_LabelOnlyFinalizationUpdatesPendingCount() public {
		_reserveAlice();
		_endRound(1);
		registrar.finalizeName("alice");
		assertEq(_pending(1), 0);
		assertTrue(registrar.getAuctionForRound(1, "alice").finalized);
		assertEq(registrar.reservedRound("alice"), 0);
	}

	function test_RejectedFinalizationsLeaveRecordsUnchanged() public {
		_reserveAlice();
		vm.expectRevert(bytes("ROUND NOT ENDED"));
		registrar.finalizeDomain(1, "alice");
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.finalizeDomain(0, "alice");
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.finalizeDomain(2, "alice");
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.finalizeDomain(1, "Alice");
		_endRound(1);
		vm.expectRevert(bytes("NO WINNING BID"));
		registrar.finalizeDomain(1, "unknown");
		registrar.startRound();
		vm.expectRevert(bytes("NO WINNING BID"));
		registrar.finalizeDomain(2, "alice");

		assertEq(_pending(1), 1);
		assertEq(_pending(2), 0);
		assertEq(registrar.reservedRound("alice"), 1);
		assertEq(registrar.ownerOf("alice"), address(0));
		assertFalse(registrar.getAuctionForRound(1, "alice").finalized);
		_assertEmptyAuction(2, "alice");
	}

	function test_NewRoundStartsWithZeroWhileOlderDomainsRemainPending() public {
		_reserveAlice();
		_endRound(1);
		registrar.startRound();
		assertEq(_pending(1), 1);
		assertEq(_pending(2), 0);

		uint256 laterId = _commit(2, bob, "bob", 0.005 ether);
		_toReveal(2);
		assertTrue(_reveal(laterId, bob, "bob", 0.005 ether));
		assertEq(_pending(1), 1);
		assertEq(_pending(2), 1);
		assertEq(registrar.reservedRound("alice"), 1);
		assertEq(registrar.reservedRound("bob"), 2);
	}

	function test_FinalizingOlderRoundLeavesNewerAuctionAndScheduleUnchanged() public {
		uint256 aliceId = _commit(1, alice, "alice", 0.004 ether);
		uint256 bobId = _commit(1, bob, "bob", 0.005 ether);
		_toReveal(1);
		assertTrue(_reveal(aliceId, alice, "alice", 0.004 ether));
		assertTrue(_reveal(bobId, bob, "bob", 0.005 ether));
		_endRound(1);
		registrar.startRound();

		uint256 laterId = _commit(2, carol, "carol", 0.006 ether);
		_toReveal(2);
		assertTrue(_reveal(laterId, carol, "carol", 0.006 ether));
		DomainRegistrar.RoundInfo memory second = registrar.getRound(2);
		registrar.finalizeDomain(1, "alice");

		DomainRegistrar.RoundInfo memory afterFinalization = registrar.getRound(2);
		assertEq(_pending(1), 1);
		assertEq(afterFinalization.pendingDomainCount, 1);
		assertEq(afterFinalization.startTime, second.startTime);
		assertEq(afterFinalization.commitEnd, second.commitEnd);
		assertEq(afterFinalization.revealEnd, second.revealEnd);
		assertTrue(afterFinalization.phase == DomainRegistrar.Phase.Reveal);
		assertEq(registrar.getCurrentRound(), 2);
		assertEq(registrar.getAuctionForRound(2, "carol").winningCommitmentId, laterId);
		assertFalse(registrar.getAuctionForRound(2, "carol").finalized);
		assertEq(registrar.reservedRound("alice"), 0);
		assertEq(registrar.reservedRound("bob"), 1);
		assertEq(registrar.reservedRound("carol"), 2);
	}

	function test_LaterRoundCannotReplaceEarlierReservation() public {
		uint256 originalId = _reserveAlice();
		_endRound(1);
		registrar.startRound();
		uint256 laterId = _commit(2, bob, "alice", 0.009 ether);
		_toReveal(2);
		assertFalse(_reveal(laterId, bob, "alice", 0.009 ether));

		assertEq(_pending(1), 1);
		assertEq(_pending(2), 0);
		assertEq(registrar.reservedRound("alice"), 1);
		assertEq(registrar.getAuctionForRound(1, "alice").winningCommitmentId, originalId);
		_assertEmptyAuction(2, "alice");
	}

	function test_RegisteredNameCannotBeReservedAgain() public {
		uint256 originalId = _reserveAlice();
		_endRound(1);
		registrar.finalizeDomain(1, "alice");
		registrar.startRound();
		uint256 laterId = _commit(2, bob, "alice", 0.009 ether);
		_toReveal(2);
		assertFalse(_reveal(laterId, bob, "alice", 0.009 ether));

		assertEq(_pending(1), 0);
		assertEq(_pending(2), 0);
		assertEq(registrar.reservedRound("alice"), 0);
		assertEq(registrar.ownerOf("alice"), alice);
		assertEq(registrar.getAuctionForRound(1, "alice").winningCommitmentId, originalId);
		assertTrue(registrar.getAuctionForRound(1, "alice").finalized);
		_assertEmptyAuction(2, "alice");
	}

	function test_LaterRoundCanUseNameWithoutEarlierValidReveal() public {
		_commit(1, alice, "alice", 0.004 ether);
		_endRound(1);
		registrar.startRound();
		uint256 laterId = _commit(2, bob, "alice", 0.006 ether);
		_toReveal(2);
		assertTrue(_reveal(laterId, bob, "alice", 0.006 ether));

		assertEq(_pending(1), 0);
		assertEq(_pending(2), 1);
		_assertEmptyAuction(1, "alice");
		assertEq(registrar.getAuctionForRound(2, "alice").winningCommitmentId, laterId);
		assertEq(registrar.reservedRound("alice"), 2);
	}

	function test_SettlementDoesNotFinalizePendingDomains() public {
		uint256 validId = _commit(1, alice, "alice", 0.004 ether);
		uint256 unopenedId = _commit(1, bob, "bob", 0.005 ether);
		_toReveal(1);
		assertTrue(_reveal(validId, alice, "alice", 0.004 ether));
		_endRound(1);
		registrar.settleCommit(unopenedId);

		assertEq(_pending(1), 1);
		assertTrue(registrar.getCommitment(unopenedId).settled);
		assertFalse(registrar.getAuctionForRound(1, "alice").finalized);
		registrar.finalizeDomain(1, "alice");
		assertEq(_pending(1), 0);
	}

	function test_OlderSettlementReadsOriginalRoundAuction() public {
		uint256 winningId = _commit(1, alice, "alice", 0.006 ether);
		uint256 losingId = _commit(1, bob, "alice", 0.004 ether);
		_toReveal(1);
		assertTrue(_reveal(winningId, alice, "alice", 0.006 ether));
		assertTrue(_reveal(losingId, bob, "alice", 0.004 ether));
		_endRound(1);
		registrar.startRound();
		uint256 laterId = _commit(2, carol, "bob", 0.005 ether);
		_toReveal(2);
		assertTrue(_reveal(laterId, carol, "bob", 0.005 ether));

		registrar.finalizeDomain(1, "alice");
		registrar.settleCommit(winningId);
		registrar.settleCommit(losingId);
		assertEq(registrar.refundCredits(alice), deposit - 0.006 ether);
		assertEq(registrar.refundCredits(bob), deposit);
		assertEq(registrar.treasuryCredit(), 0.006 ether);
		assertEq(registrar.totalLockedDeposits(), deposit);
		assertEq(_pending(1), 0);
		assertEq(_pending(2), 1);
		assertEq(registrar.getAuctionForRound(2, "bob").winningCommitmentId, laterId);
		assertFalse(registrar.getCommitment(laterId).settled);
	}

	function test_RoundAuctionReadsValidateRoundAndLabel() public {
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.getAuctionForRound(0, "alice");
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.getAuctionForRound(2, "alice");
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.getAuctionForRound(1, "Alice");
		vm.expectRevert(bytes("INVALID LABEL"));
		registrar.getAuctionForRound(1, "alice.ntu");
		_assertEmptyAuction(1, "unknown");
	}

	function test_ThreeRoundsMaintainIndependentPendingCounters() public {
		uint256 aliceId = _commit(1, alice, "alice", 0.004 ether);
		uint256 bobId = _commit(1, bob, "bob", 0.005 ether);
		_toReveal(1);
		assertTrue(_reveal(aliceId, alice, "alice", 0.004 ether));
		assertTrue(_reveal(bobId, bob, "bob", 0.005 ether));
		_endRound(1);
		registrar.startRound();
		uint256 carolId = _commit(2, carol, "carol", 0.006 ether);
		_toReveal(2);
		assertTrue(_reveal(carolId, carol, "carol", 0.006 ether));
		_endRound(2);
		registrar.startRound();
		uint256 daveId = _commit(3, dave, "dave", 0.003 ether);
		_toReveal(3);
		assertTrue(_reveal(daveId, dave, "dave", 0.003 ether));

		registrar.finalizeDomain(1, "bob");
		assertEq(_pending(1), 1);
		assertEq(_pending(2), 1);
		assertEq(_pending(3), 1);
		registrar.finalizeDomain(2, "carol");
		assertEq(_pending(1), 1);
		assertEq(_pending(2), 0);
		assertEq(_pending(3), 1);
		assertEq(registrar.getCurrentRound(), 3);
		assertTrue(registrar.getRound(3).phase == DomainRegistrar.Phase.Reveal);
		assertFalse(registrar.getAuctionForRound(3, "dave").finalized);
	}

	function testFuzz_CompetingBidsCountOneDomainAndFinalizeOnce(
		uint96 firstSeed,
		uint96 secondSeed,
		bool reverse
	) public {
		uint256 firstBid = bound(uint256(firstSeed), 1, deposit);
		uint256 secondBid = bound(uint256(secondSeed), 1, deposit);
		uint256 firstId = _commit(1, alice, "alice", firstBid);
		uint256 secondId = _commit(1, bob, "alice", secondBid);
		_toReveal(1);
		if (reverse) {
			assertTrue(_reveal(secondId, bob, "alice", secondBid));
			assertEq(_pending(1), 1);
			assertTrue(_reveal(firstId, alice, "alice", firstBid));
		} else {
			assertTrue(_reveal(firstId, alice, "alice", firstBid));
			assertEq(_pending(1), 1);
			assertTrue(_reveal(secondId, bob, "alice", secondBid));
		}
		assertEq(_pending(1), 1);
		address expectedWinner = firstBid >= secondBid ? alice : bob;
		assertEq(registrar.getAuctionForRound(1, "alice").highestBidder, expectedWinner);
		_endRound(1);
		assertEq(registrar.finalizeDomain(1, "alice"), expectedWinner);
		assertEq(_pending(1), 0);
		assertTrue(registrar.getAuctionForRound(1, "alice").finalized);
		assertEq(address(registrar).balance, 2 * deposit);
	}

	function _reserveAlice() internal returns (uint256 id) {
		id = _commit(1, alice, "alice", 0.004 ether);
		_toReveal(1);
		assertTrue(_reveal(id, alice, "alice", 0.004 ether));
	}

	function _commit(uint256 roundId, address bidder, string memory label, uint256 bidWei) internal returns (uint256) {
		bytes32 digest = registrar.computeCommitment(roundId, bidder, label, bidWei, salt);
		vm.prank(bidder);
		return registrar.commit{value: deposit}(roundId, digest);
	}

	function _reveal(uint256 id, address bidder, string memory label, uint256 bidWei) internal returns (bool) {
		vm.prank(bidder);
		return registrar.reveal(id, label, bidWei, salt);
	}

	function _toReveal(uint256 roundId) internal {
		uint256 deadline = registrar.getRound(roundId).commitEnd;
		vm.warp(deadline);
	}

	function _endRound(uint256 roundId) internal {
		uint256 deadline = registrar.getRound(roundId).revealEnd;
		vm.warp(deadline);
	}

	function _pending(uint256 roundId) internal view returns (uint256) {
		return registrar.getRound(roundId).pendingDomainCount;
	}

	function _assertEmptyAuction(uint256 roundId, string memory label) internal view {
		DomainRegistrar.AuctionInfo memory auction = registrar.getAuctionForRound(roundId, label);
		assertEq(auction.roundId, 0);
		assertEq(auction.winningCommitmentId, 0);
		assertEq(auction.highestBidder, address(0));
		assertEq(auction.highestBidWei, 0);
		assertFalse(auction.finalized);
	}
}
