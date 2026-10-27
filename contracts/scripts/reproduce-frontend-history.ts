import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
import { network } from "hardhat";
import { contractsRoot, repositoryRoot, sha256 } from "./lib/deployment.js";

// These are issue reproductions against an unchanged historical frontend module.
// A successful reproduction confirms an OPEN issue; it does not mean the UI passes acceptance.
const connection = await network.create();
assert.equal(connection.networkConfig.type, "edr-simulated", "Use the default simulated network for this audit");
const { ethers, networkHelpers } = connection;
const filename = path.join(contractsRoot, "test/fixtures/frontend-handlers-7217ac7.ts.txt");
const sourceBytes = await readFile(filename);
const source = sourceBytes.toString("utf8");
const findings: any[] = [];
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
try {
  const [deployer, treasury, owner, payer, recipient, replacement] = await ethers.getSigners();
  const registrar = await ethers.deployContract("DomainRegistrar", [treasury.address]);
  await registrar.waitForDeployment();
  const address = await registrar.getAddress();
  let changeRecipientBeforeSending = false;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    ethereum: { request: async ({ method, params = [] }: any) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [payer.address];
      if (method === "eth_sendTransaction" && changeRecipientBeforeSending) {
        changeRecipientBeforeSending = false;
        await (await registrar.connect(owner).setAddress("c-audit", replacement.address)).wait();
      }
      return connection.provider.request({ method, params });
    } },
  } });
  const compiled = ts.transpileModule(source.replaceAll("import.meta.env", JSON.stringify({ VITE_REGISTRAR_ADDRESS: address })), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  const directory = path.join(contractsRoot, ".audit-cache");
  await mkdir(directory, { recursive: true });
  const moduleFile = path.join(directory, `handlers-${sha256(compiled)}.mjs`);
  await writeFile(moduleFile, compiled);
  const legacy: any = await import(pathToFileURL(moduleFile).href);

  assert.equal(legacy.validateLabel("xy").valid, true);
  assert.equal(await registrar.isValidLabel("xy"), false);
  findings.push({ id: "FE-02", status: "reproduced-open", observation: "Frontend accepts a two-character name that the current registrar rejects", frontendAccepted: true, contractAccepted: false });

  await assert.rejects(legacy.getCurrentRoundState(), /INVALID ROUND/);
  findings.push({ id: "FE-03", status: "reproduced-open", observation: "Fresh deployment has round ID 0; frontend calls getRound(0) and reverts" });

  await (await registrar.startRound()).wait();
  const label = "c-audit";
  const bid = 30000000000000001n;
  const salt = ethers.id("dummy-public-audit-salt");
  const { chainId } = await ethers.provider.getNetwork();
  const digest = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "address", "uint256", "address", "string", "uint256", "bytes32"],
    [chainId, address, 1n, owner.address, label, bid, salt],
  ));
  await (await registrar.connect(owner).commitBid(1n, digest, { value: await registrar.COMMIT_DEPOSIT() })).wait();
  const round = await registrar.getRound(1n);
  await networkHelpers.time.increaseTo(round.commitEnd);
  await (await registrar.connect(owner).revealBid(1n, label, bid, salt)).wait();
  await networkHelpers.time.increaseTo(round.revealEnd);
  const pending = await legacy.checkDomain(label);
  assert.equal(await registrar.reservedRound(label), 1n);
  assert.equal(pending.status, "available");
  findings.push({ id: "FE-04", status: "reproduced-open", observation: "Revealed, unfinalized name is displayed as available after the reveal deadline", actualReservedRound: "1", frontendStatus: pending.status });

  await (await registrar.finalizeDomain(1n, label)).wait();
  await (await registrar.connect(owner).setAddress(label, recipient.address)).wait();
  const registered = await legacy.checkDomain(label);
  assert.equal(registered.owner, recipient.address);
  assert.notEqual(registered.owner, owner.address);
  findings.push({ id: "FE-05", status: "reproduced-open", observation: "Frontend displays the resolution recipient as the domain owner", actualOwner: owner.address, displayedOwner: registered.owner });

  const balance = async (who: string) => BigInt(await connection.provider.request({ method: "eth_getBalance", params: [who, "latest"] }) as string);
  const before = await balance(recipient.address);
  const replacementBefore = await balance(replacement.address);
  changeRecipientBeforeSending = true;
  const payment = await legacy.sendPayment({ name: label, amount: "0.001" });
  const transaction = await ethers.provider.getTransaction(payment.txHash);
  assert.equal(transaction?.to?.toLowerCase(), recipient.address.toLowerCase());
  assert.equal(await registrar.resolve(label), replacement.address);
  assert.equal(await balance(recipient.address), before + ethers.parseEther("0.001"));
  assert.equal(await balance(replacement.address), replacementBefore);
  await assert.rejects(registrar.connect(payer).sendToDomain.staticCall(label, recipient.address, { value: 1n }), /RECIPIENT CHANGED/);
  findings.push({ id: "FE-06", status: "reproduced-open", observation: "Legacy direct transfer succeeds to the old recipient after resolution changes; the checked registrar call rejects the stale recipient", transactionHash: payment.txHash, transactionTo: transaction!.to, currentResolution: replacement.address });

  const result = {
    recordedAt: new Date().toISOString(), contractRevision: "cb1f3c4b5bbc04326804089d30991dc69c6a2f60",
    frontendRevision: "7217ac7cd96be3813ba372c75f2bf3f8e042e9c2", fixtureSha256: sha256(sourceBytes),
    method: "Original handlers transpiled with deployment configuration; BrowserProvider uses an EIP-1193 bridge to the real simulated EVM. No browser or MetaMask UI was exercised.",
    contractSourceChanged: false, findings,
  };
  const output = path.join(repositoryRoot, "docs/evidence");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "frontend-reproductions.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  console.log("Five OPEN frontend issues reproduced. These results are not frontend acceptance passes.");
} finally {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else delete (globalThis as any).window;
  await connection.close();
}
