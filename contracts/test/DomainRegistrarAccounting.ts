import { expect } from "chai";
import { describe, it } from "mocha";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

async function prepareAccounting() {
	const [deployer, treasury, winner, loser, unrevealed, outsider] = await ethers.getSigners();
	const registrar = await ethers.deployContract("DomainRegistrar", [treasury.address]);
	await registrar.waitForDeployment();
	await (await registrar.startRound()).wait();
	const deposit = await registrar.COMMIT_DEPOSIT();
	const penalty = await registrar.NON_REVEAL_PENALTY();
	const winningBid = 30000000000000001n;
	const losingBid = 20000000000000000n;
	const salt = ethers.id("accounting-test-only-salt");
	const { chainId } = await ethers.provider.getNetwork();
	const registrarAddress = await registrar.getAddress();
	const bids = [[winner, "alice", winningBid], [loser, "alice", losingBid], [unrevealed, "unopened", 1n]] as const;
	for (const [bidder, label, amount] of bids) {
		const digest = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
			["uint256", "address", "uint256", "address", "string", "uint256", "bytes32"],
			[chainId, registrarAddress, 1n, bidder.address, label, amount, salt],
		));
		await (await registrar.connect(bidder).commitBid(1n, digest, { value: deposit })).wait();
	}
	const round = await registrar.getRound(1n);
	await networkHelpers.time.increaseTo(round.commitEnd);
	await (await registrar.connect(loser).revealBid(1n, "alice", losingBid, salt)).wait();
	await (await registrar.connect(winner).revealBid(1n, "alice", winningBid, salt)).wait();
	await networkHelpers.time.increaseTo(round.revealEnd);
	return { registrar, deployer, treasury, winner, loser, unrevealed, outsider, deposit, penalty, winningBid, salt, round };
}

describe("DomainRegistrar accounting", function () {
	it("credits the exact winning price once and pays all three deposit outcomes", async function () {
		const { registrar, treasury, winner, loser, unrevealed, outsider, deposit, penalty, winningBid } = await networkHelpers.loadFixture(prepareAccounting);
		await expect(registrar.connect(winner).settleBid(1n)).to.be.revertedWith("DOMAIN NOT FINALIZED");
		await expect(registrar.connect(outsider).finalizeDomain(1n, "alice"))
			.to.emit(registrar, "DomainFinalized")
			.withArgs(ethers.id("alice"), 1n, winner.address, "alice", 1n, winningBid);
		expect((await registrar.getDomain("alice")).priceWei.toString()).to.equal("30000000000000001");
		expect(await registrar.withdrawalCredits(treasury.address)).to.equal(winningBid);
		expect(await registrar.totalLockedDeposits()).to.equal(3n * deposit - winningBid);
		await expect(registrar.connect(treasury).withdraw())
			.to.emit(registrar, "Withdrawn").withArgs(treasury.address, winningBid);
		await expect(registrar.connect(winner).settleBid(1n))
			.to.emit(registrar, "CommitmentSettled").withArgs(1n, 1n, winner.address, deposit - winningBid, 0n);
		expect(await registrar.withdrawalCredits(treasury.address)).to.equal(0n);
		await expect(registrar.connect(loser).settleBid(1n))
			.to.emit(registrar, "CommitmentSettled").withArgs(2n, 1n, loser.address, deposit, 0n);
		await expect(registrar.connect(unrevealed).settleBid(1n))
			.to.emit(registrar, "CommitmentSettled").withArgs(3n, 1n, unrevealed.address, deposit - penalty, penalty);
		expect(await registrar.withdrawalCredits(unrevealed.address)).to.equal(ethers.parseEther("0.099"));
		expect(await registrar.withdrawalCredits(treasury.address)).to.equal(penalty);
		expect(await registrar.totalLockedDeposits()).to.equal(0n);
		expect(await registrar.totalWithdrawalCredits()).to.equal(3n * deposit - winningBid);
		await expect(registrar.connect(winner).withdraw()).to.changeEtherBalance(ethers, winner, deposit - winningBid);
		await expect(registrar.connect(loser).withdraw()).to.changeEtherBalance(ethers, loser, deposit);
		await expect(registrar.connect(unrevealed).withdraw()).to.changeEtherBalance(ethers, unrevealed, deposit - penalty);
		await expect(registrar.connect(treasury).withdraw()).to.changeEtherBalance(ethers, treasury, penalty);
		expect(await registrar.totalWithdrawalCredits()).to.equal(0n);
		expect(await ethers.provider.getBalance(await registrar.getAddress())).to.equal(0n);
		await expect(registrar.connect(treasury).withdraw()).to.be.revertedWith("NO CREDIT");
		await expect(registrar.connect(winner).settleBid(1n)).to.be.revertedWith("ALREADY SETTLED");
	});

	it("keeps an unrelated newer deposit locked while older bids settle and withdraw", async function () {
		const { registrar, treasury, winner, loser, unrevealed, outsider, deposit, penalty } = await networkHelpers.loadFixture(prepareAccounting);
		await (await registrar.startRound()).wait();
		const secondBefore = await registrar.getRound(2n);
		await (await registrar.connect(outsider).commitBid(2n, ethers.id("later hidden bid"), { value: deposit })).wait();
		await (await registrar.connect(unrevealed).settleBid(1n)).wait();
		expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(1n);
		expect(await registrar.withdrawalCredits(treasury.address)).to.equal(penalty);
		await expect(registrar.connect(winner).settleBid(1n)).to.be.revertedWith("DOMAIN NOT FINALIZED");
		await (await registrar.finalizeDomain(1n, "alice")).wait();
		await (await registrar.connect(winner).settleBid(1n)).wait();
		await (await registrar.connect(loser).settleBid(1n)).wait();
		for (const wallet of [winner, loser, unrevealed, treasury]) {
			await (await registrar.connect(wallet).withdraw()).wait();
		}
		const secondAfter = await registrar.getRound(2n);
		expect(secondAfter.startTime).to.equal(secondBefore.startTime);
		expect(secondAfter.commitEnd).to.equal(secondBefore.commitEnd);
		expect(secondAfter.revealEnd).to.equal(secondBefore.revealEnd);
		expect(secondAfter.pendingDomainCount).to.equal(0n);
		expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(0n);
		expect((await registrar.getCommitmentForRound(2n, outsider.address)).settled).to.equal(false);
		expect(await registrar.totalLockedDeposits()).to.equal(deposit);
		expect(await registrar.totalWithdrawalCredits()).to.equal(0n);
		expect(await ethers.provider.getBalance(await registrar.getAddress())).to.equal(deposit);
	});

	it("exposes the fixed configuration for historical rounds and rejects a zero treasury", async function () {
		const { registrar, deployer, treasury, deposit, penalty, round } = await networkHelpers.loadFixture(prepareAccounting);
		expect(deposit).to.equal(ethers.parseEther("0.1"));
		expect(penalty).to.equal(ethers.parseEther("0.001"));
		expect(await registrar.treasury()).to.equal(treasury.address);
		expect(round.deposit).to.equal(deposit);
		expect(round.nonRevealPenalty).to.equal(penalty);
		expect(round.treasury).to.equal(treasury.address);
		await (await registrar.startRound()).wait();
		for (const roundId of [1n, 2n]) {
			const recorded = await registrar.getRound(roundId);
			expect(recorded.deposit).to.equal(deposit);
			expect(recorded.nonRevealPenalty).to.equal(penalty);
			expect(recorded.treasury).to.equal(treasury.address);
		}
		await expect(registrar.connect(deployer).withdraw()).to.be.revertedWith("NO CREDIT");
		await expect(ethers.deployContract("DomainRegistrar", [ethers.ZeroAddress])).to.be.revertedWith("ZERO TREASURY");
	});
});
