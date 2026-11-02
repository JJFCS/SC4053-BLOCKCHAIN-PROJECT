import {
    BrowserProvider,
    Contract,
    ZeroAddress,
    formatEther,
    isAddress,
    parseEther,
  } from "ethers"
  
  import {
    computeCommitmentHash,
    getRegistrarAddress,
    validateLabel,
    type Commitment,
  } from "./handlers"
  
  
  const UINT256_MAX =
    (1n << 256n) - 1n
  
  const BACKUP_ABI = [
    "function COMMIT_DEPOSIT() view returns (uint256)",
    "function getCommitmentId(uint256 roundId, address bidder) view returns (uint256)",
    "function getCommitment(uint256 commitmentId) view returns (tuple(address bidder, bytes32 digest, uint256 roundId, uint256 deposit, bool revealed, bool valid, bytes32 labelHash, uint256 bidWei, bool settled))",
  ]
  
  export interface RevealBackupV1 {
    schemaVersion: 1
    chainId: string
    registrarAddress: string
    bidderAddress: string
    roundId: string
    label: string
    bidWei: string
    salt: string
    commitment: string
    commitTxHash: string | null
  }
  
  function requireEthereum() {
    if (!window.ethereum) {
      throw new Error(
        "MetaMask is required to verify this backup."
      )
    }
  
    return window.ethereum
  }
  
  function isBytes32(
    value: unknown
  ): value is string {
    return (
      typeof value ===
        "string" &&
      /^0x[0-9a-fA-F]{64}$/.test(
        value
      )
    )
  }
  
  function parseUint256(
    value: unknown,
    field: string
  ): bigint {
    if (
      typeof value !==
        "string" ||
      !/^[0-9]+$/.test(
        value
      )
    ) {
      throw new Error(
        `${field} must be a base-10 integer string.`
      )
    }
  
    const parsed =
      BigInt(value)
  
    if (
      parsed < 0n ||
      parsed > UINT256_MAX
    ) {
      throw new Error(
        `${field} is outside the uint256 range.`
      )
    }
  
    return parsed
  }
  
  /*
    ============================================================
    EXPORT
    ============================================================
  
    IMPORTANT:
  
    The backup uses the ORIGINAL context stored when the
    commitment was prepared.
  
    It does not ask MetaMask what chain is selected now.
  */
  
  export async function createRevealBackup(
    commitment:
      Commitment
  ): Promise<RevealBackupV1> {
    if (
      !commitment.chainId
    ) {
      throw new Error(
        "This saved bid does not contain its original chain ID and cannot be safely exported."
      )
    }
  
    if (
      !commitment.registrarAddress
    ) {
      throw new Error(
        "This saved bid does not contain its original registrar address and cannot be safely exported."
      )
    }
  
    let bidWei:
      string
  
    if (commitment.bidWei) {
      bidWei =
        commitment.bidWei
    } else {
      /*
        Legacy compatibility only.
  
        New records always store bidWei directly.
      */
  
      bidWei =
        parseEther(
          commitment.amount
        ).toString()
    }
  
    return {
      schemaVersion:
        1,
  
      chainId:
        commitment.chainId,
  
      registrarAddress:
        commitment.registrarAddress,
  
      bidderAddress:
        commitment.bidder,
  
      roundId:
        commitment.roundId,
  
      label:
        commitment.name,
  
      bidWei,
  
      salt:
        commitment.salt,
  
      commitment:
        commitment.hash,
  
      commitTxHash:
        commitment.txHash ||
        null,
    }
  }
  
  /*
    ============================================================
    STRUCTURAL VALIDATION
    ============================================================
  */
  
  export function parseRevealBackup(
    raw: unknown
  ): RevealBackupV1 {
    if (
      typeof raw !==
        "object" ||
      raw === null
    ) {
      throw new Error(
        "Backup must contain a JSON object."
      )
    }
  
    const backup =
      raw as Partial<RevealBackupV1>
  
    if (
      backup.schemaVersion !==
      1
    ) {
      throw new Error(
        "Unsupported reveal backup schema version."
      )
    }
  
    const chainId =
      parseUint256(
        backup.chainId,
        "chainId"
      )
  
    if (chainId <= 0n) {
      throw new Error(
        "chainId must be greater than zero."
      )
    }
  
    const roundId =
      parseUint256(
        backup.roundId,
        "roundId"
      )
  
    if (roundId <= 0n) {
      throw new Error(
        "roundId must be greater than zero."
      )
    }
  
    const bidWei =
      parseUint256(
        backup.bidWei,
        "bidWei"
      )
  
    if (bidWei <= 0n) {
      throw new Error(
        "bidWei must be greater than zero."
      )
    }
  
    if (
      typeof backup.registrarAddress !==
        "string" ||
      !isAddress(
        backup.registrarAddress
      ) ||
      backup.registrarAddress.toLowerCase() ===
        ZeroAddress.toLowerCase()
    ) {
      throw new Error(
        "Backup contains an invalid registrar address."
      )
    }
  
    if (
      typeof backup.bidderAddress !==
        "string" ||
      !isAddress(
        backup.bidderAddress
      ) ||
      backup.bidderAddress.toLowerCase() ===
        ZeroAddress.toLowerCase()
    ) {
      throw new Error(
        "Backup contains an invalid bidder address."
      )
    }
  
    if (
      typeof backup.label !==
      "string"
    ) {
      throw new Error(
        "Backup label is missing."
      )
    }
  
    const labelValidation =
      validateLabel(
        backup.label
      )
  
    if (
      !labelValidation.valid
    ) {
      throw new Error(
        labelValidation.error ??
          "Backup contains an invalid domain label."
      )
    }
  
    if (
      !isBytes32(
        backup.salt
      )
    ) {
      throw new Error(
        "Backup salt must be a 32-byte hex value."
      )
    }
  
    if (
      !isBytes32(
        backup.commitment
      )
    ) {
      throw new Error(
        "Backup commitment must be a 32-byte hash."
      )
    }
  
    if (
      backup.commitTxHash !==
        null &&
      !isBytes32(
        backup.commitTxHash
      )
    ) {
      throw new Error(
        "Backup transaction hash is invalid."
      )
    }
  
    return backup as
      RevealBackupV1
  }
  
  /*
    ============================================================
    IMPORT VERIFICATION
    ============================================================
  
    A backup can exist before an on-chain transaction exists.
  
    Therefore:
    - structure/context/hash MUST validate
    - if an on-chain commitment exists, it MUST match
    - if no on-chain commitment exists and commitTxHash is null,
      the prepared recovery record is still valid
  
    revealBid() performs the final on-chain check before reveal.
  */
  
  export async function verifyRevealBackup(
    backup:
      RevealBackupV1,
    connectedAccount:
      string
  ): Promise<void> {
    const provider =
      new BrowserProvider(
        requireEthereum()
      )
  
    const network =
      await provider.getNetwork()
  
    if (
      network.chainId.toString() !==
      backup.chainId
    ) {
      throw new Error(
        `This backup belongs to chain ${backup.chainId}, but MetaMask is connected to chain ${network.chainId.toString()}.`
      )
    }
  
    if (
      getRegistrarAddress().toLowerCase() !==
      backup.registrarAddress.toLowerCase()
    ) {
      throw new Error(
        "This backup belongs to a different registrar deployment."
      )
    }
  
    if (
      connectedAccount.toLowerCase() !==
      backup.bidderAddress.toLowerCase()
    ) {
      throw new Error(
        "Switch to the wallet that created this commitment before importing it."
      )
    }
  
    const roundId =
      BigInt(
        backup.roundId
      )
  
    const bidWei =
      BigInt(
        backup.bidWei
      )
  
    const recomputed =
      await computeCommitmentHash({
        chainId:
          BigInt(
            backup.chainId
          ),
  
        registrarAddress:
          backup.registrarAddress,
  
        roundId,
  
        bidder:
          backup.bidderAddress,
  
        label:
          backup.label,
  
        bidWei,
  
        salt:
          backup.salt,
      })
  
    if (
      recomputed.toLowerCase() !==
      backup.commitment.toLowerCase()
    ) {
      throw new Error(
        "Backup verification failed: the label, bid, salt or context does not reproduce the saved commitment."
      )
    }
  
    const contract =
      new Contract(
        backup.registrarAddress,
        BACKUP_ABI,
        provider
      )
  
    const deposit:
      bigint =
      await contract.COMMIT_DEPOSIT()
  
    if (
      bidWei > deposit
    ) {
      throw new Error(
        "Backup bid exceeds the registrar's maximum allowed bid."
      )
    }
  
    const commitmentId:
      bigint =
      await contract.getCommitmentId(
        roundId,
        backup.bidderAddress
      )
  
    /*
      No transaction was ever submitted.
  
      This is valid recovery data from a rejected or
      not-yet-approved commit.
    */
  
    if (
      commitmentId === 0n &&
      backup.commitTxHash === null
    ) {
      return
    }
  
    /*
      A transaction hash exists but nothing is recorded
      on-chain yet.
  
      It may still be pending, but don't pretend it is
      confirmed.
    */
  
    if (
      commitmentId === 0n
    ) {
      return
    }
  
    const stored =
      await contract.getCommitment(
        commitmentId
      )
  
    if (
      stored.digest.toLowerCase() !==
      backup.commitment.toLowerCase()
    ) {
      throw new Error(
        "The backup commitment does not match the commitment recorded on-chain."
      )
    }
  }
  
  /*
    ============================================================
    BACKUP → UI RECORD
    ============================================================
  */
  
  export function backupToCommitment(
    backup:
      RevealBackupV1
  ): Commitment {
    return {
      chainId:
        backup.chainId,
  
      registrarAddress:
        backup.registrarAddress,
  
      roundId:
        backup.roundId,
  
      bidder:
        backup.bidderAddress,
  
      name:
        backup.label,
  
      amount:
        formatEther(
          BigInt(
            backup.bidWei
          )
        ),
  
      bidWei:
        backup.bidWei,
  
      salt:
        backup.salt,
  
      hash:
        backup.commitment,
  
      txHash:
        backup.commitTxHash ??
        "",
  
      createdAt:
        Date.now(),
  
      submissionStatus:
        backup.commitTxHash
          ? "pending"
          : "prepared",
  
      revealed:
        false,
  
      settled:
        false,
    }
  }