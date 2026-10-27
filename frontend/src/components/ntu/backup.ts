import {
    BrowserProvider,
    Contract,
    ZeroAddress,
    formatEther,
    isAddress,
  } from "ethers"
  
  import {
    computeCommitmentHash,
    validateLabel,
    type Commitment,
  } from "./handlers"
  
  declare global {
    interface Window {
      ethereum?: any
    }
  }
  
  const REGISTRAR_ADDRESS =
    import.meta.env.VITE_REGISTRAR_ADDRESS as string | undefined
  
  const UINT256_MAX =
    (1n << 256n) - 1n
  
  /*
    Only the read methods needed to verify
    a backup against the deployed registrar.
  */
  const BACKUP_ABI = [
    "function COMMIT_DEPOSIT() view returns (uint256)",
    "function getCommitmentId(uint256 roundId, address bidder) view returns (uint256)",
    "function getCommitment(uint256 commitmentId) view returns (tuple(address bidder, bytes32 digest, uint256 roundId, uint256 deposit, bool revealed, bool valid, bytes32 labelHash, uint256 bidWei, bool settled))",
  ]
  
  /*
    ============================================================
    BACKUP FORMAT REQUIRED BY THE SPEC
    ============================================================
  */
  
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
  
  /*
    ============================================================
    BASIC HELPERS
    ============================================================
  */
  
  function requireEthereum() {
    if (!window.ethereum) {
      throw new Error(
        "MetaMask is required to verify this backup."
      )
    }
  
    return window.ethereum
  }
  
  function requireRegistrarAddress(): string {
    if (!REGISTRAR_ADDRESS) {
      throw new Error(
        "Registrar contract has not been deployed/configured yet."
      )
    }
  
    return REGISTRAR_ADDRESS
  }
  
  function isBytes32(
    value: unknown
  ): value is string {
    return (
      typeof value === "string" &&
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
      typeof value !== "string" ||
      !/^[0-9]+$/.test(value)
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
  */
  
  export async function createRevealBackup(
    commitment: Commitment
  ): Promise<RevealBackupV1> {
    const provider =
      new BrowserProvider(
        requireEthereum()
      )
  
    const network =
      await provider.getNetwork()
  
    /*
      We use bidWei directly when available.
  
      For older records created before this field
      existed, convert the ETH string exactly once.
    */
    let bidWei: string
  
    if (
      commitment.bidWei
    ) {
      bidWei =
        commitment.bidWei
    } else {
      /*
        This fallback exists only for old local records.
        New commitments should always store bidWei.
      */
      const { parseEther } =
        await import("ethers")
  
      bidWei =
        parseEther(
          commitment.amount
        ).toString()
    }
  
    return {
      schemaVersion: 1,
  
      chainId:
        network.chainId.toString(),
  
      registrarAddress:
        requireRegistrarAddress(),
  
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
    JSON SHAPE VALIDATION
    ============================================================
  */
  
  export function parseRevealBackup(
    raw: unknown
  ): RevealBackupV1 {
    if (
      typeof raw !== "object" ||
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
  
    if (
      chainId <= 0n
    ) {
      throw new Error(
        "chainId must be greater than zero."
      )
    }
  
    const roundId =
      parseUint256(
        backup.roundId,
        "roundId"
      )
  
    if (
      roundId <= 0n
    ) {
      throw new Error(
        "roundId must be greater than zero."
      )
    }
  
    const bidWei =
      parseUint256(
        backup.bidWei,
        "bidWei"
      )
  
    if (
      bidWei <= 0n
    ) {
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
  
    return backup as RevealBackupV1
  }
  
  /*
    ============================================================
    CONTEXT + HASH VERIFICATION
    ============================================================
  */
  
  export async function verifyRevealBackup(
    backup: RevealBackupV1,
    connectedAccount: string
  ): Promise<void> {
    const provider =
      new BrowserProvider(
        requireEthereum()
      )
  
    const network =
      await provider.getNetwork()
  
    const configuredRegistrar =
      requireRegistrarAddress()
  
    /*
      1. Chain check
    */
  
    if (
      network.chainId.toString() !==
      backup.chainId
    ) {
      throw new Error(
        `This backup belongs to chain ${backup.chainId}, but MetaMask is connected to chain ${network.chainId.toString()}.`
      )
    }
  
    /*
      2. Contract check
    */
  
    if (
      configuredRegistrar.toLowerCase() !==
      backup.registrarAddress.toLowerCase()
    ) {
      throw new Error(
        "This backup belongs to a different registrar deployment."
      )
    }
  
    /*
      3. Wallet check
    */
  
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
  
    /*
      4. Recompute commitment locally
    */
  
    const recomputed =
      await computeCommitmentHash({
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
  
    /*
      5. Check bid against the configured deposit limit.
    */
  
    const contract =
      new Contract(
        configuredRegistrar,
        BACKUP_ABI,
        provider
      )
  
    const deposit:
      bigint =
      await contract.COMMIT_DEPOSIT()
  
    if (
      bidWei >
      deposit
    ) {
      throw new Error(
        "Backup bid exceeds the registrar's maximum allowed bid."
      )
    }
  
    /*
      6. Verify the actual commitment stored on-chain
         for this wallet and round.
    */
  
    const commitmentId:
      bigint =
      await contract.getCommitmentId(
        roundId,
        backup.bidderAddress
      )
  
    if (
      commitmentId ===
      0n
    ) {
      throw new Error(
        "No on-chain commitment exists for this wallet and round."
      )
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
    CONVERT VERIFIED BACKUP BACK INTO UI RECORD
    ============================================================
  */
  
  export function backupToCommitment(
    backup: RevealBackupV1
  ): Commitment {
    return {
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
  
      revealed:
        false,
  
      settled:
        false,
    }
  }