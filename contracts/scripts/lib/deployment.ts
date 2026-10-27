import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Contract, Interface, getAddress, keccak256, ZeroAddress, type Provider } from "ethers";

export const contractsRoot = fileURLToPath(new URL("../../", import.meta.url));
export const repositoryRoot = path.resolve(contractsRoot, "..");
export const sourceBaseRevision = "cb1f3c4b5bbc04326804089d30991dc69c6a2f60";
export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

export interface DeploymentRecord {
  schemaVersion: 1;
  recordedAt: string;
  network: string;
  chainId: string;
  address: string;
  treasury: string;
  deployer: string;
  transactionHash: string;
  blockNumber: number;
  sourceBaseRevision: string;
  gitRevision: string | null;
  workingTreeDirty: boolean | null;
  sourceSha256: string;
  abiSha256: string;
  runtimeCodeHash: string;
  creationDataHash: string;
  initialRoundId: string;
}

export async function loadAbi() {
  return JSON.parse(await readFile(path.join(contractsRoot, "abi/DomainRegistrar.json"), "utf8"));
}

export async function loadRecord(chainId: bigint): Promise<DeploymentRecord> {
  const record = JSON.parse(await readFile(path.join(contractsRoot, `deployments/${chainId}.json`), "utf8"));
  assert.equal(record.schemaVersion, 1, "Unsupported deployment record");
  assert.equal(record.chainId, chainId.toString(), "Wrong chain in deployment record");
  return record;
}

export function gitState() {
  try {
    const options = { cwd: repositoryRoot, encoding: "utf8" as const };
    return {
      gitRevision: execFileSync("git", ["rev-parse", "HEAD"], options).trim(),
      workingTreeDirty: execFileSync("git", ["status", "--porcelain"], options).trim().length > 0,
    };
  } catch {
    return { gitRevision: null, workingTreeDirty: null };
  }
}

export async function verifyDeployment(provider: Provider, record: DeploymentRecord) {
  assert.equal((await provider.getNetwork()).chainId.toString(), record.chainId, "Connected chain differs from deployment record");
  const abi = await loadAbi();
  assert.equal(sha256(JSON.stringify(abi)), record.abiSha256, "ABI changed; rebuild/export and redeploy or select its matching ABI");
  const source = (await readFile(path.join(contractsRoot, "contracts/DomainRegistrar.sol"), "utf8")).replaceAll("\r\n", "\n");
  assert.equal(sha256(source), record.sourceSha256, "Contract source changed since deployment");
  const address = getAddress(record.address);
  const code = await provider.getCode(address);
  assert.notEqual(code, "0x", "No contract at recorded address; local node may have restarted");
  assert.equal(keccak256(code), record.runtimeCodeHash, "Deployed runtime code differs from deployment record");
  const receipt = await provider.getTransactionReceipt(record.transactionHash);
  assert.ok(receipt?.status === 1, "Deployment receipt is missing or unsuccessful; redeploy after a local reset");
  assert.equal(receipt.contractAddress?.toLowerCase(), address.toLowerCase(), "Receipt created another address");
  const transaction = await provider.getTransaction(record.transactionHash);
  assert.ok(transaction && transaction.to === null, "Recorded transaction is not a contract creation");
  assert.equal(transaction.from.toLowerCase(), record.deployer.toLowerCase());
  assert.equal(keccak256(transaction.data), record.creationDataHash, "Creation transaction differs from record");
  const artifact = JSON.parse(await readFile(path.join(contractsRoot, "artifacts/contracts/DomainRegistrar.sol/DomainRegistrar.json"), "utf8"));
  const expectedCreationData = artifact.bytecode + new Interface(abi).encodeDeploy([record.treasury]).slice(2);
  assert.equal(transaction.data.toLowerCase(), expectedCreationData.toLowerCase(), "Deployment was not created from the current compiled registrar and constructor argument");
  const contract = new Contract(address, abi, provider);
  assert.equal(getAddress(await contract.getFunction("treasury")()), getAddress(record.treasury));
  assert.notEqual(getAddress(record.treasury), ZeroAddress);
  assert.equal(await contract.getFunction("COMMIT_DEPOSIT")(), 100000000000000000n);
  assert.equal(await contract.getFunction("NON_REVEAL_PENALTY")(), 1000000000000000n);
  return contract;
}

export async function writeFrontendEnvironment(record: DeploymentRecord) {
  const filename = path.join(repositoryRoot, "frontend/.env.local");
  let previous = "";
  try { previous = await readFile(filename, "utf8"); } catch (error: any) { if (error.code !== "ENOENT") throw error; }
  const values: Record<string, string> = {
    VITE_REGISTRAR_ADDRESS: record.address,
    VITE_CHAIN_ID: record.chainId,
  };
  const lines = previous.split(/\r?\n/).filter(line => !Object.keys(values).some(key => line.startsWith(`${key}=`)));
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, [...lines.filter(Boolean), ...Object.entries(values).map(([key, value]) => `${key}=${value}`), ""].join("\n"));
}

export async function saveRecord(record: DeploymentRecord) {
  const directory = path.join(contractsRoot, "deployments");
  await mkdir(path.join(directory, record.chainId), { recursive: true });
  const content = JSON.stringify(record, null, 2) + "\n";
  await writeFile(path.join(directory, `${record.chainId}/${record.address}.json`), content);
  await writeFile(path.join(directory, `${record.chainId}.json`), content);
  await writeFrontendEnvironment(record);
}

export function assertHttpNetwork(networkName: string, type: string, chainId: bigint) {
  assert.equal(type, "http", "Use --network localhost or --network sepolia; an ephemeral deployment cannot serve the UI");
  const expected = networkName === "localhost" ? 31337n : networkName === "sepolia" ? 11155111n : undefined;
  assert.ok(expected, "Deployment script supports the configured localhost and sepolia networks");
  assert.equal(chainId, expected, "RPC chain does not match selected network");
}

export function canonicalInterface(abi: any[]) {
  const iface = new Interface(abi);
  for (const signature of ["startRound()", "commitBid(uint256,bytes32)", "revealBid(uint256,string,uint256,bytes32)", "finalizeDomain(uint256,string)", "settleBid(uint256)", "withdraw()", "setAddress(string,address)", "sendToDomain(string,address)", "ownerOf(string)", "reservedRound(string)", "resolve(string)"]) {
    assert.ok(iface.getFunction(signature), `Missing canonical operation ${signature}`);
  }
  return iface;
}
