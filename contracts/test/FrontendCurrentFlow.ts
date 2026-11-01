import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "mocha";
import { network } from "hardhat";
import ts from "typescript";

const connection = await network.create();
const { ethers, networkHelpers } = connection;

async function currentHandlers(address: string, chainId: string) {
  const source = await readFile(new URL("../../frontend/src/components/ntu/handlers.ts", import.meta.url), "utf8");
  const configured = source.replaceAll("import.meta.env", JSON.stringify({ VITE_REGISTRAR_ADDRESS: address, VITE_CHAIN_ID: chainId }));
  const compiled = ts.transpileModule(configured, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  const directory = path.resolve(".audit-cache");
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `frontend-current-${createHash("sha256").update(compiled).digest("hex")}.mjs`);
  await writeFile(file, compiled);
  return import(pathToFileURL(file).href);
}

describe("current frontend handler integration", function () {
  it("waits for a chain block before treating an estimated deadline as closed", async function () {
    const handlers = await currentHandlers("0x5FbDB2315678afecb367f032d93F642f64180aa3", "31337");
    const clock = { chainTimestampMs: 1793576034000, capturedAtMs: 1793575786000 };
    const deadline = 1793576039000;
    const laterWallTime = clock.capturedAtMs + 10000;

    assert.equal(handlers.phaseEstimateExpired(deadline, clock, laterWallTime), true);
    assert.equal(handlers.phaseRemainingMs(deadline, clock, laterWallTime), 1);
    assert.equal(handlers.formatTimeLeft(deadline, clock, laterWallTime), "Awaiting chain block");

    const endedClock = { ...clock, chainTimestampMs: deadline };
    assert.equal(handlers.phaseRemainingMs(deadline, endedClock, laterWallTime), 0);
    assert.equal(handlers.formatTimeLeft(deadline, endedClock, laterWallTime), "0s");
  });

  it("saves the exact preimage before approval, blocks the wrong chain, and rechecks a confirmed payment", async function () {
    const [owner, treasury, payer, recipient, replacement] = await ethers.getSigners();
    const registrar = await ethers.deployContract("DomainRegistrar", [treasury.address]);
    await registrar.waitForDeployment();
    const address = await registrar.getAddress();
    const handlers = await currentHandlers(address, "31337");
    const wrongNetwork = await currentHandlers(address, "11155111");
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    let selectedAccount = owner.address;
    let rejectNext = false;
    let changeRecipientBeforeSend = false;

    try {
      Object.defineProperty(globalThis, "window", { configurable: true, value: { ethereum: {
        request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
          if (method === "eth_accounts" || method === "eth_requestAccounts") return [selectedAccount];
          if (method === "eth_sendTransaction" && rejectNext) {
            rejectNext = false;
            throw Object.assign(new Error("User rejected the request"), { code: 4001 });
          }
          if (method === "eth_sendTransaction" && changeRecipientBeforeSend) {
            changeRecipientBeforeSend = false;
            await (await registrar.connect(owner).setAddress("current-ui", replacement.address)).wait();
          }
          return connection.provider.request({ method, params });
        },
      } } });

      await assert.rejects(wrongNetwork.getCurrentRoundState(), /Wrong network.*31337.*11155111/);
      await (await registrar.startRound()).wait();
      const input = { name: "current-ui", amount: "0.030000000000000001", salt: ethers.hexlify(ethers.randomBytes(32)) };
      let prepared = 0;
      let submitted = 0;
      const hooks = {
        onPrepared: async (record: { bidWei: string; chainId: string; registrarAddress: string; hash: string }) => {
          prepared++;
          assert.equal(record.bidWei, "30000000000000001");
          assert.equal(record.chainId, "31337");
          assert.equal(record.registrarAddress, address);
          assert.equal(await registrar.getCommitmentId(1n, owner.address), 0n);
          assert.equal(record.hash.length, 66);
        },
        onSubmitted: (record: { txHash: string }) => {
          submitted++;
          assert.equal(record.txHash.length, 66);
        },
      };

      rejectNext = true;
      await assert.rejects(handlers.commitBid(input, hooks));
      assert.equal(prepared, 1);
      assert.equal(submitted, 0);
      assert.equal(await registrar.getCommitmentId(1n, owner.address), 0n);

      const committed = await handlers.commitBid(input, hooks);
      assert.equal(prepared, 2);
      assert.equal(submitted, 1);
      assert.equal(committed.commitmentId, "1");
      const receipt = await ethers.provider.getTransactionReceipt(committed.txHash);
      const transaction = await ethers.provider.getTransaction(committed.txHash);
      assert.equal(registrar.interface.parseTransaction({ data: transaction!.data })?.name, "commitBid");
      assert.equal((transaction!.data.length - 2) / 2, 68);
      assert.equal(receipt?.status, 1);

      const round = await registrar.getRound(1n);
      await networkHelpers.time.increaseTo(round.commitEnd);
      await handlers.revealBid(committed);
      await networkHelpers.time.increaseTo(round.revealEnd);
      await (await registrar.finalizeDomain(1n, "current-ui")).wait();
      await (await registrar.setAddress("current-ui", recipient.address)).wait();

      selectedAccount = payer.address;
      const preview = await handlers.previewPayment({ name: "current-ui", amount: "0.001" });
      assert.equal(preview.resolvedAddress, recipient.address);
      assert.equal(preview.chainId, "31337");
      const recipientBefore = await ethers.provider.getBalance(recipient.address);
      const replacementBefore = await ethers.provider.getBalance(replacement.address);
      changeRecipientBeforeSend = true;
      await assert.rejects(handlers.sendPayment(preview));
      assert.equal(await ethers.provider.getBalance(recipient.address), recipientBefore);
      assert.equal(await ethers.provider.getBalance(replacement.address), replacementBefore);

      const fresh = await handlers.previewPayment({ name: "current-ui", amount: "0.001" });
      assert.equal(fresh.resolvedAddress, replacement.address);
      await handlers.sendPayment(fresh);
      assert.equal(await ethers.provider.getBalance(replacement.address), replacementBefore + ethers.parseEther("0.001"));
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});
