import { expect } from "chai";
import { describe, it } from "mocha";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

async function prepareTwoPendingNames() {
	const [alice, bob, carol, outsider] = await ethers.getSigners();
	const registrar = await ethers.deployContract("DomainRegistrar");
	await registrar.waitForDeployment();
	const start = await registrar.startRound();
	await start.wait();
	const deposit = await registrar.COMMIT_DEPOSIT();
	const salt = ethers.id("test-only-auction-records-salt");
	const bids = [
		{ bidder: alice, label: "alice", bid: ethers.parseEther("0.004") },
		{ bidder: bob, label: "alice", bid: ethers.parseEther("0.006") },
		{ bidder: carol, label: "bob", bid: ethers.parseEther("0.005") },
	];
	for (const bid of bids) {
		const digest = await registrar.computeCommitment(
			1n, bid.bidder.address, bid.label, bid.bid, salt
		);
		const commit = await registrar.connect(bid.bidder).commit(1n, digest, { value: deposit });
		await commit.wait();
	}
	const first = await registrar.getRound(1n);
	expect(first.pendingDomainCount).to.equal(0n);
	await networkHelpers.time.increaseTo(first.commitEnd);
	for (const [index, bid] of bids.entries()) {
		const reveal = await registrar.connect(bid.bidder).reveal(
			BigInt(index + 1), bid.label, bid.bid, salt
		);
		await reveal.wait();
	}
	expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(2n);
	return { registrar, alice, bob, carol, outsider, deposit, salt, first };
}

describe("DomainRegistrar auction records", function () {
	it("exposes pending counts, finalization history and cleared reservations", async function () {
		const { registrar, bob, carol, outsider, deposit, first } = await prepareTwoPendingNames();
		const before = await registrar.getAuctionForRound(1n, "alice");
		expect(before.roundId).to.equal(1n);
		expect(before.winningCommitmentId).to.equal(2n);
		expect(before.highestBidder).to.equal(bob.address);
		expect(before.finalized).to.equal(false);

		await networkHelpers.time.increaseTo(first.revealEnd);
		await expect(registrar.connect(outsider).finalizeDomain(1n, "alice"))
			.to.emit(registrar, "DomainFinalized")
			.withArgs(ethers.id("alice"), 1n, bob.address, "alice", 2n, ethers.parseEther("0.006"));

		expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(1n);
		expect(await registrar.ownerOf("alice")).to.equal(bob.address);
		expect(await registrar.resolve("alice")).to.equal(bob.address);
		expect(await registrar.reservedRound("alice")).to.equal(0n);
		expect((await registrar.getAuctionForRound(1n, "alice")).finalized).to.equal(true);
		expect((await registrar.getAuction("alice")).finalized).to.equal(true);
		await expect(registrar.finalizeDomain(1n, "alice")).to.be.revertedWith("ALREADY FINALIZED");
		expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(1n);

		const finishOtherName = await registrar.finalizeName("bob");
		await finishOtherName.wait();
		expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(0n);
		expect((await registrar.getAuctionForRound(1n, "bob")).finalized).to.equal(true);
		expect(await registrar.ownerOf("bob")).to.equal(carol.address);
		expect(await ethers.provider.getBalance(await registrar.getAddress())).to.equal(3n * deposit);
	});

	it("finalizes an older record without changing the newer round's count or schedule", async function () {
		const { registrar, carol, outsider, deposit, salt, first } = await prepareTwoPendingNames();
		await networkHelpers.time.increaseTo(first.revealEnd);
		const startSecond = await registrar.connect(outsider).startRound();
		await startSecond.wait();
		const secondBefore = await registrar.getRound(2n);
		expect(secondBefore.pendingDomainCount).to.equal(0n);
		expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(2n);

		const laterBid = ethers.parseEther("0.003");
		const digest = await registrar.computeCommitment(2n, carol.address, "carol", laterBid, salt);
		const commit = await registrar.connect(carol).commit(2n, digest, { value: deposit });
		await commit.wait();
		await networkHelpers.time.increaseTo(secondBefore.commitEnd);
		const reveal = await registrar.connect(carol).reveal(4n, "carol", laterBid, salt);
		await reveal.wait();
		expect((await registrar.getRound(2n)).pendingDomainCount).to.equal(1n);

		const finalization = await registrar.connect(outsider).finalizeDomain(1n, "alice");
		await finalization.wait();
		const secondAfter = await registrar.getRound(2n);
		expect(await registrar.getCurrentRound()).to.equal(2n);
		expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(1n);
		expect(secondAfter.pendingDomainCount).to.equal(1n);
		expect(secondAfter.startTime).to.equal(secondBefore.startTime);
		expect(secondAfter.commitEnd).to.equal(secondBefore.commitEnd);
		expect(secondAfter.revealEnd).to.equal(secondBefore.revealEnd);
		expect(secondAfter.phase).to.equal(2n);
		expect((await registrar.getAuctionForRound(1n, "alice")).finalized).to.equal(true);
		expect((await registrar.getAuctionForRound(2n, "alice")).winningCommitmentId).to.equal(0n);
		expect((await registrar.getAuctionForRound(2n, "carol")).highestBidder).to.equal(carol.address);
		expect((await registrar.getAuctionForRound(2n, "carol")).finalized).to.equal(false);
		expect(await registrar.reservedRound("bob")).to.equal(1n);
		expect(await registrar.reservedRound("carol")).to.equal(2n);
	});
});
