
import { expect } from "chai";
import { describe , it } from "mocha";
import { network } from "hardhat";

const { ethers , networkHelpers } = await network.create();

describe("DomainRegistrar commitment", function () {

    // this will create a registrar , prepare some example bid details and also calculate
    // the hash 2 different ways and then compare the answers

    it("matches the hash calculated with ethers", async function () {
        const registrar = await ethers.deployContract("DomainRegistrar");
        await registrar.waitForDeployment();

        const [bidder] = await ethers.getSigners();
        const networkInfo = await ethers.provider.getNetwork();

        const chainId = networkInfo.chainId;
        const registrarAddress = await registrar.getAddress();
        const roundId = 1n;
        const label = "alice";
        const bidWei = ethers.parseEther("0.004");
        const salt = ethers.id("test-only-salt");

        const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "address", "uint256", "address", "string", "uint256", "bytes32"],
            [chainId, registrarAddress, roundId, bidder.address, label, bidWei, salt]
        );

        const javascriptHash = ethers.keccak256(encoded);

        const solidityHash = await registrar.computeCommitment(
            roundId,
            bidder.address,
            label,
            bidWei,
            salt
        );

        expect(javascriptHash).to.equal(solidityHash);
    });

    it("emits a receipt for an accepted commitment", async function () {
        const registrar = await ethers.deployContract("DomainRegistrar");
        await registrar.waitForDeployment();

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
        const registrar = await ethers.deployContract("DomainRegistrar");
        await registrar.waitForDeployment();

        const [bidder] = await ethers.getSigners();

        const roundId = 1n;
        const commitmentId = 1n;
        const label = "alice";
        const bidWei = ethers.parseEther("0.004");
        const salt = ethers.id("test-only-reveal-salt");
        const deposit = await registrar.COMMIT_DEPOSIT();

        const digest = await registrar.computeCommitment(
            roundId,
            bidder.address,
            label,
            bidWei,
            salt
        );

        const commitTransaction = await registrar.commit(roundId,digest,
            { value: deposit }
        );
        await commitTransaction.wait();

        const round = await registrar.getRound(roundId);
        await networkHelpers.time.increaseTo(round.commitEnd);

        await expect(
            registrar.reveal(commitmentId, label, bidWei, salt)
        )
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
        const registrar = await ethers.deployContract("DomainRegistrar");
        await registrar.waitForDeployment();

        const [bidder, finalizer] = await ethers.getSigners();

        const roundId = 1n;
        const commitmentId = 1n;
        const label = "alice";
        const bidWei = ethers.parseEther("0.004");
        const salt = ethers.id("test-only-ownership-salt");
        const deposit = await registrar.COMMIT_DEPOSIT();

        const digest = await registrar.computeCommitment(
            roundId,
            bidder.address,
            label,
            bidWei,
            salt
        );

        const commitTransaction = await registrar.connect(bidder).commit(
            roundId,
            digest,
            { value: deposit }
        );
        await commitTransaction.wait();

        const round = await registrar.getRound(roundId);
        await networkHelpers.time.increaseTo(round.commitEnd);

        const revealTransaction = await registrar.connect(bidder).reveal(
            commitmentId,
            label,
            bidWei,
            salt
        );
        await revealTransaction.wait();

        expect(await registrar.resolve(label)).to.equal(
            ethers.ZeroAddress
        );

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
