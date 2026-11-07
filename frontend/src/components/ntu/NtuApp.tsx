import {
  useCallback,
  useEffect,
  useState,
} from "react"

import { Navbar } from "./Navbar"
import { RoundSection } from "./RoundSection"
import { DomainSearch } from "./DomainSearch"
import { DomainStatusCard } from "./DomainStatusCard"
import { BidForm } from "./BidForm"
import { RevealSection } from "./RevealSection"

import {
  SettlementSection,
  type SettlementResult,
  type WithdrawalResult,
} from "./SettlementSection"

import { ResolutionSection } from "./ResolutionSection"
import { PaymentSection } from "./PaymentSection"

import {
  backupToCommitment,
  createRevealBackup,
  parseRevealBackup,
  verifyRevealBackup,
} from "./backup"

import {
  checkDomain,
  confirmBidCommitment,
  confirmPayment,
  connectWallet,
  disconnectWallet,
  finalizeDomain,
  getCurrentRoundState,
  getFriendlyError,
  getNetworkStatus,
  getRegistrarAddress,
  getWithdrawalCredit,
  prepareBidCommitment,
  previewPayment,
  reconcileBidCommitment,
  requestBidCommitment,
  revealBid,
  setResolutionAddress,
  settleCommitment,
  startAuctionRound,
  switchToConfiguredNetwork,
  withdrawCredit,
  type Commitment,
  type DomainInfo,
  type NetworkStatus,
  type PaymentPreview,
  type RoundState,
} from "./handlers"

/*
  ============================================================
  RECOVERY STORAGE
  ============================================================
*/

const STORAGE_PREFIX =
  "ntu-commitment"

const PREVIOUS_STORAGE_PREFIX =
  "ntu-commitment-v1:"

const LEGACY_STORAGE_KEY =
  "ntu-commitments"

function getCommitmentStorageKey(
  commitment:
    Commitment
): string | null {
  if (
    !commitment.chainId ||
    !commitment.registrarAddress
  ) {
    return null
  }

  return [
    STORAGE_PREFIX,
    commitment.chainId,
    commitment.registrarAddress.toLowerCase(),
    commitment.bidder.toLowerCase(),
    commitment.roundId,
  ].join(":")
}

function persistCommitment(
  commitment:
    Commitment
) {
  const key =
    getCommitmentStorageKey(
      commitment
    )

  if (!key) {
    return
  }

  localStorage.setItem(
    key,
    JSON.stringify(
      commitment
    )
  )
}

function loadStoredCommitments():
Commitment[] {
  const records:
    Commitment[] = []

  const remember = (
    value:
      Commitment & {
        submissionFailed?: boolean
      }
  ) => {
    if (
      !value ||
      typeof value.hash !==
        "string"
    ) {
      return
    }

    const record:
      Commitment = {
        ...value,

        submissionStatus:
          value.submissionStatus ??
          (
            value.submissionFailed
              ? "failed"
              : value.commitmentId
                ? "confirmed"
                : value.txHash
                  ? "pending"
                  : "prepared"
          ),
      }

    const index =
      records.findIndex(
        (existing) =>
          existing.hash.toLowerCase() ===
          record.hash.toLowerCase()
      )

    if (index < 0) {
      records.push(record)
    } else {
      records[index] =
        mergeRecoveredCommitment(
          records[index],
          record
        )
    }
  }

  for (
    let index = 0;
    index <
    localStorage.length;
    index += 1
  ) {
    const key =
      localStorage.key(
        index
      )

    if (
      !key ||
      (
        !key.startsWith(
          `${STORAGE_PREFIX}:`
        ) &&
        !key.startsWith(
          PREVIOUS_STORAGE_PREFIX
        )
      )
    ) {
      continue
    }

    try {
      const raw =
        localStorage.getItem(
          key
        )

      if (!raw) {
        continue
      }

      const parsed =
        JSON.parse(
          raw
        ) as Commitment

      remember(parsed)
    } catch (error) {
      console.error(
        `Failed to load ${key}:`,
        error
      )
    }
  }

  try {
    const legacy =
      localStorage.getItem(
        LEGACY_STORAGE_KEY
      )

    if (legacy) {
      const parsed =
        JSON.parse(
          legacy
        )

      if (
        Array.isArray(
          parsed
        )
      ) {
        for (
          const record of
          parsed
        ) {
          remember(record)
        }
      }
    }
  } catch (error) {
    console.error(
      "Failed to load legacy commitments:",
      error
    )
  }

  return records.sort(
    (left, right) =>
      (right.createdAt ?? 0) -
      (left.createdAt ?? 0)
  )
}

function sameCommitmentContext(
  left:
    Commitment,
  right:
    Commitment
): boolean {
  if (
    left.chainId &&
    right.chainId &&
    left.registrarAddress &&
    right.registrarAddress
  ) {
    return (
      left.chainId ===
        right.chainId &&
      left.registrarAddress.toLowerCase() ===
        right.registrarAddress.toLowerCase() &&
      left.bidder.toLowerCase() ===
        right.bidder.toLowerCase() &&
      left.roundId ===
        right.roundId
    )
  }

  return (
    left.hash ===
    right.hash
  )
}

function upsertCommitment(
  records:
    Commitment[],
  incoming:
    Commitment
): Commitment[] {
  const index =
    records.findIndex(
      (existing) =>
        sameCommitmentContext(
          existing,
          incoming
        )
    )

  if (index < 0) {
    return [
      incoming,
      ...records,
    ]
  }

  const next =
    [...records]

  next[index] =
    incoming

  return next
}

function getSubmissionRank(
  status:
    Commitment["submissionStatus"]
): number {
  switch (status) {
    case "confirmed":
      return 4

    case "pending":
      return 2

    case "failed":
      return 3

    case "rejected":
      return 2

    case "prepared":
      return 1

    default:
      return 0
  }
}

function mergeRecoveredCommitment(
  existing:
    Commitment,
  incoming:
    Commitment
): Commitment {
  if (
    existing.hash.toLowerCase() !==
    incoming.hash.toLowerCase()
  ) {
    throw new Error(
      "A different saved commitment already exists for this wallet and round. The existing recovery record was not replaced."
    )
  }

  const existingRank =
    getSubmissionRank(
      existing.submissionStatus
    )

  const incomingRank =
    getSubmissionRank(
      incoming.submissionStatus
    )

  const submissionStatus =
    incomingRank >
    existingRank
      ? incoming.submissionStatus
      : existing.submissionStatus ??
        incoming.submissionStatus

  const createdAt =
    Math.min(
      existing.createdAt ||
        incoming.createdAt,
      incoming.createdAt ||
        existing.createdAt
    )

  return {
    ...incoming,

    createdAt,

    txHash:
      incoming.txHash ||
      existing.txHash,

    commitmentId:
      incoming.commitmentId ??
      existing.commitmentId,

    submissionStatus,

    submissionError:
      submissionStatus ===
      "confirmed"
        ? undefined
        : incoming.submissionError ??
          existing.submissionError,

    revealed:
      Boolean(
        existing.revealed ||
        incoming.revealed
      ),

    valid:
      incoming.valid ??
      existing.valid,

    settled:
      Boolean(
        existing.settled ||
        incoming.settled
      ),
  }
}

export default function NtuApp() {
  /*
    ========================================================
    WALLET
    ========================================================
  */

  const [
    account,
    setAccount,
  ] =
    useState<string | null>(
      null
    )

  const [
    connecting,
    setConnecting,
  ] = useState(false)

  /*
    ========================================================
    NETWORK
    ========================================================
  */

  const [
    networkStatus,
    setNetworkStatus,
  ] =
    useState<NetworkStatus | null>(
      null
    )

  const [
    loadingNetwork,
    setLoadingNetwork,
  ] = useState(false)

  const [
    switchingNetwork,
    setSwitchingNetwork,
  ] = useState(false)

  /*
    ========================================================
    ROUND
    ========================================================
  */

  const [
    round,
    setRound,
  ] =
    useState<RoundState | null>(
      null
    )

  const [
    loadingRound,
    setLoadingRound,
  ] = useState(false)

  const [
    startingRound,
    setStartingRound,
  ] = useState(false)

  /*
    ========================================================
    DOMAIN
    ========================================================
  */

  const [
    domain,
    setDomain,
  ] =
    useState<DomainInfo | null>(
      null
    )

  const [
    searching,
    setSearching,
  ] = useState(false)

  const [
    committing,
    setCommitting,
  ] = useState(false)

  const [
    finalizing,
    setFinalizing,
  ] = useState(false)

  /*
    ========================================================
    COMMITMENT / RECOVERY
    ========================================================
  */

  const [
    commitments,
    setCommitments,
  ] =
    useState<Commitment[]>(
      () =>
        loadStoredCommitments()
    )

  const [
    revealingHash,
    setRevealingHash,
  ] =
    useState<string | null>(
      null
    )

  /*
    ========================================================
    SETTLEMENT
    ========================================================
  */

  const [
    settlingHash,
    setSettlingHash,
  ] =
    useState<string | null>(
      null
    )

  const [
    withdrawalCreditEth,
    setWithdrawalCreditEth,
  ] = useState("0")

  const [
    loadingCredit,
    setLoadingCredit,
  ] = useState(false)

  const [
    withdrawing,
    setWithdrawing,
  ] = useState(false)

  const [
    lastSettlement,
    setLastSettlement,
  ] =
    useState<SettlementResult | null>(
      null
    )

  const [
    lastWithdrawal,
    setLastWithdrawal,
  ] =
    useState<WithdrawalResult | null>(
      null
    )

  /*
    ========================================================
    RESOLUTION
    ========================================================
  */

  const [
    updatingResolution,
    setUpdatingResolution,
  ] = useState(false)

  const [
    lastResolutionTxHash,
    setLastResolutionTxHash,
  ] =
    useState<string | null>(
      null
    )

  /*
    ========================================================
    PAYMENT
    ========================================================
  */

  const [
    previewingPayment,
    setPreviewingPayment,
  ] = useState(false)

  const [
    paymentPreview,
    setPaymentPreview,
  ] =
    useState<PaymentPreview | null>(
      null
    )

  const [
    sending,
    setSending,
  ] = useState(false)

  const [
    lastPayment,
    setLastPayment,
  ] =
    useState<{
      name: string
      amount: string
      resolvedAddress: string
      txHash: string
    } | null>(
      null
    )

  /*
    ========================================================
    NETWORK REFRESH
    ========================================================
  */

  const refreshNetworkStatus =
    useCallback(
      async () => {
        setLoadingNetwork(
          true
        )

        try {
          const status =
            await getNetworkStatus()

          setNetworkStatus(
            status
          )

          return status
        } catch (error) {
          console.error(
            "Failed to read network:",
            error
          )

          setNetworkStatus(
            null
          )

          return null
        } finally {
          setLoadingNetwork(
            false
          )
        }
      },
      []
    )

  /*
    ========================================================
    ROUND REFRESH
    ========================================================
  */

  const refreshRound =
    useCallback(
      async () => {
        setLoadingRound(
          true
        )

        try {
          const status =
            await getNetworkStatus()

          setNetworkStatus(
            status
          )

          if (!status.ready) {
            setRound(null)

            return
          }

          const current =
            await getCurrentRoundState()

          setRound(
            current
          )
        } catch (error) {
          console.error(
            "Failed to load round:",
            error
          )

          setRound(null)
        } finally {
          setLoadingRound(
            false
          )
        }
      },
      []
    )

  /*
    ========================================================
    INITIAL LOAD
    ========================================================
  */

  useEffect(() => {
    const timeoutId =
      window.setTimeout(
        () => {
          void refreshNetworkStatus()
          void refreshRound()
        },
        0
      )

    return () => {
      window.clearTimeout(
        timeoutId
      )
    }
  }, [
    refreshNetworkStatus,
    refreshRound,
  ])

  /*
    ========================================================
    METAMASK EVENTS
    ========================================================
  */

  useEffect(() => {
    const ethereum =
      window.ethereum

    if (!ethereum) {
      return
    }

    const handleAccountsChanged =
      (
        accounts:
          string[]
      ) => {
        if (
          accounts.length ===
          0
        ) {
          setAccount(null)
        } else {
          setAccount(
            accounts[0]
          )
        }

        setLastResolutionTxHash(
          null
        )

        setLastSettlement(
          null
        )

        setLastWithdrawal(
          null
        )

        setWithdrawalCreditEth(
          "0"
        )

        setPaymentPreview(
          null
        )
      }

    const handleChainChanged =
      () => {
        setRound(null)
        setDomain(null)

        setWithdrawalCreditEth(
          "0"
        )

        setLastSettlement(
          null
        )

        setLastWithdrawal(
          null
        )

        setLastResolutionTxHash(
          null
        )

        setPaymentPreview(
          null
        )

        void refreshNetworkStatus()
        void refreshRound()
      }

    ethereum.on(
      "accountsChanged",
      handleAccountsChanged
    )

    ethereum.on(
      "chainChanged",
      handleChainChanged
    )

    return () => {
      ethereum.removeListener(
        "accountsChanged",
        handleAccountsChanged
      )

      ethereum.removeListener(
        "chainChanged",
        handleChainChanged
      )
    }
  }, [
    refreshNetworkStatus,
    refreshRound,
  ])

  /*
    ========================================================
    KEEP CONTEXT-SPECIFIC RECORDS PERSISTED
    ========================================================
  */

  useEffect(() => {
    for (
      const commitment of
      commitments
    ) {
      persistCommitment(
        commitment
      )
    }
  }, [
    commitments,
  ])

  /*
    ========================================================
    RECONCILE AFTER RELOAD
    ========================================================
  */

  useEffect(() => {
    if (
      !account ||
      !networkStatus?.ready
    ) {
      return
    }

    let cancelled =
      false

    const configuredRegistrar =
      import.meta.env
        .VITE_REGISTRAR_ADDRESS as
        | string
        | undefined

    const reconcile =
      async () => {
        const relevant =
          commitments.filter(
            (commitment) =>
              commitment.chainId ===
                networkStatus.chainId &&
              Boolean(
                commitment.registrarAddress &&
                configuredRegistrar &&
                commitment.registrarAddress.toLowerCase() ===
                  configuredRegistrar.toLowerCase()
              ) &&
              commitment.bidder.toLowerCase() ===
                account.toLowerCase() &&
              commitment.submissionStatus !==
                "confirmed"
          )

        for (
          const commitment of
          relevant
        ) {
          try {
            const updated =
              await reconcileBidCommitment(
                commitment
              )

            if (
              cancelled ||
              (
                updated.submissionStatus ===
                  commitment.submissionStatus &&
                updated.commitmentId ===
                  commitment.commitmentId
              )
            ) {
              continue
            }

            persistCommitment(
              updated
            )

            setCommitments(
              (previous) =>
                upsertCommitment(
                  previous,
                  updated
                )
            )
          } catch (error) {
            console.error(
              "Could not reconcile saved commitment:",
              error
            )
          }
        }
      }

    void reconcile()

    const timer =
      commitments.some(
        (record) =>
          record.bidder.toLowerCase() ===
            account.toLowerCase() &&
          record.submissionStatus ===
            "pending" &&
          Boolean(
            record.txHash
          )
      )
        ? window.setInterval(
            () => {
              void reconcile()
            },
            5000
          )
        : null

    return () => {
      cancelled =
        true

      if (
        timer !== null
      ) {
        window.clearInterval(
          timer
        )
      }
    }
  }, [
    account,
    commitments,
    networkStatus?.chainId,
    networkStatus?.ready,
  ])

  /*
    ========================================================
    SWITCH NETWORK
    ========================================================
  */

  const handleSwitchNetwork =
    async () => {
      setSwitchingNetwork(
        true
      )

      try {
        await switchToConfiguredNetwork()

        const status =
          await refreshNetworkStatus()

        if (
          status?.ready
        ) {
          await refreshRound()
        }
      } catch (error) {
        alert(
          getFriendlyError(
            error
          )
        )
      } finally {
        setSwitchingNetwork(
          false
        )
      }
    }

  /*
    ========================================================
    START ROUND
    ========================================================
  */

  const handleStartRound =
    async () => {
      if (!account) {
        alert(
          "Connect your wallet before starting a round."
        )

        return
      }

      if (
        !networkStatus?.ready
      ) {
        alert(
          `Switch to ${
            networkStatus?.expectedNetworkName ??
            "the configured network"
          } before starting a round.`
        )

        return
      }

      setStartingRound(
        true
      )

      try {
        await startAuctionRound()

        await refreshRound()

        if (domain) {
          setDomain(
            await checkDomain(
              domain.name
            )
          )
        }
      } catch (error) {
        alert(
          getFriendlyError(
            error
          )
        )
      } finally {
        setStartingRound(
          false
        )
      }
    }

  /*
    ========================================================
    WITHDRAWAL CREDIT
    ========================================================
  */

  const refreshWithdrawalCredit =
    useCallback(
      async (
        wallet?: string
      ) => {
        const target =
          wallet ??
          account

        if (
          !target ||
          !networkStatus?.ready
        ) {
          setWithdrawalCreditEth(
            "0"
          )

          return
        }

        setLoadingCredit(
          true
        )

        try {
          const credit =
            await getWithdrawalCredit(
              target
            )

          setWithdrawalCreditEth(
            credit.eth
          )
        } catch (error) {
          console.error(
            "Failed to refresh withdrawal credit:",
            error
          )
        } finally {
          setLoadingCredit(
            false
          )
        }
      },
      [
        account,
        networkStatus?.ready,
      ]
    )

  useEffect(() => {
    if (
      !account ||
      !networkStatus?.ready
    ) {
      return
    }

    const timeoutId =
      window.setTimeout(
        () => {
          void refreshWithdrawalCredit(
            account
          )
        },
        0
      )

    return () => {
      window.clearTimeout(
        timeoutId
      )
    }
  }, [
    account,
    networkStatus?.ready,
    refreshWithdrawalCredit,
  ])

  /*
    ========================================================
    CONNECT / DISCONNECT
    ========================================================
  */

  const handleConnect =
    async () => {
      setConnecting(
        true
      )

      try {
        const address =
          await connectWallet()

        setAccount(
          address
        )

        await refreshNetworkStatus()
      } catch (error) {
        alert(
          getFriendlyError(
            error
          )
        )
      } finally {
        setConnecting(
          false
        )
      }
    }

  const handleDisconnect =
    async () => {
      await disconnectWallet()

      setAccount(null)

      setWithdrawalCreditEth(
        "0"
      )
    }

  /*
    ========================================================
    DOMAIN SEARCH
    ========================================================
  */

  const handleSearch =
    useCallback(
      async (
        name: string
      ) => {
        if (
          !networkStatus?.ready
        ) {
          alert(
            `Switch to ${
              networkStatus?.expectedNetworkName ??
              "the configured network"
            } before searching domains.`
          )

          return
        }

        setSearching(
          true
        )

        try {
          setDomain(
            await checkDomain(
              name
            )
          )
        } catch (error) {
          alert(
            getFriendlyError(
              error
            )
          )
        } finally {
          setSearching(
            false
          )
        }
      },
      [
        networkStatus,
      ]
    )

  const refreshCurrentDomain =
    useCallback(
      async () => {
        if (
          !domain ||
          !networkStatus?.ready
        ) {
          return
        }

        try {
          setDomain(
            await checkDomain(
              domain.name
            )
          )
        } catch (error) {
          console.error(
            "Failed to refresh domain:",
            error
          )
        }
      },
      [
        domain,
        networkStatus?.ready,
      ]
    )

  const handlePhaseExpired =
    useCallback(
      async () => {
        await Promise.all([
          refreshCurrentDomain(),
          refreshRound(),
        ])
      },
      [
        refreshCurrentDomain,
        refreshRound,
      ]
    )

  /*
    ========================================================
    COMMIT
    ========================================================
  */

  const handleCommit =
    async (
      params: {
        name: string
        amount: string
        salt: string
      }
    ) => {
      if (!account) {
        alert(
          "Connect your wallet before committing a bid."
        )

        return
      }

      if (
        !networkStatus?.ready
      ) {
        alert(
          `Switch to ${
            networkStatus?.expectedNetworkName ??
            "the configured network"
          } before committing a bid.`
        )

        return
      }

      setCommitting(
        true
      )

      let latestCommitment:
        Commitment | null =
        null

      let transactionBroadcast =
        false

      try {
        const prepared =
          await prepareBidCommitment(
            params
          )

        latestCommitment =
          prepared

        persistCommitment(
          prepared
        )

        setCommitments(
          (previous) =>
            upsertCommitment(
              previous,
              prepared
            )
        )

        const submission =
          await requestBidCommitment(
            prepared
          )

        if (
          submission.alreadyConfirmed
        ) {
          const confirmed:
            Commitment = {
              ...prepared,

              commitmentId:
                submission.commitmentId,

              txHash:
                submission.txHash ||
                prepared.txHash,

              submissionStatus:
                "confirmed",

              submissionError:
                undefined,
            }

          persistCommitment(
            confirmed
          )

          setCommitments(
            (previous) =>
              upsertCommitment(
                previous,
                confirmed
              )
          )

          await refreshRound()

          return
        }

        transactionBroadcast =
          true

        const pending:
          Commitment = {
            ...prepared,

            txHash:
              submission.txHash,

            submissionStatus:
              "pending",

            submissionError:
              undefined,
          }

        persistCommitment(
          pending
        )

        setCommitments(
          (previous) =>
            upsertCommitment(
              previous,
              pending
            )
        )

        try {
          const confirmation =
            await confirmBidCommitment(
              pending,
              submission.txHash
            )

          const confirmed:
            Commitment = {
              ...pending,

              commitmentId:
                confirmation.commitmentId,

              txHash:
                confirmation.txHash ||
                pending.txHash,

              submissionStatus:
                "confirmed",

              submissionError:
                undefined,
            }

          latestCommitment =
            confirmed

          persistCommitment(
            confirmed
          )

          setCommitments(
            (previous) =>
              upsertCommitment(
                previous,
                confirmed
              )
          )

          setDomain(
            await checkDomain(
              confirmed.name
            )
          )

          await refreshRound()
        } catch (error) {
          const failed:
            Commitment = {
              ...pending,

              submissionStatus:
                /failed on-chain|does not match|did not create/i.test(
                  getFriendlyError(
                    error
                  )
                )
                  ? "failed"
                  : "pending",

              submissionError:
                getFriendlyError(
                  error
                ),
            }

          persistCommitment(
            failed
          )

          setCommitments(
            (previous) =>
              upsertCommitment(
                previous,
                failed
              )
          )

          throw error
        }
      } catch (error) {
        const message =
          getFriendlyError(
            error
          )

        if (
          latestCommitment &&
          !transactionBroadcast
        ) {
          const rejected =
            message
              .toLowerCase()
              .includes(
                "cancelled"
              )

          const saved:
            Commitment = {
              ...latestCommitment,

              submissionStatus:
                rejected
                  ? "rejected"
                  : "failed",

              submissionError:
                message,
            }

          persistCommitment(
            saved
          )

          setCommitments(
            (previous) =>
              upsertCommitment(
                previous,
                saved
              )
          )
        }

        alert(
          message
        )
      } finally {
        setCommitting(
          false
        )
      }
    }

  /*
    ========================================================
    REVEAL
    ========================================================
  */

  const handleReveal =
    async (
      commitment:
        Commitment
    ) => {
      if (!account) {
        alert(
          "Connect your wallet before revealing."
        )

        return
      }

      if (
        !networkStatus?.ready
      ) {
        alert(
          `Switch to ${
            networkStatus?.expectedNetworkName ??
            "the configured network"
          } before revealing.`
        )

        return
      }

      if (
        commitment.bidder.toLowerCase() !==
        account.toLowerCase()
      ) {
        alert(
          "Switch to the wallet that created this commitment."
        )

        return
      }

      setRevealingHash(
        commitment.hash
      )

      try {
        /*
          Fresh contract state check before MetaMask.
        */

        const latestRound =
          await getCurrentRoundState()

        if (
          !latestRound ||
          latestRound.roundId !==
            commitment.roundId ||
          latestRound.phase !==
            "reveal"
        ) {
          throw new Error(
            "This commitment is not currently in the reveal phase. Refresh the auction state and try again."
          )
        }

        /*
          revealBid performs another on-chain
          phase check before sending the transaction.
        */

        const result =
          await revealBid(
            commitment
          )

        const updated:
          Commitment = {
            ...commitment,

            revealed:
              true,

            valid:
              result.valid,
          }

        persistCommitment(
          updated
        )

        setCommitments(
          (previous) =>
            upsertCommitment(
              previous,
              updated
            )
        )

        /*
          First valid reveal reserves the domain.
          Later reveals update the highest bidder.
        */

        setDomain(
          await checkDomain(
            commitment.name
          )
        )

        await refreshRound()
      } catch (error) {
        /*
          If the chain phase changed,
          immediately refresh stale UI state.
        */

        await Promise.all([
          refreshRound(),
          refreshCurrentDomain(),
        ])

        alert(
          getFriendlyError(
            error
          )
        )
      } finally {
        setRevealingHash(
          null
        )
      }
    }

  /*
    ========================================================
    FINALIZE
    ========================================================
  */

  const handleFinalize =
    async (
      name: string
    ) => {
      if (!account) {
        alert(
          "Connect your wallet before finalizing."
        )

        return
      }

      if (
        !networkStatus?.ready
      ) {
        return
      }

      setFinalizing(
        true
      )

      try {
        await finalizeDomain(
          name
        )

        setDomain(
          await checkDomain(
            name
          )
        )

        await refreshRound()
      } catch (error) {
        await Promise.all([
          refreshRound(),
          refreshCurrentDomain(),
        ])

        alert(
          getFriendlyError(
            error
          )
        )
      } finally {
        setFinalizing(
          false
        )
      }
    }

  /*
    ========================================================
    SETTLEMENT
    ========================================================
  */

  const handleSettle =
    async (
      commitment:
        Commitment
    ) => {
      if (!account) {
        alert(
          "Connect your wallet before settling."
        )

        return
      }

      if (
        !networkStatus?.ready
      ) {
        return
      }

      if (
        commitment.bidder.toLowerCase() !==
        account.toLowerCase()
      ) {
        alert(
          "Switch to the wallet that created this commitment."
        )

        return
      }

      setSettlingHash(
        commitment.hash
      )

      try {
        const result =
          await settleCommitment(
            commitment
          )

        const updated:
          Commitment = {
            ...commitment,

            settled:
              true,
          }

        persistCommitment(
          updated
        )

        setCommitments(
          (previous) =>
            upsertCommitment(
              previous,
              updated
            )
        )

        setLastSettlement({
          name:
            commitment.name,

          commitmentId:
            commitment.commitmentId ??
            "",

          refundEth:
            result.refundEth,

          proceedsEth:
            result.proceedsEth,

          txHash:
            result.txHash,
        })

        await refreshWithdrawalCredit(
          account
        )
      } catch (error) {
        alert(
          getFriendlyError(
            error
          )
        )
      } finally {
        setSettlingHash(
          null
        )
      }
    }

  /*
    ========================================================
    WITHDRAW
    ========================================================
  */

  const handleWithdraw =
    async () => {
      if (!account) {
        alert(
          "Connect your wallet before withdrawing."
        )

        return
      }

      if (
        !networkStatus?.ready
      ) {
        return
      }

      setWithdrawing(
        true
      )

      try {
        const result =
          await withdrawCredit()

        setLastWithdrawal({
          amountEth:
            result.amountEth,

          txHash:
            result.txHash,
        })

        await refreshWithdrawalCredit(
          account
        )
      } catch (error) {
        alert(
          getFriendlyError(
            error
          )
        )
      } finally {
        setWithdrawing(
          false
        )
      }
    }

  /*
    ========================================================
    RESOLUTION
    ========================================================
  */

  const handleResolutionUpdate =
    async (
      name: string,
      target: string
    ) => {
      if (!account) {
        alert(
          "Connect your wallet before changing the resolution address."
        )

        return
      }

      if (
        !networkStatus?.ready
      ) {
        return
      }

      if (
        !domain?.owner ||
        domain.owner.toLowerCase() !==
          account.toLowerCase()
      ) {
        alert(
          "Only the domain owner can change its resolution address."
        )

        return
      }

      setUpdatingResolution(
        true
      )

      try {
        const result =
          await setResolutionAddress(
            name,
            target
          )

        setLastResolutionTxHash(
          result.txHash
        )

        setDomain(
          await checkDomain(
            name
          )
        )
      } catch (error) {
        alert(
          getFriendlyError(
            error
          )
        )
      } finally {
        setUpdatingResolution(
          false
        )
      }
    }

  /*
    ========================================================
    BACKUP EXPORT
    ========================================================
  */

  const handleDownloadBackup =
    async () => {
      if (!account) {
        alert(
          "Connect the wallet whose commitments you want to back up."
        )

        return
      }

      if (
        !networkStatus?.ready
      ) {
        alert(
          "Connect to the configured registrar network before exporting a backup."
        )

        return
      }

      const registrarAddress =
        getRegistrarAddress()
          .toLowerCase()

      const exportable =
        commitments.filter(
          (commitment) =>
            commitment.chainId ===
              networkStatus.chainId &&
            commitment.registrarAddress
              ?.toLowerCase() ===
              registrarAddress &&
            commitment.bidder
              .toLowerCase() ===
              account.toLowerCase()
        )

      if (
        exportable.length ===
        0
      ) {
        alert(
          "No commitments were found for this wallet on the current registrar."
        )

        return
      }

      try {
        const backups =
          await Promise.all(
            exportable.map(
              (commitment) =>
                createRevealBackup(
                  commitment
                )
            )
          )

        const blob =
          new Blob(
            [
              JSON.stringify(
                backups,
                null,
                2
              ),
            ],
            {
              type:
                "application/json",
            }
          )

        const url =
          URL.createObjectURL(
            blob
          )

        const anchor =
          document.createElement(
            "a"
          )

        anchor.href =
          url

        anchor.download =
          `ntu-reveal-backup-v1-${account.slice(
            0,
            6
          )}-${networkStatus.chainId}.json`

        document.body.appendChild(
          anchor
        )

        anchor.click()

        document.body.removeChild(
          anchor
        )

        URL.revokeObjectURL(
          url
        )
      } catch (error) {
        alert(
          getFriendlyError(
            error
          )
        )
      }
    }

  /*
    ========================================================
    BACKUP IMPORT
    ========================================================
  */

  const handleImportBackup =
    async (
      file: File
    ) => {
      if (!account) {
        alert(
          "Connect the wallet that created the commitment before importing a backup."
        )

        return
      }

      try {
        const parsed =
          JSON.parse(
            await file.text()
          )

        const records =
          Array.isArray(
            parsed
          )
            ? parsed
            : [parsed]

        const verified:
          Commitment[] = []

        for (
          const raw of
          records
        ) {
          const backup =
            parseRevealBackup(
              raw
            )

          const verification =
            await verifyRevealBackup(
              backup,
              account
            )

          verified.push(
            backupToCommitment(
              backup,
              verification
            )
          )
        }

        let mergedRecords =
          [...commitments]

        const recordsToPersist:
          Commitment[] = []

        for (
          const incoming of
          verified
        ) {
          const existing =
            mergedRecords.find(
              (record) =>
                sameCommitmentContext(
                  record,
                  incoming
                )
            )

          const merged =
            existing
              ? mergeRecoveredCommitment(
                  existing,
                  incoming
                )
              : incoming

          mergedRecords =
            upsertCommitment(
              mergedRecords,
              merged
            )

          recordsToPersist.push(
            merged
          )
        }

        for (
          const commitment of
          recordsToPersist
        ) {
          persistCommitment(
            commitment
          )
        }

        setCommitments(
          mergedRecords
        )

        alert(
          "Reveal backup verified and imported successfully."
        )
      } catch (error) {
        alert(
          getFriendlyError(
            error
          )
        )
      }
    }

  /*
    ========================================================
    PAYMENT
    ========================================================
  */

  const handlePaymentPreview =
    async (
      params: {
        name: string
        amount: string
      }
    ) => {
      if (!account) {
        alert(
          "Connect your wallet before sending ETH."
        )

        return
      }

      if (
        !networkStatus?.ready
      ) {
        alert(
          `Switch to ${
            networkStatus?.expectedNetworkName ??
            "the configured network"
          } before sending ETH.`
        )

        return
      }

      setPreviewingPayment(
        true
      )

      setPaymentPreview(
        null
      )

      try {
        const result =
          await previewPayment(
            params
          )

        setPaymentPreview(
          result
        )
      } catch (error) {
        alert(
          getFriendlyError(
            error
          )
        )
      } finally {
        setPreviewingPayment(
          false
        )
      }
    }

  const handleConfirmPayment =
    async (
      preview:
        PaymentPreview
    ) => {
      if (!account) {
        alert(
          "Connect your wallet before sending ETH."
        )

        return
      }

      if (
        !networkStatus?.ready
      ) {
        setPaymentPreview(
          null
        )

        alert(
          "The network changed. Please preview the payment again."
        )

        return
      }

      setSending(
        true
      )

      try {
        const result =
          await confirmPayment(
            preview
          )

        setLastPayment({
          name:
            preview.name,

          amount:
            preview.amount,

          resolvedAddress:
            result.resolvedAddress,

          txHash:
            result.txHash,
        })

        setPaymentPreview(
          null
        )
      } catch (error) {
        setPaymentPreview(
          null
        )

        alert(
          getFriendlyError(
            error
          )
        )
      } finally {
        setSending(
          false
        )
      }
    }

  const handleClearPaymentPreview =
    () => {
      if (sending) {
        return
      }

      setPaymentPreview(
        null
      )
    }

  /*
    ========================================================
    WRITE ACCOUNT
    ========================================================
  */

  const writeAccount =
    networkStatus?.ready
      ? account
      : null

  /*
    ========================================================
    UI
    ========================================================
  */

  return (
    <div className="relative min-h-screen bg-zinc-50 text-zinc-900">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(0,71,171,0.08),transparent_65%)]"
      />

      <Navbar
        account={account}
        connecting={
          connecting
        }
        networkName={
          networkStatus?.networkName ??
          "Unknown network"
        }
        networkReady={
          networkStatus?.ready ??
          false
        }
        onConnect={
          handleConnect
        }
        onDisconnect={
          handleDisconnect
        }
      />

      <main className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
        {loadingNetwork && (
          <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-600">
            Checking wallet network…
          </div>
        )}

        {!loadingNetwork &&
          networkStatus &&
          !networkStatus.correctNetwork && (
            <div className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-amber-950">
                  Wrong network
                </p>

                <p className="mt-1 text-sm text-amber-800">
                  MetaMask is currently connected to{" "}
                  <strong>
                    {
                      networkStatus.networkName
                    }
                  </strong>
                  . This registrar is configured for{" "}
                  <strong>
                    {
                      networkStatus.expectedNetworkName
                    }
                  </strong>
                  .
                </p>
              </div>

              <button
                type="button"
                disabled={
                  switchingNetwork
                }
                onClick={() =>
                  void handleSwitchNetwork()
                }
                className="rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {switchingNetwork
                  ? "Switching…"
                  : `Switch to ${networkStatus.expectedNetworkName}`}
              </button>
            </div>
          )}

        {!loadingNetwork &&
          networkStatus?.correctNetwork &&
          !networkStatus.registrarConfigured && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
              <p className="font-semibold text-red-950">
                Registrar not configured
              </p>
            </div>
          )}

        {!loadingNetwork &&
          networkStatus?.correctNetwork &&
          networkStatus.registrarConfigured &&
          !networkStatus.registrarExists && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
              <p className="font-semibold text-red-950">
                Registrar not found
              </p>

              <p className="mt-1 text-sm text-red-800">
                No registrar contract bytecode was found at the configured address.
              </p>
            </div>
          )}

        {!loadingNetwork &&
          networkStatus?.ready && (
            <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm">
              <span>
                Connected to{" "}
                <strong>
                  {
                    networkStatus.networkName
                  }
                </strong>
              </span>

              <span className="font-mono text-xs">
                Chain{" "}
                {
                  networkStatus.chainId
                }
              </span>
            </div>
          )}

        <RoundSection
          account={
            writeAccount
          }
          round={round}
          loading={
            loadingRound
          }
          starting={
            startingRound
          }
          onRefresh={
            refreshRound
          }
          onStartRound={
            handleStartRound
          }
        />

        <DomainSearch
          loading={
            searching
          }
          onSearch={
            handleSearch
          }
        />

        <DomainStatusCard
          domain={domain}
          finalizing={
            finalizing
          }
          onFinalize={
            handleFinalize
          }
          onPhaseExpired={
            handlePhaseExpired
          }
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <BidForm
            domain={domain}
            account={
              writeAccount
            }
            submitting={
              committing
            }
            onCommit={
              handleCommit
            }
          />

          <RevealSection
            commitments={
              commitments
            }
            round={round}
            account={
              writeAccount
            }
            revealingHash={
              revealingHash
            }
            onReveal={
              handleReveal
            }
            onDownloadBackup={
              handleDownloadBackup
            }
            onImportBackup={
              handleImportBackup
            }
          />
        </div>

        <SettlementSection
          account={
            writeAccount
          }
          commitments={
            commitments
          }
          settlingHash={
            settlingHash
          }
          withdrawalCreditEth={
            withdrawalCreditEth
          }
          loadingCredit={
            loadingCredit
          }
          withdrawing={
            withdrawing
          }
          lastSettlement={
            lastSettlement
          }
          lastWithdrawal={
            lastWithdrawal
          }
          onSettle={
            handleSettle
          }
          onRefreshCredit={() =>
            void refreshWithdrawalCredit()
          }
          onWithdraw={
            handleWithdraw
          }
        />

        <ResolutionSection
          domain={domain}
          account={
            writeAccount
          }
          updating={
            updatingResolution
          }
          lastUpdateTxHash={
            lastResolutionTxHash
          }
          onUpdate={
            handleResolutionUpdate
          }
        />

        <PaymentSection
          account={
            writeAccount
          }
          previewing={
            previewingPayment
          }
          sending={
            sending
          }
          preview={
            paymentPreview
          }
          lastPayment={
            lastPayment
          }
          onPreview={
            handlePaymentPreview
          }
          onConfirm={
            handleConfirmPayment
          }
          onClearPreview={
            handleClearPaymentPreview
          }
        />
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-xs text-zinc-500">
        <span className="font-mono text-[#0047AB]">
          .ntu
        </span>{" "}
        Domains · Decentralized naming on Ethereum
      </footer>
    </div>
  )
}