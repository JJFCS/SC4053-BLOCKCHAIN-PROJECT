import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { network } from "hardhat";
import { assertHttpNetwork, canonicalInterface, contractsRoot, gitState, loadAbi, saveRecord, sha256, sourceBaseRevision, verifyDeployment, type DeploymentRecord } from "./lib/deployment.js";

const connection = await network.create();
try {
  const { ethers } = connection;
  const { chainId } = await ethers.provider.getNetwork();
  assertHttpNetwork(connection.networkName, connection.networkConfig.type, chainId);
  const signers = await ethers.getSigners();
  assert.ok(signers[0], "No deployer configured for this network");
  const suppliedTreasury = process.env.TREASURY_ADDRESS?.trim();
  const treasuryInput = suppliedTreasury || (chainId === 31337n ? signers[1]?.address : undefined);
  assert.ok(treasuryInput, "Set TREASURY_ADDRESS to the team's nonzero treasury address before a testnet deployment");
  assert.ok(ethers.isAddress(treasuryInput), "TREASURY_ADDRESS is not an Ethereum address");
  const treasury = ethers.getAddress(treasuryInput);
  assert.notEqual(treasury, ethers.ZeroAddress, "Treasury must be nonzero");
  const abi = await loadAbi();
  canonicalInterface(abi);
  const registrar = await ethers.deployContract("DomainRegistrar", [treasury]);
  await registrar.waitForDeployment();
  const transaction = registrar.deploymentTransaction();
  assert.ok(transaction);
  const receipt = await transaction.wait();
  assert.ok(receipt?.status === 1);
  const address = await registrar.getAddress();
  const initialRoundId = await registrar.getCurrentRound();
  assert.equal(initialRoundId, 0n, "Deployment must not silently start the auction");
  const source = (await readFile(path.join(contractsRoot, "contracts/DomainRegistrar.sol"), "utf8")).replaceAll("\r\n", "\n");
  const record: DeploymentRecord = {
    schemaVersion: 1, recordedAt: new Date().toISOString(), network: connection.networkName,
    chainId: chainId.toString(), address, treasury, deployer: signers[0].address,
    transactionHash: transaction.hash, blockNumber: receipt.blockNumber,
    sourceBaseRevision, ...gitState(), sourceSha256: sha256(source),
    abiSha256: sha256(JSON.stringify(abi)), runtimeCodeHash: ethers.keccak256(await ethers.provider.getCode(address)),
    creationDataHash: ethers.keccak256(transaction.data), initialRoundId: initialRoundId.toString(),
  };
  await verifyDeployment(ethers.provider, record);
  await saveRecord(record);
  console.log(JSON.stringify(record, null, 2));
  console.log("Deployment verified. Frontend address/chain updated in frontend/.env.local. No auction started.");
} finally {
  await connection.close();
}
