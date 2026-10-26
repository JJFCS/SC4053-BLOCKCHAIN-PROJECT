
// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.34;

import { Test } from "forge-std/Test.sol";
import { DomainRegistrar } from "./DomainRegistrar.sol";

contract DomainRegistrarCommitTest is Test {
    DomainRegistrar internal registrar;
    uint256         internal deposit;
    bytes32         internal digest;

    function setUp() public {
        registrar = new DomainRegistrar(address(this));
        registrar.startRound();
        deposit   = registrar.COMMIT_DEPOSIT();
        digest    = keccak256("example commitment");

        vm.deal(address(this), 10 * deposit);
    }

    function test_CommitStoresRecordAndDeposit() public {
        uint256 id = registrar.commit{value: deposit}(1, digest);

        DomainRegistrar.CommitmentInfo memory info = registrar.getCommitment(id);

        assertEq(id, 1);
        assertEq(info.bidder, address(this));
        assertEq(info.digest, digest);
        assertEq(info.roundId, 1);
        assertEq(info.deposit, deposit);

        assertEq(registrar.commitmentCount(), 1);
        assertEq(registrar.totalLockedDeposits(), deposit);
        assertEq(address(registrar).balance, deposit);
    }

    function test_CommitRequiresExactDeposit() public {
        vm.expectRevert(bytes("INCORRECT DEPOSIT"));
        registrar.commit(1, digest);

        vm.expectRevert(bytes("INCORRECT DEPOSIT"));
        registrar.commit{value: deposit - 1}(1, digest);

        vm.expectRevert(bytes("INCORRECT DEPOSIT"));
        registrar.commit{value: deposit + 1}(1, digest);

        assertEq(registrar.commitmentCount(), 0);
        assertEq(registrar.totalLockedDeposits(), 0);
        assertEq(address(registrar).balance, 0);
    }

    function test_CommitRejectsWrongRoundAndRevealPhase() public {
        vm.expectRevert(bytes("INVALID ROUND"));
        registrar.commit{value: deposit}(0, digest);

        vm.expectRevert(bytes("INVALID ROUND"));
        registrar.commit{value: deposit}(2, digest);

        vm.warp(registrar.getRound(1).startTime + 120);

        vm.expectRevert(bytes("NOT COMMIT PHASE"));
        registrar.commit{value: deposit}(1, digest);

        vm.warp(registrar.getRound(1).startTime + 240);

        vm.expectRevert(bytes("NOT COMMIT PHASE"));
        registrar.commit{value: deposit}(1, digest);

        registrar.startRound();
        vm.expectRevert(bytes("WRONG ROUND"));
        registrar.commit{value: deposit}(1, digest);

        assertEq(registrar.commitmentCount(), 0);
        assertEq(address(registrar).balance, 0);
    }

    function test_CommitRejectsEmptyHash() public {
        vm.expectRevert(bytes("EMPTY COMMITMENT"));
        registrar.commit{value: deposit}(1, bytes32(0));
    }

    function test_CommitRejectsSecondCommitmentEvenWithAnotherHash() public {
        uint256 firstId = registrar.commit{value: deposit}(1, digest);

        vm.expectRevert(bytes("ALREADY COMMITTED"));
        registrar.commit{value: deposit}(1, digest);

        assertEq(registrar.commitmentCount(), 1);

		vm.expectRevert(bytes("ALREADY COMMITTED"));
		registrar.commit{value: deposit}(
            1,
            keccak256("another commitment")
        );

        assertEq(firstId, 1);
		assertEq(registrar.getCommitmentId(1, address(this)), firstId);
		assertEq(registrar.getCommitment(firstId).digest, digest);
        assertEq(registrar.commitmentCount(), 1);
        assertEq(registrar.totalLockedDeposits(), deposit);
        assertEq(address(registrar).balance, deposit);
    }

    function test_CommitAllowsSameHashFromAnotherBidder() public {
        registrar.commit{value: deposit}(1, digest);

        address otherBidder = address(123);
        vm.deal(otherBidder, deposit);

        vm.prank(otherBidder);
        uint256 secondId = registrar.commit{value: deposit}(1, digest);

        assertEq(secondId, 2);
        assertEq(
            registrar.getCommitment(secondId).bidder,
            otherBidder
        );
        assertEq(
            registrar.getCommitment(1).bidder,
            address(this)
        );
        assertEq(registrar.totalLockedDeposits(), 2 * deposit);
    }

    function test_GetCommitmentRejectsUnknownId() public {
        vm.expectRevert(bytes("INVALID COMMITMENT"));
        registrar.getCommitment(0);

        vm.expectRevert(bytes("INVALID COMMITMENT"));
        registrar.getCommitment(1);
    }

    function test_CommitAcceptsNextRoundAtItsStart() public {
        uint256 firstId = registrar.commit{value: deposit}(1, digest);

        vm.warp(registrar.getRound(1).startTime + 240);
        registrar.startRound();

        uint256 secondId = registrar.commit{value: deposit}(2, digest);

        assertEq(firstId, 1);
        assertEq(secondId, 2);
        assertEq(registrar.getCommitment(secondId).roundId, 2);
        assertEq(registrar.totalLockedDeposits(), 2 * deposit);
    }
}
