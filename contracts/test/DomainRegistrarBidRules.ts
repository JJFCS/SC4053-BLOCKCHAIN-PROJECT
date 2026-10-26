import { expect } from "chai";
import { describe, it } from "mocha";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

function hashBid(
	chainId: bigint,
	registrarAddress: string,
	roundId: bigint,
	bidderAddress: string,
	label: string,
	bidWei: bigint,
	salt: string,
) {
	return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
		["uint256", "address", "uint256", "address", "string", "uint256", "bytes32"],
		[chainId, registrarAddress, roundId, bidderAddress, label, bidWei, salt],
	));
}

async function deployBidRules() {
	const registrar = await ethers.deployContract("DomainRegistrar");
	await registrar.waitForDeployment();
	await (await registrar.startRound()).wait();
	const [bidder, other] = await ethers.getSigners();
	const deposit = await registrar.COMMIT_DEPOSIT();
	const { chainId } = await ethers.provider.getNetwork();
	const registrarAddress = await registrar.getAddress();
	const bidWei = 9007199254740993n; // Above JavaScript's exact Number integer range.
	const salt = ethers.id("bid-rules-test-only-salt");
	const digest = hashBid(chainId, registrarAddress, 1n, bidder.address, "alice", bidWei, salt);
	return { registrar, bidder, other, deposit, chainId, registrarAddress, bidWei, salt, digest };
}

describe("DomainRegistrar bid rules", function () {
	it("records a locally calculated commitment with only public receipt fields", async function () {
		const { registrar, bidder, deposit, digest } = await networkHelpers.loadFixture(deployBidRules);
		const transactionPromise = registrar.connect(bidder).commitBid(1n, digest, { value: deposit });
		await expect(transactionPromise)
			.to.emit(registrar, "CommitmentSubmitted")
			.withArgs(1n, 1n, bidder.address, digest);
		const transaction = await transactionPromise;
		const decoded = registrar.interface.parseTransaction({ data: transaction.data, value: transaction.value });
		expect(decoded?.name).to.equal("commitBid");
		expect(Array.from(decoded!.args)).to.deep.equal([1n, digest]);
		expect(transaction.value).to.equal(deposit);
		expect(registrar.interface.getEvent("CommitmentSubmitted")?.inputs.map((input) => input.type))
			.to.deep.equal(["uint256", "uint256", "address", "bytes32"]);

		const record = await registrar.getCommitmentForRound(1n, bidder.address);
		expect(record.digest).to.equal(digest);
		expect(record.bidder).to.equal(bidder.address);
		expect(record.deposit).to.equal(deposit);
		expect(record.revealed).to.equal(false);
		expect(record.labelHash).to.equal(ethers.ZeroHash);
		expect(record.bidWei).to.equal(0n);
		expect(await registrar.getCommitmentId(1n, bidder.address)).to.equal(1n);
		expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(0n);
		expect((await registrar.getAuctionForRound(1n, "alice")).winningCommitmentId).to.equal(0n);
	});

	it("rejects duplicate commits across both entry points without replacing records", async function () {
		const { registrar, bidder, other, deposit, digest } = await networkHelpers.loadFixture(deployBidRules);
		await (await registrar.commitBid(1n, digest, { value: deposit })).wait();
		await expect(registrar.commit(1n, ethers.id("replacement"), { value: deposit }))
			.to.be.revertedWith("ALREADY COMMITTED");
		await (await registrar.connect(other).commit(1n, digest, { value: deposit })).wait();
		await expect(registrar.connect(other).commitBid(1n, digest, { value: deposit }))
			.to.be.revertedWith("ALREADY COMMITTED");

		expect(await registrar.getCommitmentId(1n, bidder.address)).to.equal(1n);
		expect(await registrar.getCommitmentId(1n, other.address)).to.equal(2n);
		expect((await registrar.getCommitmentForRound(1n, bidder.address)).digest).to.equal(digest);
		expect(await registrar.commitmentCount()).to.equal(2n);
		expect(await registrar.totalLockedDeposits()).to.equal(2n * deposit);
		expect(await ethers.provider.getBalance(await registrar.getAddress())).to.equal(2n * deposit);
	});

	it("preserves exact wei and the unused record until a correct reveal succeeds", async function () {
		const { registrar, bidder, deposit, bidWei, salt, digest } = await networkHelpers.loadFixture(deployBidRules);
		await (await registrar.commitBid(1n, digest, { value: deposit })).wait();
		const before = await registrar.getCommitmentForRound(1n, bidder.address);
		await expect(registrar.revealBid(1n, "alice", bidWei, salt)).to.be.revertedWith("NOT REVEAL PHASE");
		await networkHelpers.time.increaseTo((await registrar.getRound(1n)).commitEnd);
		await expect(registrar.revealBid(1n, "al", bidWei, salt)).to.be.revertedWith("INVALID LABEL");
		await expect(registrar.revealBid(1n, "alice", 0n, salt)).to.be.revertedWith("INVALID BID");
		await expect(registrar.revealBid(1n, "alice", bidWei - 1n, salt))
			.to.be.revertedWith("COMMITMENT MISMATCH");
		await expect(registrar.revealBid(1n, "alice", bidWei, ethers.ZeroHash))
			.to.be.revertedWith("COMMITMENT MISMATCH");
		expect(Array.from(await registrar.getCommitmentForRound(1n, bidder.address))).to.deep.equal(Array.from(before));
		expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(0n);
		expect(await ethers.provider.getBalance(await registrar.getAddress())).to.equal(deposit);

		await expect(registrar.revealBid(1n, "alice", bidWei, salt))
			.to.emit(registrar, "CommitmentRevealed")
			.withArgs(1n, 1n, bidder.address, "alice", bidWei, true);
		expect((await registrar.getCommitmentForRound(1n, bidder.address)).bidWei).to.equal(9007199254740993n);
		expect((await registrar.getAuctionForRound(1n, "alice")).highestBidWei).to.equal(bidWei);
		expect(await registrar.reservedRound("alice")).to.equal(1n);
		expect(await registrar.ownerOf("alice")).to.equal(ethers.ZeroAddress);
		await expect(registrar.reveal(1n, "alice", bidWei, salt)).to.be.revertedWith("ALREADY REVEALED");
		await expect(registrar.revealBid(1n, "alice", bidWei, salt)).to.be.revertedWith("ALREADY REVEALED");
		expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(1n);
	});

	it("allows the same wallet in a later round while preserving its earlier record", async function () {
		const { registrar, bidder, deposit, chainId, registrarAddress, bidWei, salt, digest } = await networkHelpers.loadFixture(deployBidRules);
		await (await registrar.commitBid(1n, digest, { value: deposit })).wait();
		await networkHelpers.time.increaseTo((await registrar.getRound(1n)).revealEnd);
		await (await registrar.startRound()).wait();
		const nextDigest = hashBid(chainId, registrarAddress, 2n, bidder.address, "other", bidWei, salt);
		await (await registrar.commitBid(2n, nextDigest, { value: deposit })).wait();
		expect(await registrar.getCommitmentId(1n, bidder.address)).to.equal(1n);
		expect(await registrar.getCommitmentId(2n, bidder.address)).to.equal(2n);
		expect((await registrar.getCommitmentForRound(1n, bidder.address)).digest).to.equal(digest);
		expect((await registrar.getCommitmentForRound(2n, bidder.address)).digest).to.equal(nextDigest);
		await networkHelpers.time.increaseTo((await registrar.getRound(2n)).commitEnd);
		await expect(registrar.revealBid(1n, "alice", bidWei, salt)).to.be.revertedWith("NOT REVEAL PHASE");
		await (await registrar.revealBid(2n, "other", bidWei, salt)).wait();
		expect((await registrar.getCommitmentForRound(1n, bidder.address)).revealed).to.equal(false);
		expect((await registrar.getCommitmentForRound(2n, bidder.address)).revealed).to.equal(true);
		expect((await registrar.getRound(1n)).pendingDomainCount).to.equal(0n);
		expect((await registrar.getRound(2n)).pendingDomainCount).to.equal(1n);
	});
});
