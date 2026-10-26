// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

contract DomainRegistrarRoundsTest is Test {
	DomainRegistrar internal registrar;

	function setUp() public {
		registrar = new DomainRegistrar(address(this));
		vm.deal(address(this), 10 ether);
	}

	function test_DeploymentAndElapsedTimeDoNotStartRound() public {
		assertEq(registrar.getCurrentRound(), 0);
		vm.warp(block.timestamp + 100_000);
		assertEq(registrar.getCurrentRound(), 0);
		assertEq(registrar.commitmentCount(), 0);
		assertEq(registrar.totalLockedDeposits(), 0);
	}

	function test_AnyoneCanStartFirstRoundAfterDelay() public {
		uint256 requestedAt = block.timestamp + 777;
		vm.warp(requestedAt);
		vm.prank(address(202));
		uint256 roundId = registrar.startRound();

		assertEq(roundId, 1);
		assertEq(registrar.getCurrentRound(), 1);
		assertEq(registrar.getRound(1).startTime, requestedAt);
		assertEq(registrar.treasury(), address(this));
	}

	function test_CommitRequiresAnExplicitlyStartedRound() public {
		uint256 deposit = registrar.COMMIT_DEPOSIT();
		bytes32 digest = keccak256("example commitment");

		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.commit{value: deposit}(1, digest);
		assertEq(registrar.commitmentCount(), 0);
		assertEq(address(registrar).balance, 0);

		registrar.startRound();
		uint256 id = registrar.commit{value: deposit}(1, digest);
		assertEq(id, 1);
		assertEq(registrar.totalLockedDeposits(), deposit);
	}

	function test_RoundOneDeadlines() public {
		uint256 startedAt = block.timestamp;
		registrar.startRound();
		DomainRegistrar.RoundInfo memory info = registrar.getRound(1);
		assertEq(info.startTime, startedAt);
		assertEq(info.commitEnd, startedAt + 120);
		assertEq(info.revealEnd, startedAt + 240);
	}

	function test_StartedRoundBeginsInCommitPhase() public {
		registrar.startRound();
		assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Commit);
	}

	function test_RoundOneIncludesBothWindows() public {
		registrar.startRound();
		uint256 start = registrar.getRound(1).startTime;
		vm.warp(start + 119);
		assertEq(registrar.getCurrentRound(), 1);
		vm.warp(start + 120);
		assertEq(registrar.getCurrentRound(), 1);
		vm.warp(start + 239);
		assertEq(registrar.getCurrentRound(), 1);
	}

	function test_CommitEndsAt120Seconds() public {
		registrar.startRound();
		uint256 start = registrar.getRound(1).startTime;
		vm.warp(start + 119);
		assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Commit);
		vm.warp(start + 120);
		assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Reveal);
	}

	function test_RevealEndsAt240Seconds() public {
		registrar.startRound();
		uint256 start = registrar.getRound(1).startTime;
		vm.warp(start + 239);
		assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Reveal);
		vm.warp(start + 240);
		assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Ended);
	}

	function test_EndedRoundStaysLatestUntilExplicitStart() public {
		registrar.startRound();
		uint256 start = registrar.getRound(1).startTime;
		vm.warp(start + 240);
		assertEq(registrar.getCurrentRound(), 1);
		vm.warp(start + 100_000);
		assertEq(registrar.getCurrentRound(), 1);
		assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Ended);
	}

	function test_RejectsStartingDuringCommitAndReveal() public {
		registrar.startRound();
		DomainRegistrar.RoundInfo memory first = registrar.getRound(1);

		vm.expectRevert(bytes("ROUND NOT ENDED"));
		registrar.startRound();
		vm.warp(first.startTime + 119);
		vm.expectRevert(bytes("ROUND NOT ENDED"));
		registrar.startRound();
		vm.warp(first.commitEnd);
		vm.expectRevert(bytes("ROUND NOT ENDED"));
		registrar.startRound();
		vm.warp(first.revealEnd - 1);
		vm.expectRevert(bytes("ROUND NOT ENDED"));
		registrar.startRound();

		assertEq(registrar.getCurrentRound(), 1);
		assertEq(registrar.getRound(1).revealEnd, first.revealEnd);
	}

	function test_NextRoundCanStartAtRevealDeadline() public {
		registrar.startRound();
		uint256 deadline = registrar.getRound(1).revealEnd;
		vm.warp(deadline);
		vm.prank(address(203));
		uint256 roundId = registrar.startRound();

		DomainRegistrar.RoundInfo memory second = registrar.getRound(2);
		assertEq(roundId, 2);
		assertEq(registrar.getCurrentRound(), 2);
		assertEq(second.startTime, deadline);
		assertEq(second.commitEnd, deadline + 120);
		assertEq(second.revealEnd, deadline + 240);
		assertTrue(second.phase == DomainRegistrar.Phase.Commit);
		assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Ended);
	}

	function test_DelayedNextRoundGetsFreshWindows() public {
		registrar.startRound();
		uint256 requestedAt = registrar.getRound(1).revealEnd + 777;
		vm.warp(requestedAt);
		assertEq(registrar.getCurrentRound(), 1);
		registrar.startRound();

		DomainRegistrar.RoundInfo memory second = registrar.getRound(2);
		assertEq(second.startTime, requestedAt);
		assertEq(second.commitEnd, requestedAt + 120);
		assertEq(second.revealEnd, requestedAt + 240);
	}

	function test_RoundTwoFollowsItsOwnSchedule() public {
		registrar.startRound();
		uint256 requestedAt = registrar.getRound(1).revealEnd + 777;
		vm.warp(requestedAt);
		registrar.startRound();

		vm.warp(requestedAt + 119);
		assertTrue(registrar.getRound(2).phase == DomainRegistrar.Phase.Commit);
		vm.warp(requestedAt + 120);
		assertTrue(registrar.getRound(2).phase == DomainRegistrar.Phase.Reveal);
		vm.warp(requestedAt + 239);
		assertTrue(registrar.getRound(2).phase == DomainRegistrar.Phase.Reveal);
		vm.warp(requestedAt + 240);
		assertTrue(registrar.getRound(2).phase == DomainRegistrar.Phase.Ended);
		assertEq(registrar.getCurrentRound(), 2);
	}

	function test_KeepsEarlierRoundDeadlines() public {
		registrar.startRound();
		DomainRegistrar.RoundInfo memory first = registrar.getRound(1);
		vm.warp(first.revealEnd + 777);
		registrar.startRound();

		DomainRegistrar.RoundInfo memory earlier = registrar.getRound(1);
		assertEq(earlier.startTime, first.startTime);
		assertEq(earlier.commitEnd, first.commitEnd);
		assertEq(earlier.revealEnd, first.revealEnd);
		assertTrue(earlier.phase == DomainRegistrar.Phase.Ended);
	}

	function test_LaterRoundIdsOnlyIncreaseOnStartCalls() public {
		for (uint256 roundId = 1; roundId <= 4; ++roundId) {
			if (roundId > 1) {
				uint256 deadline = registrar.getRound(roundId - 1).revealEnd;
				vm.warp(deadline + 999);
			}
			vm.prank(address(uint160(200 + roundId)));
			assertEq(registrar.startRound(), roundId);
			assertEq(registrar.getCurrentRound(), roundId);
		}
		vm.warp(block.timestamp + 100_000);
		assertEq(registrar.getCurrentRound(), 4);
	}

	function test_RejectsRoundZero() public {
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.getRound(0);
		registrar.startRound();
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.getRound(0);
	}

	function test_RejectsUnstartedRounds() public {
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.getRound(1);
		registrar.startRound();
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.getRound(2);
		vm.expectRevert(bytes("INVALID ROUND"));
		registrar.getRound(type(uint256).max);
	}

	function test_NewRoundPreservesDepositsCreditsAndOwner() public {
		registrar.startRound();
		uint256 deposit = registrar.COMMIT_DEPOSIT();
		uint256 bid = 0.006 ether;
		bytes32 salt = bytes32(uint256(123));
		address winner = address(101);
		address otherBidder = address(102);
		vm.deal(winner, deposit);
		vm.deal(otherBidder, deposit);

		bytes32 digest = registrar.computeCommitment(1, winner, "alice", bid, salt);
		vm.prank(winner);
		uint256 winningId = registrar.commit{value: deposit}(1, digest);
		vm.prank(otherBidder);
		uint256 unopenedId = registrar.commit{value: deposit}(1, keccak256("unopened"));

		DomainRegistrar.RoundInfo memory first = registrar.getRound(1);
		vm.warp(first.commitEnd);
		vm.prank(winner);
		assertTrue(registrar.reveal(winningId, "alice", bid, salt));
		vm.warp(first.revealEnd);
		registrar.finalizeName("alice");
		vm.prank(winner);
		registrar.settleCommit(winningId);
		registrar.startRound();

		assertEq(registrar.getCurrentRound(), 2);
		assertEq(registrar.ownerOf("alice"), winner);
		assertEq(registrar.resolve("alice"), winner);
		assertEq(registrar.totalLockedDeposits(), deposit);
		assertEq(registrar.withdrawalCredits(winner), deposit - bid);
		assertEq(registrar.totalWithdrawalCredits(), deposit);
		assertEq(registrar.withdrawalCredits(registrar.treasury()), bid);
		assertEq(address(registrar).balance, 2 * deposit);
		assertEq(registrar.getCommitment(unopenedId).roundId, 1);
		assertFalse(registrar.getCommitment(unopenedId).settled);
		assertTrue(registrar.getCommitment(winningId).settled);
	}

	function testFuzz_DelayedFirstRoundKeepsFullWindows(uint32 delay) public {
		uint256 requestedAt = block.timestamp + uint256(delay);
		vm.warp(requestedAt);
		registrar.startRound();
		DomainRegistrar.RoundInfo memory first = registrar.getRound(1);
		assertEq(first.startTime, requestedAt);
		assertEq(first.commitEnd, requestedAt + 120);
		assertEq(first.revealEnd, requestedAt + 240);

		vm.warp(requestedAt + 119);
		assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Commit);
		vm.warp(requestedAt + 120);
		assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Reveal);
		vm.warp(requestedAt + 240);
		assertTrue(registrar.getRound(1).phase == DomainRegistrar.Phase.Ended);
		assertEq(registrar.getCurrentRound(), 1);
	}
}
