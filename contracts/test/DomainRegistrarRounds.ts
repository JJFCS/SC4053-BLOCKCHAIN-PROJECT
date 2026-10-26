import { expect } from "chai";
import { describe, it } from "mocha";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("DomainRegistrar explicit rounds", function () {
	it("waits for an explicit start and emits the recorded schedule", async function () {
		const [, starter] = await ethers.getSigners();
		const registrar = await ethers.deployContract("DomainRegistrar", [(await ethers.getSigners())[0].address]);
		await registrar.waitForDeployment();

		await networkHelpers.time.increase(777);
		expect(await registrar.getCurrentRound()).to.equal(0n);
		await expect(registrar.getRound(1n)).to.be.revertedWith("INVALID ROUND");

		const startTime = BigInt(await networkHelpers.time.latest()) + 1_000n;
		await networkHelpers.time.setNextBlockTimestamp(startTime);
		await expect(registrar.connect(starter).startRound())
			.to.emit(registrar, "RoundStarted")
			.withArgs(1n, starter.address, startTime, startTime + 120n, startTime + 240n);

		const first = await registrar.getRound(1n);
		expect(await registrar.getCurrentRound()).to.equal(1n);
		expect(first.startTime).to.equal(startTime);
		expect(first.commitEnd).to.equal(startTime + 120n);
		expect(first.revealEnd).to.equal(startTime + 240n);
		expect(first.phase).to.equal(1n);
	});

	it("rejects overlapping starts and leaves ended rounds recorded", async function () {
		const [, starter] = await ethers.getSigners();
		const registrar = await ethers.deployContract("DomainRegistrar", [(await ethers.getSigners())[0].address]);
		await registrar.waitForDeployment();
		const firstStart = await registrar.startRound();
		await firstStart.wait();
		const first = await registrar.getRound(1n);

		await expect(registrar.connect(starter).startRound()).to.be.revertedWith("ROUND NOT ENDED");
		await networkHelpers.time.increaseTo(first.revealEnd);
		expect(await registrar.getCurrentRound()).to.equal(1n);
		expect((await registrar.getRound(1n)).phase).to.equal(3n);
		await expect(registrar.getRound(2n)).to.be.revertedWith("INVALID ROUND");

		const secondStart = await registrar.connect(starter).startRound();
		await secondStart.wait();
		const second = await registrar.getRound(2n);
		const historical = await registrar.getRound(1n);
		expect(await registrar.getCurrentRound()).to.equal(2n);
		expect(second.startTime >= first.revealEnd).to.equal(true);
		expect(second.commitEnd - second.startTime).to.equal(120n);
		expect(second.revealEnd - second.commitEnd).to.equal(120n);
		expect(historical.startTime).to.equal(first.startTime);
		expect(historical.commitEnd).to.equal(first.commitEnd);
		expect(historical.revealEnd).to.equal(first.revealEnd);
	});

	it("finalizes and settles an older auction while a newer round accepts bids", async function () {
		const [winner, laterBidder, starter] = await ethers.getSigners();
		const registrar = await ethers.deployContract("DomainRegistrar", [(await ethers.getSigners())[0].address]);
		await registrar.waitForDeployment();
		const firstStart = await registrar.startRound();
		await firstStart.wait();

		const deposit = await registrar.COMMIT_DEPOSIT();
		const bid = ethers.parseEther("0.006");
		const salt = ethers.id("test-only-explicit-round-salt");
		const digest = await registrar.computeCommitment(1n, winner.address, "alice", bid, salt);
		const commit = await registrar.connect(winner).commit(1n, digest, { value: deposit });
		await commit.wait();
		const first = await registrar.getRound(1n);
		await networkHelpers.time.increaseTo(first.commitEnd);
		const reveal = await registrar.connect(winner).reveal(1n, "alice", bid, salt);
		await reveal.wait();
		await networkHelpers.time.increaseTo(first.revealEnd);

		const secondStart = await registrar.connect(starter).startRound();
		await secondStart.wait();
		const secondBefore = await registrar.getRound(2n);
		const laterDigest = await registrar.computeCommitment(
			2n, laterBidder.address, "bob", bid, salt
		);
		const laterCommit = await registrar.connect(laterBidder).commit(
			2n, laterDigest, { value: deposit }
		);
		await laterCommit.wait();

		const finalization = await registrar.connect(starter).finalizeName("alice");
		await finalization.wait();
		const settlement = await registrar.connect(winner).settleBid(1n);
		await settlement.wait();

		const secondAfter = await registrar.getRound(2n);
		const laterRecord = await registrar.getCommitment(2n);
		expect(await registrar.ownerOf("alice")).to.equal(winner.address);
		expect(await registrar.getCurrentRound()).to.equal(2n);
		expect(secondAfter.startTime).to.equal(secondBefore.startTime);
		expect(secondAfter.commitEnd).to.equal(secondBefore.commitEnd);
		expect(secondAfter.revealEnd).to.equal(secondBefore.revealEnd);
		expect(secondAfter.phase).to.equal(1n);
		expect(laterRecord.roundId).to.equal(2n);
		expect(laterRecord.revealed).to.equal(false);
		expect(laterRecord.settled).to.equal(false);
		expect(await registrar.totalLockedDeposits()).to.equal(deposit);
		expect(await registrar.totalWithdrawalCredits()).to.equal(deposit);
		// The default deployer is both treasury and winning bidder in this test.
		expect(await registrar.withdrawalCredits(winner.address)).to.equal(deposit);
		expect(await ethers.provider.getBalance(await registrar.getAddress())).to.equal(2n * deposit);
	});
});
