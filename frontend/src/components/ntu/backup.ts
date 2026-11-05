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
    normalizeLabel,
    validateLabel,
    type Commitment,
    type CommitmentSubmissionStatus,
  } from "./handlers"

  const UINT256_MAX =
    (1n << 256n) - 1n

  const BACKUP_ABI = [
    "function COMMIT_DEPOSIT() view returns (uint256)",
    "function getCommitmentId(uint256 roundId, address bidder) view returns (uint256)",
    "function getCommitment(uint256 commitmentId) view returns (tuple(address bidder, bytes32 digest, uint256 roundId, uint256 deposit, bool revealed, bool valid, bytes32 labelHash, uint256 bidWei, bool settled))",
  ]

  /*
    ============================================================
    BACKUP FORMAT
    ============================================================

    The first fields are the required V1 backup fields.

    The fields after commitTxHash are optional recovery metadata.
    This keeps older V1 backups compatible while allowing newer
    backups to preserve local UI/recovery state.
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

    commitTxHash:
      string | null

    /*
      Optional recovery metadata.

      Older backups without these fields still work.
    */

    createdAt?: number

    submissionStatus?:
      CommitmentSubmissionStatus

    submissionError?: string

    commitmentId?: string

    revealed?: boolean
    valid?: boolean
    settled?: boolean
  }

  export interface BackupVerificationResult {
    onChainFound: boolean

    commitmentId?:
      string

    revealed:
      boolean

    valid?:
      boolean

    settled:
      boolean
  }

  const ALLOWED_STATUSES:
    CommitmentSubmissionStatus[] = [
      "prepared",
      "pending",
      "confirmed",
      "rejected",
      "failed",
    ]

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

    Preserve the ORIGINAL commitment context.

    We do not use the wallet's currently selected network here.
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

    if (
      commitment.bidWei
    ) {
      bidWei =
        commitment.bidWei
    } else {
      /*
        Legacy compatibility.

        New records always store exact bidWei.
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

      /*
        Optional recovery metadata.
      */

      createdAt:
        commitment.createdAt,

      submissionStatus:
        commitment.submissionStatus,

      submissionError:
        commitment.submissionError,

      commitmentId:
        commitment.commitmentId,

      revealed:
        commitment.revealed,

      valid:
        commitment.valid,

      settled:
        commitment.settled,
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

    /*
      Backup labels must already be canonical.

      We do not silently repair malformed imported backups.
    */

    const canonicalLabel =
      normalizeLabel(
        backup.label
      )

    if (
      canonicalLabel !==
      backup.label
    ) {
      throw new Error(
        "Backup label is not in canonical form."
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

    /*
      Optional recovery fields.
    */

    if (
      backup.createdAt !==
        undefined &&
      (
        typeof backup.createdAt !==
          "number" ||
        !Number.isFinite(
          backup.createdAt
        ) ||
        !Number.isInteger(
          backup.createdAt
        ) ||
        backup.createdAt <=
          0
      )
    ) {
      throw new Error(
        "Backup createdAt value is invalid."
      )
    }

    if (
      backup.submissionStatus !==
        undefined &&
      !ALLOWED_STATUSES.includes(
        backup.submissionStatus
      )
    ) {
      throw new Error(
        "Backup contains an invalid submission status."
      )
    }

    if (
      backup.submissionError !==
        undefined &&
      typeof backup.submissionError !==
        "string"
    ) {
      throw new Error(
        "Backup contains an invalid submission error."
      )
    }

    if (
      backup.commitmentId !==
        undefined
    ) {
      const commitmentId =
        parseUint256(
          backup.commitmentId,
          "commitmentId"
        )

      if (
        commitmentId <= 0n
      ) {
        throw new Error(
          "commitmentId must be greater than zero."
        )
      }
    }

    if (
      backup.revealed !==
        undefined &&
      typeof backup.revealed !==
        "boolean"
    ) {
      throw new Error(
        "Backup revealed status is invalid."
      )
    }

    if (
      backup.valid !==
        undefined &&
      typeof backup.valid !==
        "boolean"
    ) {
      throw new Error(
        "Backup validity status is invalid."
      )
    }

    if (
      backup.settled !==
        undefined &&
      typeof backup.settled !==
        "boolean"
    ) {
      throw new Error(
        "Backup settlement status is invalid."
      )
    }

    return backup as
      RevealBackupV1
  }

  /*
    ============================================================
    IMPORT VERIFICATION
    ============================================================

    Important:

    A backup is allowed to exist BEFORE an on-chain transaction.

    Therefore a valid prepared/rejected backup must not be rejected
    merely because getCommitmentId() returns zero.
  */

  export async function verifyRevealBackup(
    backup:
      RevealBackupV1,
    connectedAccount:
      string
  ): Promise<BackupVerificationResult> {
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
      No on-chain commitment.

      This is still valid recovery data if:
      - MetaMask was rejected
      - approval was never requested
      - the transaction is pending/not yet observable
    */

      if (
        commitmentId === 0n
      ) {
        /*
          No commitment exists on-chain.

          The backup may still be valid local recovery data
          for a prepared, rejected, failed or pending bid.

          But chain-derived fields must NOT be trusted from
          the JSON backup itself.
        */

        return {
          onChainFound:
            false,

          commitmentId:
            undefined,

          revealed:
            false,

          valid:
            undefined,

          settled:
            false,
        }
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

    /*
      Once an on-chain record exists, chain state is the
      source of truth for reveal/settlement status.
    */

    return {
      onChainFound:
        true,

      commitmentId:
        commitmentId.toString(),

      revealed:
        Boolean(
          stored.revealed
        ),

      valid:
        Boolean(
          stored.valid
        ),

      settled:
        Boolean(
          stored.settled
        ),
    }
  }

  /*
    ============================================================
    BACKUP → UI RECORD
    ============================================================
  */

  export function backupToCommitment(
    backup:
      RevealBackupV1,
    verification?:
      BackupVerificationResult
  ): Commitment {
    let submissionStatus:
      CommitmentSubmissionStatus

    /*
      Chain record found = definitely confirmed.
    */

    if (
      verification?.onChainFound
    ) {
      submissionStatus =
        "confirmed"
    } else if (
      backup.commitTxHash
    ) {
      /*
        A tx hash exists, but no on-chain commitment was
        found yet.

        Preserve a known failed status. Otherwise treat the
        transaction as pending rather than falsely confirmed.
      */

      submissionStatus =
        backup.submissionStatus ===
        "failed"
          ? "failed"
          : "pending"
    } else {
      /*
        No transaction hash.

        Prepared, rejected and failed records are all valid
        local recovery states.
      */

      if (
        backup.submissionStatus ===
          "rejected" ||
        backup.submissionStatus ===
          "failed"
      ) {
        submissionStatus =
          backup.submissionStatus
      } else {
        submissionStatus =
          "prepared"
      }
    }

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

        commitmentId:
        verification
          ? verification.commitmentId
          : backup.commitmentId,

      /*
        Preserve the original local timestamp where available.
        Old V1 backups without it remain compatible.
      */

      createdAt:
        backup.createdAt ??
        Date.now(),

      submissionStatus,

      submissionError:
        submissionStatus ===
        "confirmed"
          ? undefined
          : backup.submissionError,

          revealed:
          verification
            ? verification.revealed
            : backup.revealed ??
              false,

        valid:
          verification
            ? verification.valid
            : backup.valid,

        settled:
          verification
            ? verification.settled
            : backup.settled ??
              false,
    }
  }
