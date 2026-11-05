import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { network } from "hardhat";
import { assertHttpNetwork, loadRecord, repositoryRoot, verifyDeployment } from "./lib/deployment.js";

const connection = await network.create();
try {
  const { ethers, networkHelpers } = connection;
  const { chainId } = await ethers.provider.getNetwork();
  assertHttpNetwork(connection.networkName, connection.networkConfig.type, chainId);
  assert.equal(chainId, 31337n, "Smoke simulation uses funded local accounts and time travel; never run it on a public network");
  const deployment = await loadRecord(chainId);
  await verifyDeployment(ethers.provider, deployment);
  const registrar = await ethers.getContractAt("DomainRegistrar", deployment.address);
  assert.equal(await registrar.getCurrentRound(), 0n, "Use a fresh local deployment for this scenario");
  const [deployer, treasury, winner, loser, unrevealed, payer, recipient, laterBidder] = await ethers.getSigners();
  const transactions: Record<string, string> = {};
  async function confirm(name: string, promise: Promise<any>) {
    const transaction = await promise;
    const receipt = await transaction.wait();
    assert.equal(receipt.status, 1);
    transactions[name] = transaction.hash;
  }
  const D = await registrar.COMMIT_DEPOSIT();
  const P = await registrar.NON_REVEAL_PENALTY();
  const label = "c-smoke";
  const winnerBid = 30000000000000001n;
  const loserBid = 20000000000000000n;
  await confirm("startRound1", registrar.startRound());
  const salts = [ethers.hexlify(ethers.randomBytes(32)), ethers.hexlify(ethers.randomBytes(32)), ethers.hexlify(ethers.randomBytes(32))];
  const bids = [[winner, label, winnerBid], [loser, label, loserBid], [unrevealed, "c-unopened", 1n]] as const;
  for (let i = 0; i < bids.length; i++) {
    const [bidder, name, bidWei] = bids[i];
    const digest = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "address", "uint256", "address", "string", "uint256", "bytes32"],
      [chainId, deployment.address, 1n, bidder.address, name, bidWei, salts[i]],
    ));
    await confirm(`commit${i + 1}`, registrar.connect(bidder).commitBid(1n, digest, { value: D }));
  }
  const round = await registrar.getRound(1n);
  await networkHelpers.time.increaseTo(round.commitEnd);
  await confirm("revealLoser", registrar.connect(loser).revealBid(1n, label, loserBid, salts[1]));
  await confirm("revealWinner", registrar.connect(winner).revealBid(1n, label, winnerBid, salts[0]));
  assert.equal(await registrar.reservedRound(label), 1n);
  assert.equal(await registrar.resolve(label), ethers.ZeroAddress);
  await networkHelpers.time.increaseTo(round.revealEnd);
  await confirm("startRound2BeforeOldFinalization", registrar.connect(payer).startRound());
  await confirm("commitRound2", registrar.connect(laterBidder).commitBid(2n, ethers.id("dummy local commitment"), { value: D }));
  await confirm("finalizeOldRound", registrar.connect(payer).finalizeDomain(1n, label));
  assert.equal(await registrar.ownerOf(label), winner.address);
  for (const [name, bidder] of [["winner", winner], ["loser", loser], ["unrevealed", unrevealed]] as const) {
    await confirm(`settle-${name}`, registrar.connect(bidder).settleBid(1n));
  }
  assert.equal(await registrar.withdrawalCredits(winner.address), D - winnerBid);
  assert.equal(await registrar.withdrawalCredits(loser.address), D);
  assert.equal(await registrar.withdrawalCredits(unrevealed.address), D - P);
  assert.equal(await registrar.withdrawalCredits(treasury.address), winnerBid + P);
  for (const [name, wallet] of [["winner", winner], ["loser", loser], ["unrevealed", unrevealed], ["treasury", treasury]] as const) {
    await confirm(`withdraw-${name}`, registrar.connect(wallet).withdraw());
  }
  await confirm("setAddress", registrar.connect(winner).setAddress(label, recipient.address));
  const amount = 1000000000000001n;
  await assert.rejects(registrar.connect(payer).sendToDomain.staticCall(label, winner.address, { value: amount }), /RECIPIENT CHANGED/);
  const before = await ethers.provider.getBalance(recipient.address);
  await confirm("checkedDomainPayment", registrar.connect(payer).sendToDomain(label, recipient.address, { value: amount }));
  assert.equal(await ethers.provider.getBalance(recipient.address), before + amount);
  assert.equal(await registrar.totalLockedDeposits(), D);
  assert.equal(await registrar.totalWithdrawalCredits(), 0n);
  assert.equal(await ethers.provider.getBalance(deployment.address), D);
  const result = {
    status: "passed", environment: "local Hardhat JSON-RPC; test funds; no browser wallet exercised",
    recordedAt: new Date().toISOString(), deployment,
    label, winningBidWei: winnerBid.toString(), paymentWei: amount.toString(),
    staleRecipient: "rejected by static call; then freshly confirmed recipient paid",
    lockedDepositAfterOlderWithdrawals: D.toString(), transactions,
  };
  const directory = path.join(repositoryRoot, "docs/evidence");
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, `local-smoke-${Date.now()}.json`);
  await writeFile(filename, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  console.log(`Saved local transaction evidence: ${filename}`);
} finally { await connection.close(); }
