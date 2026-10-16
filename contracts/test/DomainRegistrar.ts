
import { expect } from "chai";
import { describe , it } from "mocha";
import { network } from "hardhat";

const { ethers } = await network.create();

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
