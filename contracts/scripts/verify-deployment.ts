import { network } from "hardhat";
import { assertHttpNetwork, loadRecord, verifyDeployment } from "./lib/deployment.js";

const connection = await network.create();
try {
  const { chainId } = await connection.ethers.provider.getNetwork();
  assertHttpNetwork(connection.networkName, connection.networkConfig.type, chainId);
  const record = await loadRecord(chainId);
  const registrar = await verifyDeployment(connection.ethers.provider, record);
  console.log(JSON.stringify({ verified: true, chainId: record.chainId, address: record.address, treasury: record.treasury, currentRoundId: (await registrar.getFunction("getCurrentRound")()).toString() }, null, 2));
} finally { await connection.close(); }
