
import { expect } from "chai";
import { describe , it } from "mocha";
import { network } from "hardhat";

const { ethers , networkHelpers } = await network.create();

describe("DomainRegistrar commitment", function () {

    // this will create a registrar , prepare some example bid details and also calculate
    // the hash 2 different ways and then compare the answers

    it("matches the hash calculated with ethers", async function () {
        const registrar = await ethers.deployContract("DomainRegistrar", [(await ethers.getSigners())[0].address]);
        await registrar.waitForDeployment();
        const startTransaction = await registrar.startRound();
        await startTransaction.wait();

        const [bidder]    = await ethers.getSigners();
        const networkInfo = await ethers.provider.getNetwork();

        const chainId          = networkInfo.chainId;
        const registrarAddress = await registrar.getAddress();
        const roundId          = 1n;
        const label            = "alice";
        const bidWei           = ethers.parseEther("0.004");
        const salt             = ethers.id("test-only-salt");

        const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "address", "uint256", "address", "string", "uint256", "bytes32"],
            [chainId, registrarAddress, roundId, bidder.address, label, bidWei, salt]
        );

        const javascriptHash = ethers.keccak256(encoded);
        const solidityHash = await registrar.computeCommitment(roundId,bidder.address,label,bidWei,salt);

        expect(javascriptHash).to.equal(solidityHash);
    });

    it("emits a receipt for an accepted commitment", async function () {
        const registrar = await ethers.deployContract("DomainRegistrar", [(await ethers.getSigners())[0].address]);
        await registrar.waitForDeployment();
        const startTransaction = await registrar.startRound();
        await startTransaction.wait();

        const [bidder] = await ethers.getSigners();
        const digest   = ethers.id("example commitment");
        const deposit  = await registrar.COMMIT_DEPOSIT();

        await expect(registrar.commit(1n, digest, { value: deposit }))
            .to.emit(registrar, "CommitmentSubmitted")
            .withArgs(1n, 1n, bidder.address, digest);
    });

});


describe("DomainRegistrar reveal", function () {
    it("emits the revealed details and exposes the leading bid", async function () {
        const registrar = await ethers.deployContract("DomainRegistrar", [(await ethers.getSigners())[0].address]);
        await registrar.waitForDeployment();
        const startTransaction = await registrar.startRound();
        await startTransaction.wait();

        const [bidder]  = await ethers.getSigners();

        const roundId      = 1n;
        const commitmentId = 1n;
        const label        = "alice";
        const bidWei       = ethers.parseEther("0.004");
        const salt         = ethers.id("test-only-reveal-salt");
        const deposit      = await registrar.COMMIT_DEPOSIT();

        const digest = await registrar.computeCommitment(roundId,bidder.address,label,bidWei,salt);

        const commitTransaction = await registrar.commit(roundId,digest,{ value: deposit });
        await commitTransaction.wait();

        const round = await registrar.getRound(roundId);
        await networkHelpers.time.increaseTo(round.commitEnd);

        await expect(registrar.reveal(commitmentId, label, bidWei, salt))
            .to.emit(registrar, "CommitmentRevealed")
            .withArgs(commitmentId,roundId,bidder.address,label,bidWei,true);

        const auction = await registrar.getAuction(label);

        expect(auction.roundId).to.equal(roundId);
        expect(auction.winningCommitmentId).to.equal(commitmentId);
        expect(auction.highestBidder).to.equal(bidder.address);
        expect(auction.highestBidWei).to.equal(bidWei);
    });
});


describe("DomainRegistrar ownership", function () {
    it("finalizes for the winner and exposes the owner to ethers", async function () {
        const registrar = await ethers.deployContract("DomainRegistrar", [(await ethers.getSigners())[0].address]);
        await registrar.waitForDeployment();
        const startTransaction = await registrar.startRound();
        await startTransaction.wait();

        const [bidder, finalizer] = await ethers.getSigners();

        const roundId      = 1n;
        const commitmentId = 1n;
        const label        = "alice";
        const bidWei       = ethers.parseEther("0.004");
        const salt         = ethers.id("test-only-ownership-salt");
        const deposit      = await registrar.COMMIT_DEPOSIT();

        const digest = await registrar.computeCommitment(roundId, bidder.address, label, bidWei, salt);

        const commitTransaction = await registrar.connect(bidder).commit(roundId, digest, { value: deposit });
        await commitTransaction.wait();

        const round = await registrar.getRound(roundId);
        await networkHelpers.time.increaseTo(round.commitEnd);

        const revealTransaction = await registrar.connect(bidder).reveal(commitmentId, label, bidWei, salt);
        await revealTransaction.wait();

        expect(await registrar.resolve(label)).to.equal(ethers.ZeroAddress);

        await networkHelpers.time.increaseTo(round.revealEnd);
        await expect(registrar.connect(finalizer).finalizeName(label))
            .to.emit(registrar, "DomainFinalized")
            .withArgs(
                ethers.keccak256(ethers.toUtf8Bytes(label)),
                roundId,
                bidder.address,
                label,
                commitmentId,
                bidWei
            );

        expect(await registrar.resolve(label)).to.equal(bidder.address);

        const domain = await registrar.getDomain(label);

        expect(domain.owner).to.equal(bidder.address);
        expect(domain.roundId).to.equal(roundId);
        expect(domain.winningCommitmentId).to.equal(commitmentId);
        expect(domain.priceWei).to.equal(bidWei);
    });
});

describe("DomainRegistrar settlement", function () {
    it("requires the bidder to settle after finalization and credits the price once", async function () {
        const [treasury, bidder, settler] = await ethers.getSigners();

        const registrar = await ethers.deployContract("DomainRegistrar", [(await ethers.getSigners())[0].address]);
        await registrar.waitForDeployment();
        const startTransaction = await registrar.startRound();
        await startTransaction.wait();

        const roundId      = 1n;
        const commitmentId = 1n;
        const label        = "alice";
        const bidWei       = ethers.parseEther("0.006");
        const salt         = ethers.id("test-only-settlement-salt");
        const deposit      = await registrar.COMMIT_DEPOSIT();
        const refundWei    = deposit - bidWei;

        expect(await registrar.treasury()).to.equal(treasury.address);

        const digest = await registrar.computeCommitment(roundId, bidder.address, label, bidWei, salt);
        const commitTransaction = await registrar.connect(bidder).commit(roundId, digest, { value: deposit });
        await commitTransaction.wait();

        const round = await registrar.getRound(roundId);
        await networkHelpers.time.increaseTo(round.commitEnd);

        const revealTransaction = await registrar.connect(bidder).reveal(commitmentId, label, bidWei, salt);
        await revealTransaction.wait();
        await networkHelpers.time.increaseTo(round.revealEnd);
        await expect(registrar.connect(settler).settleCommit(commitmentId))
			.to.be.revertedWith("NOT BIDDER");
		await expect(registrar.connect(bidder).settleBid(roundId)).to.be.revertedWith("DOMAIN NOT FINALIZED");
		await (await registrar.connect(settler).finalizeDomain(roundId, label)).wait();
		expect(await registrar.withdrawalCredits(treasury.address)).to.equal(bidWei);
		await expect(registrar.connect(bidder).settleBid(roundId))
            .to.emit(registrar, "CommitmentSettled")
            .withArgs(commitmentId,roundId,bidder.address,refundWei,0n);

        expect(await registrar.withdrawalCredits(bidder.address)).to.equal(refundWei);
        expect(await registrar.withdrawalCredits(settler.address)).to.equal(0n);
        expect(await registrar.totalWithdrawalCredits()).to.equal(deposit);
        expect(await registrar.withdrawalCredits(await registrar.treasury())).to.equal(bidWei);
        expect(await registrar.totalLockedDeposits()).to.equal(0n);

        const commitment = await registrar.getCommitment(commitmentId);
        expect(commitment.settled).to.equal(true);
        expect(await ethers.provider.getBalance(await registrar.getAddress())).to.equal(deposit);
    });
});

describe("DomainRegistrar withdrawals", function () {
    it("pays the bidder refund and treasury proceeds", async function () {
        const [treasury, bidder] = await ethers.getSigners();

        const registrar = await ethers.deployContract("DomainRegistrar", [(await ethers.getSigners())[0].address]);
        await registrar.waitForDeployment();
        const startTransaction = await registrar.startRound();
        await startTransaction.wait();

        const roundId      = 1n;
        const commitmentId = 1n;
        const label        = "alice";
        const bidWei       = ethers.parseEther("0.006");
        const salt         = ethers.id("test-only-withdrawal-salt");
        const deposit      = await registrar.COMMIT_DEPOSIT();
        const refundWei    = deposit - bidWei;

        const digest = await registrar.computeCommitment(roundId,bidder.address,label,bidWei,salt);
        const commitTransaction = await registrar.connect(bidder).commit(roundId,digest,{ value: deposit });
        await commitTransaction.wait();

        const round = await registrar.getRound(roundId);
        await networkHelpers.time.increaseTo(round.commitEnd);

        const revealTransaction = await registrar.connect(bidder).reveal(commitmentId,label,bidWei,salt);
        await revealTransaction.wait();
        await networkHelpers.time.increaseTo(round.revealEnd);

		await (await registrar.finalizeDomain(roundId, label)).wait();
        const settlementTransaction = await registrar.connect(bidder).settleBid(roundId);
        await settlementTransaction.wait();

        await expect(registrar.connect(bidder).withdraw()).to.emit(registrar, "Withdrawn").withArgs(bidder.address, refundWei);

        expect(await registrar.withdrawalCredits(bidder.address)).to.equal(0n);
        expect(await registrar.totalWithdrawalCredits()).to.equal(bidWei);
        expect(await registrar.withdrawalCredits(await registrar.treasury())).to.equal(bidWei);
        expect(await ethers.provider.getBalance(await registrar.getAddress())).to.equal(bidWei);

        await expect(registrar.connect(treasury).withdraw()).to.emit(registrar, "Withdrawn").withArgs(treasury.address, bidWei);

        expect(await registrar.withdrawalCredits(await registrar.treasury())).to.equal(0n);
        expect(await ethers.provider.getBalance(await registrar.getAddress())).to.equal(0n);
    });
});

describe("DomainRegistrar resolution", function () {
    it("lets the owner update the payment address while preserving ownership", async function () {
        const [bidder, recipient, outsider] = await ethers.getSigners();

        const registrar = await ethers.deployContract("DomainRegistrar", [(await ethers.getSigners())[0].address]);
        await registrar.waitForDeployment();
        const startTransaction = await registrar.startRound();
        await startTransaction.wait();

        const roundId      = 1n;
        const commitmentId = 1n;
        const label        = "alice";
        const bidWei       = ethers.parseEther("0.004");
        const salt         = ethers.id("test-only-resolution-salt");
        const deposit      = await registrar.COMMIT_DEPOSIT();

        const digest = await registrar.computeCommitment(roundId,bidder.address,label,bidWei,salt);

        const commitTransaction = await registrar.connect(bidder).commit(roundId,digest,{ value: deposit });
        await commitTransaction.wait();

        const round = await registrar.getRound(roundId);
        await networkHelpers.time.increaseTo(round.commitEnd);

        const revealTransaction = await registrar.connect(bidder).reveal(commitmentId,label,bidWei,salt);
        await revealTransaction.wait();

        expect(await registrar.ownerOf(label)).to.equal(ethers.ZeroAddress);
        expect(await registrar.reservedRound(label)).to.equal(roundId);

        await networkHelpers.time.increaseTo(round.revealEnd);

        const finalizationTransaction = await registrar.finalizeName(label);
        await finalizationTransaction.wait();

        expect(await registrar.ownerOf(label)).to.equal(bidder.address);
        expect(await registrar.resolve(label)).to.equal(bidder.address);
        expect(await registrar.reservedRound(label)).to.equal(0n);

        await expect(registrar.connect(outsider).setAddress(label, recipient.address)).to.be.revertedWith("NOT OWNER");
        await expect(registrar.connect(bidder).setAddress(label, recipient.address)).to.emit(registrar, "AddressUpdated").withArgs(
            ethers.keccak256(ethers.toUtf8Bytes(label)),
            bidder.address,
            recipient.address,
            label
        );

        expect(await registrar.ownerOf(label)).to.equal(bidder.address);
        expect(await registrar.resolve(label)).to.equal(recipient.address);

        const domain = await registrar.getDomain(label);
        expect(domain.resolutionAddress).to.equal(recipient.address);
    });
});
