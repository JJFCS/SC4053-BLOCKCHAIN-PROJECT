import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
import { network } from "hardhat";
import { contractsRoot, repositoryRoot, sha256 } from "./lib/deployment.js";

const connection = await network.create();
assert.equal(connection.networkConfig.type, "edr-simulated", "Use the default simulated network");
const { ethers, networkHelpers } = connection;
const sourceBytes = await readFile(path.join(contractsRoot, "test/fixtures/frontend-handlers-16decbd.ts.txt"));
const source = sourceBytes.toString("utf8");
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const checks: any[] = [];
try {
  const [, treasury, owner, payer, recipient, replacement] = await ethers.getSigners();
  const registrar = await ethers.deployContract("DomainRegistrar", [treasury.address]);
  await registrar.waitForDeployment();
  const address = await registrar.getAddress();
  let selectedAccount = owner.address;
  let race = false;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { ethereum: {
    request: async ({ method, params = [] }: any) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [selectedAccount];
      if (method === "eth_sendTransaction" && race) {
        race = false;
        await (await registrar.connect(owner).setAddress("current-ui", replacement.address)).wait();
      }
      return connection.provider.request({ method, params });
    },
  } } });
  const compiled = ts.transpileModule(source.replaceAll("import.meta.env", JSON.stringify({ VITE_REGISTRAR_ADDRESS: address, VITE_CHAIN_ID: "31337" })), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  const directory = path.join(contractsRoot, ".audit-cache");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `handlers-${sha256(compiled)}.mjs`);
  await writeFile(file, compiled);
  const handlers: any = await import(pathToFileURL(file).href);
  assert.equal(handlers.validateLabel("xy").valid, false);
  assert.equal(handlers.validateLabel("alice").valid, true);
  checks.push({ finding: "FE-02", result: "fixed-and-verified", observation: "Two-character labels rejected; valid label accepted" });
  assert.equal(await handlers.getCurrentRoundState(), null);
  checks.push({ finding: "FE-03", result: "fixed-and-verified", observation: "Fresh deployment returns null without querying round 0" });
  const started = await handlers.startAuctionRound();
  assert.equal(started.roundId, "1");
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const commitment = await handlers.commitBid({ name: "current-ui", amount: "0.030000000000000001", salt });
  const round = await registrar.getRound(1n);
  await networkHelpers.time.increaseTo(round.commitEnd);
  await handlers.revealBid(commitment);
  await networkHelpers.time.increaseTo(round.revealEnd);
  const pending = await handlers.checkDomain("current-ui");
  assert.equal(pending.status, "ended");
  assert.equal(pending.reservedRoundId, "1");
  checks.push({ finding: "FE-04", result: "fixed-and-verified", observation: "Ended reserved domain keeps its original reservation and is not shown as available" });
  await (await registrar.finalizeDomain(1n, "current-ui")).wait();
  await handlers.setResolutionAddress("current-ui", recipient.address);
  const registered = await handlers.checkDomain("current-ui");
  assert.equal(registered.owner, owner.address);
  assert.equal(registered.resolutionAddress, recipient.address);
  checks.push({ finding: "FE-05", result: "fixed-and-verified", observation: "Owner and resolution recipient are returned separately" });
  const balance = async (who: string) => BigInt(await connection.provider.request({ method: "eth_getBalance", params: [who, "latest"] }) as string);
  const oldBefore = await balance(recipient.address);
  const newBefore = await balance(replacement.address);
  selectedAccount = payer.address;
  race = true;
  await assert.rejects(handlers.sendPayment({ name: "current-ui", amount: "0.001" }));
  assert.equal(await balance(recipient.address), oldBefore);
  assert.equal(await balance(replacement.address), newBefore);
  const payment = await handlers.sendPayment({ name: "current-ui", amount: "0.001" });
  const transaction = await ethers.provider.getTransaction(payment.txHash);
  assert.equal(transaction?.to?.toLowerCase(), address.toLowerCase());
  assert.equal(await balance(replacement.address), newBefore + ethers.parseEther("0.001"));
  checks.push({ finding: "FE-06", result: "contract-path-fixed-and-verified", observation: "Payment uses registrar; stale recipient pays neither address; a separate fresh call succeeds", transactionHash: payment.txHash, remaining: "User preview and explicit recipient/network confirmation still require UI changes and browser acceptance" });
  const result = { recordedAt: new Date().toISOString(), frontendRevision: "16decbda349a26e0a8bd44eb4e216b6edd2e4b70", fixtureSha256: sha256(sourceBytes),
    method: "Unmodified current handlers, configured and transpiled, executed through BrowserProvider and an EIP-1193 bridge to the simulated EVM. No React or MetaMask UI exercised.", checks };
  const output = path.join(repositoryRoot, "docs/evidence");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "frontend-current-checks.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else delete (globalThis as any).window;
  await connection.close();
}
