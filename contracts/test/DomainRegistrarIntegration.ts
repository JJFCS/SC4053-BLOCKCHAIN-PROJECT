import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect } from "chai";
import { describe, it } from "mocha";
import { artifacts, network } from "hardhat";
import { canonicalInterface, loadAbi, verifyDeployment, sha256, sourceBaseRevision, contractsRoot, type DeploymentRecord } from "../scripts/lib/deployment.js";
import path from "node:path";

const { ethers, networkHelpers } = await network.create();

describe("DomainRegistrar deployment and published ABI integration", function () {
  it("publishes the actual compiler ABI with all canonical operations and current record fields", async function () {
    const abi = await loadAbi();
    assert.deepEqual(abi, (await artifacts.readArtifact("DomainRegistrar")).abi);
    const iface = canonicalInterface(abi);
    assert.equal(iface.getFunction("getRound")!.outputs[0].components!.length, 8);
    assert.equal(iface.getFunction("getCommitmentForRound")!.outputs[0].components!.length, 9);
    assert.equal(iface.getFunction("sendToDomain")!.stateMutability, "payable");
  });

  it("binds deployment evidence to its chain, code, source, ABI, receipt and treasury", async function () {
    const [deployer, treasury] = await ethers.getSigners();
    const registrar = await ethers.deployContract("DomainRegistrar", [treasury.address]);
    const tx = registrar.deploymentTransaction()!;
    const receipt = await tx.wait();
    const abi = await loadAbi();
    const address = await registrar.getAddress();
    const source = (await readFile(path.join(contractsRoot, "contracts/DomainRegistrar.sol"), "utf8")).replaceAll("\r\n", "\n");
    const record: DeploymentRecord = {
      schemaVersion: 1, recordedAt: new Date().toISOString(), network: "test",
      chainId: (await ethers.provider.getNetwork()).chainId.toString(), address, treasury: treasury.address,
      deployer: deployer.address, transactionHash: tx.hash, blockNumber: receipt!.blockNumber,
      sourceBaseRevision, gitRevision: null, workingTreeDirty: null, sourceSha256: sha256(source),
      abiSha256: sha256(JSON.stringify(abi)), runtimeCodeHash: ethers.keccak256(await ethers.provider.getCode(address)),
      creationDataHash: ethers.keccak256(tx.data), initialRoundId: "0",
    };
    await verifyDeployment(ethers.provider, record);
    await assert.rejects(verifyDeployment(ethers.provider, { ...record, chainId: "1" }), /chain differs/);
    await assert.rejects(verifyDeployment(ethers.provider, { ...record, abiSha256: "incorrect" }), /ABI changed/);
    await assert.rejects(verifyDeployment(ethers.provider, { ...record, runtimeCodeHash: ethers.ZeroHash }), /runtime code differs/);
  });

  it("executes a complete auction, refund and checked payment using only the published ABI", async function () {
    const [deployer, treasury, earlyBidder, lateBidder, payer, recipient] = await ethers.getSigners();
    const registrar = await ethers.deployContract("DomainRegistrar", [treasury.address]);
    const address = await registrar.getAddress();
    const abi = await loadAbi();
    const bind = (signer: any) => new ethers.Contract(address, abi, signer);
    const call = async (signer: any, name: string, ...args: any[]) => {
      const tx = await bind(signer).getFunction(name)(...args);
      return tx.wait();
    };
    assert.equal(await bind(deployer).getFunction("getCurrentRound")(), 0n);
    await call(deployer, "startRound");
    const { chainId } = await ethers.provider.getNetwork();
    const amount = 30000000000000001n;
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const label = "c-abi";
    for (const bidder of [earlyBidder, lateBidder]) {
      const digest = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "address", "string", "uint256", "bytes32"],
        [chainId, address, 1n, bidder.address, label, amount, salt],
      ));
      const backup = JSON.parse(JSON.stringify({ chainId: chainId.toString(), roundId: "1", bidWei: amount.toString(), salt, digest }));
      assert.equal(BigInt(backup.bidWei), amount);
      await call(bidder, "commitBid", 1n, digest, { value: ethers.parseEther("0.1") });
    }
    const round = await registrar.getRound(1n);
    await networkHelpers.time.increaseTo(round.commitEnd);
    await call(lateBidder, "revealBid", 1n, label, amount, salt);
    await call(earlyBidder, "revealBid", 1n, label, amount, salt);
    await networkHelpers.time.increaseTo(round.revealEnd);
    await call(payer, "startRound");
    await call(payer, "finalizeDomain", 1n, label);
    assert.equal(await registrar.ownerOf(label), earlyBidder.address);
    await call(earlyBidder, "settleBid", 1n);
    await call(lateBidder, "settleBid", 1n);
    for (const wallet of [earlyBidder, lateBidder, treasury]) await call(wallet, "withdraw");
    assert.equal(await ethers.provider.getBalance(address), 0n);
    await call(earlyBidder, "setAddress", label, recipient.address);
    await expect(bind(payer).getFunction("sendToDomain")(label, earlyBidder.address, { value: 1n })).to.be.revertedWith("RECIPIENT CHANGED");
    const before = await ethers.provider.getBalance(recipient.address);
    await call(payer, "sendToDomain", label, recipient.address, { value: 1n });
    assert.equal(await ethers.provider.getBalance(recipient.address), before + 1n);
    assert.equal(await registrar.totalLockedDeposits(), 0n);
    assert.equal(await registrar.totalWithdrawalCredits(), 0n);
  });
});
