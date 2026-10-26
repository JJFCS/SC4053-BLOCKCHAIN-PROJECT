import { expect } from "chai";
import { describe, it } from "mocha";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

async function registerName() {
    const [treasury, owner, payer, recipient] = await ethers.getSigners();
    const registrar = await ethers.deployContract("DomainRegistrar");
    await registrar.waitForDeployment();
    const startTransaction = await registrar.startRound();
    await startTransaction.wait();

    const label        = "alice";
    const roundId      = 1n;
    const commitmentId = 1n;
    const bidWei       = ethers.parseEther("0.006");
    const deposit      = await registrar.COMMIT_DEPOSIT();
    const salt         = ethers.id("test-only-domain-payment-salt");
    const digest       = await registrar.computeCommitment(roundId, owner.address, label, bidWei, salt);

    const commitTransaction = await registrar.connect(owner).commit(roundId, digest, { value: deposit });
    await commitTransaction.wait();

    const round = await registrar.getRound(roundId);
    await networkHelpers.time.increaseTo(round.commitEnd);
    const revealTransaction = await registrar.connect(owner).reveal(commitmentId, label, bidWei, salt);
    await revealTransaction.wait();

    await networkHelpers.time.increaseTo(round.revealEnd);
    const finalizeTransaction = await registrar.finalizeName(label);
    await finalizeTransaction.wait();

    return { registrar, treasury, owner, payer, recipient, label, deposit };
}

describe("DomainRegistrar payments", function () {
    it("emits the exact payment and preserves the auction deposit", async function () {
        const { registrar, owner, payer, recipient, label, deposit } = await registerName();
        const updateTransaction = await registrar.connect(owner).setAddress(
            label, recipient.address
        );
        await updateTransaction.wait();

        const amount           = ethers.parseEther("0.030000000000000001");
        const registrarAddress = await registrar.getAddress();
        const recipientBefore  = await ethers.provider.getBalance(recipient.address);
        const registrarBefore  = await ethers.provider.getBalance(registrarAddress);

        await expect(registrar.connect(payer).sendToDomain(label, recipient.address, { value: amount })
        ).to.emit(registrar, "DomainPayment").withArgs(
            ethers.id(label), payer.address, recipient.address, label, amount
        );

        expect(await ethers.provider.getBalance(recipient.address)).to.equal(recipientBefore + amount);
        expect(await ethers.provider.getBalance(registrarAddress)).to.equal(registrarBefore);
        expect(registrarBefore).to.equal(deposit);
        expect(await registrar.totalLockedDeposits()).to.equal(deposit);
        expect(await registrar.totalRefundCredits()).to.equal(0n);
        expect(await registrar.treasuryCredit()).to.equal(0n);
        expect(await registrar.refundCredits(payer.address)).to.equal(0n);
        expect(await registrar.ownerOf(label)).to.equal(owner.address);
    });

    it("rejects a stale recipient and accepts a newly confirmed address", async function () {
        const { registrar, owner, payer, recipient, label } = await registerName();
        const previewedRecipient = await registrar.resolve(label);
        const updateTransaction  = await registrar.connect(owner).setAddress(
            label, recipient.address
        );
        await updateTransaction.wait();

        const amount           = ethers.parseEther("0.002");
        const registrarAddress = await registrar.getAddress();
        const ownerBefore      = await ethers.provider.getBalance(owner.address);
        const recipientBefore  = await ethers.provider.getBalance(recipient.address);
        const registrarBefore  = await ethers.provider.getBalance(registrarAddress);

        await expect(
            registrar.connect(payer).sendToDomain(label, previewedRecipient, { value: amount })
        ).to.be.revertedWith("RECIPIENT CHANGED");

        expect(await ethers.provider.getBalance(owner.address)).to.equal(ownerBefore);
        expect(await ethers.provider.getBalance(recipient.address)).to.equal(recipientBefore);
        expect(await ethers.provider.getBalance(registrarAddress)).to.equal(registrarBefore);

        // this represents a separate payment after the user confirms the refreshed address
        const confirmedRecipient = await registrar.resolve(label);
        const paymentTransaction = await registrar.connect(payer).sendToDomain(
            label, confirmedRecipient, { value: amount }
        );
        await paymentTransaction.wait();

        expect(await ethers.provider.getBalance(recipient.address)).to.equal(recipientBefore + amount);
        expect(await ethers.provider.getBalance(registrarAddress)).to.equal(registrarBefore);
    });
});
