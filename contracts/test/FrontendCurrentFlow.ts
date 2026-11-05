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

async function currentFrontend(address: string, chainId: string) {
  const source = await readFile(new URL("../../frontend/src/components/ntu/handlers.ts", import.meta.url), "utf8");
  const configured = source.replaceAll("import.meta.env", JSON.stringify({ VITE_REGISTRAR_ADDRESS: address, VITE_CHAIN_ID: chainId }));
  const compiled = ts.transpileModule(configured, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText;
  const directory = path.resolve(".audit-cache");
  await mkdir(directory, { recursive: true });
  const name = "frontend-current-" + createHash("sha256").update(compiled).digest("hex") + ".mjs";
  const file = path.join(directory, name);
  await writeFile(file, compiled);

  const backupSource = await readFile(new URL("../../frontend/src/components/ntu/backup.ts", import.meta.url), "utf8");
  const backupCompiled = ts.transpileModule(backupSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText.replaceAll('from "./handlers"', 'from "./' + name + '"');
  const backupFile = path.join(directory, "frontend-backup-" + createHash("sha256").update(backupCompiled).digest("hex") + ".mjs");
  await writeFile(backupFile, backupCompiled);

  return {
    handlers: await import(pathToFileURL(file).href),
    backup: await import(pathToFileURL(backupFile).href),
  };
}

describe("current frontend handler integration", function () {
  it("waits for a chain block before treating an estimated deadline as closed", async function () {
    const { handlers } = await currentFrontend("0x5FbDB2315678afecb367f032d93F642f64180aa3", "31337");
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

  it("recovers prepared, pending, failed, revealed and settled bids with the final frontend API", async function () {
    const [owner, treasury, payer, recipient, replacement] = await ethers.getSigners();
    const registrar = await ethers.deployContract("DomainRegistrar", [treasury.address]);
    await registrar.waitForDeployment();
    const address = await registrar.getAddress();
    const { handlers, backup } = await currentFrontend(address, "31337");
    const { handlers: wrongNetwork } = await currentFrontend(address, "11155111");
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    let selectedAccount = owner.address;
    let rejectNext = false;
    let changeRecipientBeforeSend = false;
    let interruptReceipt = false;

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
          if (method === "eth_getTransactionReceipt" && interruptReceipt) {
            interruptReceipt = false;
            throw new Error("Temporary RPC interruption");
          }
          return connection.provider.request({ method, params });
        },
      } } });

      await assert.rejects(wrongNetwork.getCurrentRoundState(), /Wrong network.*Hardhat Local.*Sepolia/);
      await (await registrar.startRound()).wait();

      const input = { name: "current-ui", amount: "0.030000000000000001", salt: ethers.hexlify(ethers.randomBytes(32)) };
      const prepared = await handlers.prepareBidCommitment(input);
      assert.equal(prepared.bidWei, "30000000000000001");
      assert.equal(prepared.chainId, "31337");
      assert.equal(prepared.registrarAddress, address);
      assert.equal(prepared.submissionStatus, "prepared");
      assert.equal(await registrar.getCommitmentId(1n, owner.address), 0n);

      const preparedFile = backup.parseRevealBackup(await backup.createRevealBackup(prepared));
      const preparedVerification = await backup.verifyRevealBackup(preparedFile, owner.address);
      assert.equal(preparedVerification.onChainFound, false);
      const restoredPrepared = backup.backupToCommitment(preparedFile, preparedVerification);
      assert.equal(restoredPrepared.submissionStatus, "prepared");
      assert.equal(restoredPrepared.createdAt, prepared.createdAt);
      assert.equal(restoredPrepared.bidWei, prepared.bidWei);

      rejectNext = true;
      await assert.rejects(handlers.requestBidCommitment(prepared));
      assert.equal(await registrar.getCommitmentId(1n, owner.address), 0n);
      const rejectedFile = backup.parseRevealBackup(await backup.createRevealBackup({
        ...prepared, submissionStatus: "rejected",
      }));
      assert.equal(backup.backupToCommitment(rejectedFile, await backup.verifyRevealBackup(rejectedFile, owner.address)).submissionStatus, "rejected");

      await connection.provider.request({ method: "evm_setAutomine", params: [false] });
      const submission = await handlers.requestBidCommitment(prepared);
      assert.equal(submission.alreadyConfirmed, false);
      const pending = { ...prepared, txHash: submission.txHash, submissionStatus: "pending" };
      const pendingFile = backup.parseRevealBackup(await backup.createRevealBackup(pending));
      const pendingVerification = await backup.verifyRevealBackup(pendingFile, owner.address);
      assert.equal(pendingVerification.onChainFound, false);
      const restoredPending = backup.backupToCommitment(pendingFile, pendingVerification);
      assert.equal(restoredPending.txHash, submission.txHash);
      assert.equal(restoredPending.submissionStatus, "pending");
      interruptReceipt = true;
      await assert.rejects(handlers.reconcileBidCommitment(restoredPending), /Temporary RPC interruption/);
      assert.equal(restoredPending.txHash, submission.txHash);
      await connection.provider.request({ method: "evm_mine", params: [] });
      await connection.provider.request({ method: "evm_setAutomine", params: [true] });
      const confirmed = await handlers.confirmBidCommitment(restoredPending, submission.txHash);
      assert.equal(confirmed.commitmentId, "1");
      const reconciled = await handlers.reconcileBidCommitment(restoredPending);
      assert.equal(reconciled.commitmentId, "1");
      assert.equal(reconciled.txHash, submission.txHash);
      assert.equal(reconciled.submissionStatus, "confirmed");

      const transaction = await ethers.provider.getTransaction(submission.txHash);
      assert.equal(registrar.interface.parseTransaction({ data: transaction!.data })?.name, "commitBid");
      assert.equal((transaction!.data.length - 2) / 2, 68);

      const round = await registrar.getRound(1n);
      await networkHelpers.time.increaseTo(round.commitEnd);
      await handlers.revealBid(reconciled);
      await networkHelpers.time.increaseTo(round.revealEnd);
      await (await registrar.finalizeDomain(1n, "current-ui")).wait();
      await (await registrar.settleCommit(1n)).wait();
      const settledFile = backup.parseRevealBackup(await backup.createRevealBackup(reconciled));
      const settledVerification = await backup.verifyRevealBackup(settledFile, owner.address);
      const restoredSettled = backup.backupToCommitment(settledFile, settledVerification);
      assert.equal(restoredSettled.revealed, true);
      assert.equal(restoredSettled.settled, true);
      assert.equal(restoredSettled.createdAt, prepared.createdAt);
      assert.equal(restoredSettled.bidWei, "30000000000000001");

      await (await registrar.setAddress("current-ui", recipient.address)).wait();
      selectedAccount = payer.address;
      const preview = await handlers.previewPayment({ name: "current-ui", amount: "0.001" });
      assert.equal(preview.recipient, recipient.address);
      assert.equal(preview.chainId, "31337");
      const recipientBefore = await ethers.provider.getBalance(recipient.address);
      const replacementBefore = await ethers.provider.getBalance(replacement.address);
      changeRecipientBeforeSend = true;
      await assert.rejects(handlers.confirmPayment(preview));
      assert.equal(await ethers.provider.getBalance(recipient.address), recipientBefore);
      assert.equal(await ethers.provider.getBalance(replacement.address), replacementBefore);

      const fresh = await handlers.previewPayment({ name: "current-ui", amount: "0.001" });
      assert.equal(fresh.recipient, replacement.address);
      await handlers.confirmPayment(fresh);
      assert.equal(await ethers.provider.getBalance(replacement.address), replacementBefore + ethers.parseEther("0.001"));

      await (await registrar.startRound()).wait();
      const failedInput = { name: "failed-ui", amount: "0.02", salt: ethers.hexlify(ethers.randomBytes(32)) };
      const failedPrepared = await handlers.prepareBidCommitment(failedInput);
      await connection.provider.request({ method: "evm_setAutomine", params: [false] });
      const failedTx = await payer.sendTransaction({
        to: address, data: registrar.interface.encodeFunctionData("commitBid", [2n, failedPrepared.hash]),
        value: 0n, gasLimit: 500000n,
      });
      await connection.provider.request({ method: "evm_mine", params: [] });
      await connection.provider.request({ method: "evm_setAutomine", params: [true] });
      assert.equal((await ethers.provider.getTransactionReceipt(failedTx.hash))?.status, 0);
      const failedRecord = { ...failedPrepared, txHash: failedTx.hash, submissionStatus: "failed" };
      const failedFile = backup.parseRevealBackup(await backup.createRevealBackup(failedRecord));
      const restoredFailed = backup.backupToCommitment(failedFile, await backup.verifyRevealBackup(failedFile, payer.address));
      assert.equal(restoredFailed.submissionStatus, "failed");
      assert.equal(restoredFailed.txHash, failedTx.hash);
      const reconciledFailed = await handlers.reconcileBidCommitment(restoredFailed);
      assert.equal(reconciledFailed.submissionStatus, "failed");
      assert.equal(await registrar.getCommitmentId(2n, payer.address), 0n);
    } finally {
      await connection.provider.request({ method: "evm_setAutomine", params: [true] });
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});
