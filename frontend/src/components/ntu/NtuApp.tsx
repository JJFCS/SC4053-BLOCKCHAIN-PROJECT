import {
  useCallback,
  useEffect,
  useState,
} from "react"

import {
  Navbar,
} from "./Navbar"

import {
  RoundSection,
} from "./RoundSection"

import {
  DomainSearch,
} from "./DomainSearch"

import {
  DomainStatusCard,
} from "./DomainStatusCard"

import {
  BidForm,
} from "./BidForm"

import {
  RevealSection,
} from "./RevealSection"

import {
  SettlementSection,
  type SettlementResult,
  type WithdrawalResult,
} from "./SettlementSection"

import {
  ResolutionSection,
} from "./ResolutionSection"

import {
  PaymentSection,
} from "./PaymentSection"

import {
  backupToCommitment,
  createRevealBackup,
  parseRevealBackup,
  verifyRevealBackup,
  type RevealBackupV1,
} from "./backup"

import {
  checkDomain,
  commitBid,
  connectWallet,
  disconnectWallet,
  finalizeDomain,
  getCurrentRoundState,
  getExpectedChainId,
  getFriendlyError,
  getProvider,
  getRegistrarAddress,
  getWithdrawalCredit,
  previewPayment,
  phaseRemainingMs,
  reconcileSubmittedCommitment,
  revealBid,
  sendPayment,
  setResolutionAddress,
  settleCommitment,
  startAuctionRound,
  withdrawCredit,
  type Commitment,
  type DomainInfo,
  type PaymentPreview,
  type RoundState,
} from "./handlers"

function downloadRevealBackups(records: RevealBackupV1[], fileName: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: "application/json" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const commitmentStoragePrefix = "ntu-commitment-v1:"

function commitmentStorageKey(record: Commitment): string | null {
  if (!record.chainId || !record.registrarAddress || !record.bidder || !record.roundId) return null
  return `${commitmentStoragePrefix}${record.chainId}:${record.registrarAddress.toLowerCase()}:${record.bidder.toLowerCase()}:${record.roundId}`
}

function loadStoredCommitments(): Commitment[] {
  const records = new Map<string, Commitment>()
  let legacy: unknown = []
  try {
    legacy = JSON.parse(localStorage.getItem("ntu-commitments") ?? "[]")
  } catch {
    // The old aggregate key may be corrupt; context-specific records remain usable.
  }
  if (Array.isArray(legacy)) {
    for (const record of legacy) {
      if (record && typeof record.hash === "string") records.set(record.hash.toLowerCase(), record)
    }
  }

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith(commitmentStoragePrefix)) continue
    try {
      const record = JSON.parse(localStorage.getItem(key) ?? "null") as Commitment
      if (record && typeof record.hash === "string") records.set(record.hash.toLowerCase(), record)
    } catch {
      // A malformed record must not erase another wallet's saved bids.
    }
  }

  return [...records.values()].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
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
    useState<
      string | null
    >(null)

  const [
    connecting,
    setConnecting,
  ] =
    useState(false)

  const [walletChainId, setWalletChainId] = useState<string | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)

  useEffect(() => {
    const ethereum = window.ethereum
    if (!ethereum) return
    void ethereum.request({ method: "eth_chainId" }).then((value: string) => {
      setWalletChainId(BigInt(value).toString())
    }).catch(() => setWalletChainId(null))
  }, [])

  /*
    ========================================================
    ROUND
    ========================================================
  */

  const [
    round,
    setRound,
  ] =
    useState<
      RoundState | null
    >(null)

  const [
    loadingRound,
    setLoadingRound,
  ] =
    useState(false)

  const [
    startingRound,
    setStartingRound,
  ] =
    useState(false)

  /*
    ========================================================
    DOMAIN
    ========================================================
  */

  const [
    domain,
    setDomain,
  ] =
    useState<
      DomainInfo | null
    >(null)

  const [
    searching,
    setSearching,
  ] =
    useState(false)

  const [
    committing,
    setCommitting,
  ] =
    useState(false)

  const [
    finalizing,
    setFinalizing,
  ] =
    useState(false)

  /*
    ========================================================
    SAVED COMMITMENTS / REVEAL RECOVERY
    ========================================================
  */

  const [
    commitments,
    setCommitments,
  ] =
    useState<
      Commitment[]
    >(() => {
      try {
        return loadStoredCommitments()
      } catch (
        error
      ) {
        console.error(
          "Failed to load commitments:",
          error
        )

        return []
      }
    })

  const [
    revealingHash,
    setRevealingHash,
  ] =
    useState<
      string | null
    >(null)

  /*
    ========================================================
    SETTLEMENT / WITHDRAWAL
    ========================================================
  */

  const [
    settlingHash,
    setSettlingHash,
  ] =
    useState<
      string | null
    >(null)

  const [
    withdrawalCreditEth,
    setWithdrawalCreditEth,
  ] =
    useState("0")

  const [
    loadingCredit,
    setLoadingCredit,
  ] =
    useState(false)

  const [
    withdrawing,
    setWithdrawing,
  ] =
    useState(false)

  const [
    lastSettlement,
    setLastSettlement,
  ] =
    useState<
      SettlementResult | null
    >(null)

  const [
    lastWithdrawal,
    setLastWithdrawal,
  ] =
    useState<
      WithdrawalResult | null
    >(null)

  /*
    ========================================================
    RESOLUTION ADDRESS
    ========================================================
  */

  const [
    updatingResolution,
    setUpdatingResolution,
  ] =
    useState(false)

  const [
    lastResolutionTxHash,
    setLastResolutionTxHash,
  ] =
    useState<
      string | null
    >(null)

  /*
    ========================================================
    PAYMENT
    ========================================================
  */

  const [
    sending,
    setSending,
  ] =
    useState(false)

  const [
    lastPayment,
    setLastPayment,
  ] =
    useState<{
      name: string
      amount: string
      resolvedAddress: string
      txHash: string
    } | null>(null)

  /*
    ========================================================
    METAMASK EVENTS
    ========================================================
  */

  useEffect(() => {
    const ethereum =
      window.ethereum as any

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
          setAccount(
            null
          )
        } else {
          setAccount(
            accounts[0]
          )
        }

        /*
          Wallet-specific UI should refresh
          when the active account changes.
        */

        setLastResolutionTxHash(
          null
        )

        setLastSettlement(
          null
        )

        setLastWithdrawal(
          null
        )
      }

    const handleChainChanged =
      () => {
        /*
          Commitment context includes chain ID,
          so the safest approach is a full reload.
        */

        window.location.reload()
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
  }, [])

  /*
    ========================================================
    SAVE LOCAL COMMITMENT RECORDS
    ========================================================
  */

  useEffect(() => {
    try {
      for (const commitment of commitments) {
        const key = commitmentStorageKey(commitment)
        if (key) localStorage.setItem(key, JSON.stringify(commitment))
      }
      // Retain only legacy records under the old shared key during migration.
      localStorage.setItem("ntu-commitments", JSON.stringify(commitments.filter((record) => !commitmentStorageKey(record))))
    } catch (
      error
    ) {
      console.error(
        "Failed to save commitments:",
        error
      )
    }
  }, [
    commitments,
  ])

  // A reload can interrupt tx.wait(). Keep the preimage and reconcile the
  // saved transaction hash with its receipt and the registrar's own record.
  useEffect(() => {
    let active = true
    let checking = false

    const checkSubmitted = async () => {
      if (checking) return
      checking = true
      try {
        const pending = loadStoredCommitments().filter((record) =>
          record.txHash && !record.commitmentId && !record.submissionFailed
        )
        if (pending.length === 0) return

        const checked = await Promise.all(pending.map(async (record) => {
          try {
            return await reconcileSubmittedCommitment(record)
          } catch {
            // Keep the submitted record while the wallet, RPC, or chain is unavailable.
            return record
          }
        }))
        if (!active) return

        const updates = new Map(checked.filter((record) =>
          record.commitmentId || record.submissionFailed
        ).map((record) => [record.hash, record]))
        if (updates.size === 0) return

        setCommitments((previous) => {
          let changed = false
          const next = previous.map((record) => {
            const update = updates.get(record.hash)
            if (!update || record.commitmentId || record.submissionFailed ||
                record.txHash !== update.txHash) return record
            changed = true
            return { ...record, ...update }
          })
          return changed ? next : previous
        })
      } finally {
        checking = false
      }
    }

    void checkSubmitted()
    const timer = window.setInterval(() => void checkSubmitted(), 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

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
          const current =
            await getCurrentRoundState()

          setRound(
            current
          )

          setNetworkError(null)
        } catch (
          error
        ) {
          setRound(null)
          setNetworkError(getFriendlyError(error))
          console.error(
            "Failed to load round:",
            error
          )
        } finally {
          setLoadingRound(
            false
          )
        }
      },
      []
    )

  /*
    Attempt to load round information when the app starts.

    Until VITE_REGISTRAR_ADDRESS is configured,
    this will simply fail quietly in the console.
  */

  useEffect(() => {
    void refreshRound()
  }, [
    refreshRound,
  ])

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

      setStartingRound(
        true
      )

      try {
        const result =
          await startAuctionRound()

        console.log(
          "Started round:",
          result.roundId
        )

        await refreshRound()

        if (domain) {
          const updated =
            await checkDomain(
              domain.name
            )

          setDomain(
            updated
          )
        }
      } catch (
        error
      ) {
        console.error(
          "Failed to start round:",
          error
        )

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

        if (!target) {
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
        } catch (
          error
        ) {
          console.error(
            "Failed to read withdrawal credit:",
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
      ]
    )

  useEffect(() => {
    if (!account) {
      setWithdrawalCreditEth(
        "0"
      )

      return
    }

    void refreshWithdrawalCredit(
      account
    )
  }, [
    account,
    refreshWithdrawalCredit,
  ])

  /*
    ========================================================
    WALLET CONNECT / DISCONNECT
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
      } catch (
        error
      ) {
        console.error(
          "Wallet connection failed:",
          error
        )

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

      setAccount(
        null
      )

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
        setSearching(
          true
        )

        setLastResolutionTxHash(
          null
        )

        try {
          const result =
            await checkDomain(
              name
            )

          setDomain(
            result
          )
        } catch (
          error
        ) {
          console.error(
            "Domain search failed:",
            error
          )

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
      []
    )

  /*
    ========================================================
    REFRESH CURRENT DOMAIN
    ========================================================
  */

  const refreshCurrentDomain =
    useCallback(
      async () => {
        if (!domain) {
          return
        }

        try {
          const updated =
            await checkDomain(
              domain.name
            )

          setDomain(
            updated
          )
        } catch (
          error
        ) {
          console.error(
            "Failed to refresh domain:",
            error
          )
        }
      },
      [
        domain,
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
    COMMIT BID
    ========================================================

    handlers.ts now:

    - canonicalises the label
    - parses amount to exact bidWei
    - checks maximum deposit
    - generates commitment locally
    - calls commitBid()
    - returns exact bidWei for recovery
  */

  const persistCommitment = (incoming: Commitment) => {
    const saved = loadStoredCommitments()

    const next = [incoming, ...saved.filter((existing) =>
      existing.hash !== incoming.hash &&
      !(existing.bidder.toLowerCase() === incoming.bidder.toLowerCase() &&
        existing.roundId === incoming.roundId &&
        existing.chainId === incoming.chainId &&
        existing.registrarAddress?.toLowerCase() === incoming.registrarAddress?.toLowerCase() &&
        !existing.commitmentId)
    )]

    // Write synchronously before invoking MetaMask; React's effect is too late.
    const key = commitmentStorageKey(incoming)
    if (!key) throw new Error("The bid is missing its chain or registrar context.")
    localStorage.setItem(key, JSON.stringify(incoming))
    setCommitments(next)
  }

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

      setCommitting(
        true
      )

      try {
        const commitment =
          await commitBid(
            params,
            {
              onPrepared: async (prepared) => {
                persistCommitment(prepared)
                const backup = await createRevealBackup(prepared)
                downloadRevealBackups([backup], `ntu-reveal-backup-v1-round-${prepared.roundId}.json`)
                if (!window.confirm("Save the downloaded reveal backup before submitting the 0.1 ETH deposit. Confirm to request the MetaMask transaction.")) {
                  throw new Error("Commit was not submitted. The prepared bid and backup remain saved.")
                }
              },
              onSubmitted: (submitted) => persistCommitment(submitted),
            }
          )

        persistCommitment(commitment)

        const updated =
          await checkDomain(
            commitment.name
          )

        setDomain(
          updated
        )

        await refreshRound()
      } catch (
        error
      ) {
        console.error(
          "Commit failed:",
          error
        )

        alert(
          getFriendlyError(
            error
          )
        )
      } finally {
        setCommitting(
          false
        )
      }
    }

  /*
    ========================================================
    REVEAL BID
    ========================================================

    revealBid() now uses commitment.bidWei directly
    instead of converting the display amount again.
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
        commitment.bidder.toLowerCase() !==
        account.toLowerCase()
      ) {
        alert(
          "Switch to the wallet that created this commitment before revealing."
        )

        return
      }

      if (
        !commitment.bidWei
      ) {
        alert(
          "This saved commitment does not contain the exact bidWei value required for reveal. Import a valid versioned backup."
        )

        return
      }

      setRevealingHash(
        commitment.hash
      )

      try {
        const backup = await createRevealBackup(commitment)
        const verified = await verifyRevealBackup(
          backup,
          account
        )
        const recovered = {
          ...commitment,
          chainId: backup.chainId,
          registrarAddress: backup.registrarAddress,
          commitmentId: verified.commitmentId,
          createdAt: verified.committedAt ?? commitment.createdAt,
          revealed: verified.revealed,
          valid: verified.valid,
          settled: verified.settled,
        }
        persistCommitment(recovered)
        if (verified.revealed || verified.settled) {
          throw new Error("This commitment has already been revealed or settled.")
        }

        const currentDomain = await checkDomain(commitment.name)
        setDomain(currentDomain)
        if (currentDomain.status !== "reveal" ||
            phaseRemainingMs(currentDomain.phaseEndsAt, currentDomain.chainClock) === 0) {
          await refreshRound()
          throw new Error("The reveal window has elapsed; this bid can no longer be revealed.")
        }

        const result =
          await revealBid(
            recovered
          )

        setCommitments(
          (
            previous
          ) =>
            previous.map(
              (
                current
              ) =>
                current.hash ===
                commitment.hash
                  ? {
                      ...current,

                      revealed:
                        true,

                      valid:
                        result.valid,
                    }
                  : current
            )
        )

        const updated =
          await checkDomain(
            commitment.name
          )

        setDomain(
          updated
        )

        await refreshRound()
      } catch (
        error
      ) {
        console.error(
          "Reveal failed:",
          error
        )

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
    FINALIZE DOMAIN
    ========================================================
  */

  const handleFinalize =
    async (
      name: string
    ) => {
      if (!account) {
        alert(
          "Connect your wallet before finalizing the domain."
        )

        return
      }

      setFinalizing(
        true
      )

      try {
        await finalizeDomain(
          name
        )

        const updated =
          await checkDomain(
            name
          )

        setDomain(
          updated
        )

        await refreshRound()
      } catch (
        error
      ) {
        console.error(
          "Finalization failed:",
          error
        )

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

      setLastSettlement(
        null
      )

      try {
        const result =
          await settleCommitment(
            commitment
          )

        setCommitments(
          (
            previous
          ) =>
            previous.map(
              (
                current
              ) =>
                current.hash ===
                commitment.hash
                  ? {
                      ...current,

                      settled:
                        true,
                    }
                  : current
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

        await refreshRound()
      } catch (
        error
      ) {
        console.error(
          "Settlement failed:",
          error
        )

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
    WITHDRAW CREDIT
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

      setWithdrawing(
        true
      )

      setLastWithdrawal(
        null
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
      } catch (
        error
      ) {
        console.error(
          "Withdrawal failed:",
          error
        )

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
    UPDATE RESOLUTION ADDRESS
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
        !domain?.owner ||
        account.toLowerCase() !==
          domain.owner.toLowerCase()
      ) {
        alert(
          "Only the domain owner can change its resolution address."
        )

        return
      }

      setUpdatingResolution(
        true
      )

      setLastResolutionTxHash(
        null
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

        const updated =
          await checkDomain(
            name
          )

        setDomain(
          updated
        )
      } catch (
        error
      ) {
        console.error(
          "Resolution update failed:",
          error
        )

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
    VERSIONED BACKUP EXPORT
    ========================================================

    We no longer dump the internal Commitment objects
    directly to JSON.

    Each record becomes RevealBackupV1.
  */

  const handleDownloadBackup =
    async () => {
      if (!account) {
        alert(
          "Connect the wallet whose commitments you want to back up."
        )
        return
      }

      try {
        const chainId = (await getProvider().getNetwork()).chainId.toString()
        if (chainId !== getExpectedChainId().toString()) {
          throw new Error(`Switch the site's MetaMask network to chain ${getExpectedChainId()} before exporting a backup.`)
        }

        const registrar = getRegistrarAddress().toLowerCase()
        const walletCommitments = commitments.filter((commitment) =>
          commitment.bidder.toLowerCase() === account.toLowerCase() &&
          (!commitment.chainId || commitment.chainId === chainId) &&
          (!commitment.registrarAddress || commitment.registrarAddress.toLowerCase() === registrar)
        )
        if (walletCommitments.length === 0) {
          throw new Error("No commitments for this wallet and deployment to back up.")
        }

        const backups =
          await Promise.all(
            walletCommitments.map(
              (
                commitment
              ) =>
                createRevealBackup(
                  commitment
                )
            )
          )

        // Old records without stored context are accepted only when the chain
        // confirms their digest. Prepared records have not yet been submitted.
        for (let index = 0; index < backups.length; index++) {
          if (walletCommitments[index].commitmentId || walletCommitments[index].txHash) {
            await verifyRevealBackup(backups[index], account)
          }
        }

        downloadRevealBackups(backups, "ntu-reveal-backup-v1.json")
      } catch (
        error
      ) {
        console.error(
          "Backup export failed:",
          error
        )

        alert(
          getFriendlyError(
            error
          )
        )
      }
    }

  /*
    ========================================================
    VERSIONED + VERIFIED BACKUP IMPORT
    ========================================================

    Import process:

    1. JSON schema validation
    2. chain check
    3. registrar check
    4. wallet check
    5. recompute commitment
    6. verify actual on-chain commitment
    7. ONLY THEN update local state

    If any record fails, no existing saved data is replaced.
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
        const text =
          await file.text()

        const parsed =
          JSON.parse(
            text
          )

        const records =
          Array.isArray(
            parsed
          )
            ? parsed
            : [
                parsed,
              ]

        const verified:
          Commitment[] = []

        for (
          const raw of records
        ) {
          const backup =
            parseRevealBackup(
              raw
            )

          const verifiedOnChain = await verifyRevealBackup(
            backup,
            account
          )

          verified.push(
            backupToCommitment(
              backup,
              verifiedOnChain
            )
          )
        }

        /*
          Only mutate React state once all records have
          successfully passed verification.
        */

        setCommitments(
          (
            previous
          ) => {
            const merged =
              [
                ...previous,
              ]

            for (
              const incoming of verified
            ) {
              const index =
                merged.findIndex(
                  (
                    existing
                  ) =>
                    existing.roundId ===
                      incoming.roundId &&
                    existing.bidder.toLowerCase() ===
                      incoming.bidder.toLowerCase() &&
                    existing.hash.toLowerCase() === incoming.hash.toLowerCase()
                )

              if (
                index >=
                0
              ) {
                const existing = merged[index]
                merged[
                  index
                ] = {
                  ...incoming,
                  txHash:
                    incoming.txHash || existing.txHash,
                  createdAt:
                    incoming.createdAt || existing.createdAt,
                }
              } else {
                merged.unshift(
                  incoming
                )
              }
            }

            return merged
          }
        )

        alert(
          "Reveal backup verified and imported successfully."
        )
      } catch (
        error
      ) {
        console.error(
          "Backup import failed:",
          error
        )

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

  const handleSend =
    async (
      preview: PaymentPreview
    ) => {
      if (!account) {
        alert(
          "Connect your wallet before sending ETH."
        )

        return
      }

      setSending(
        true
      )

      try {
        const result =
          await sendPayment(
            preview
          )

        setLastPayment({
          name: preview.name,
          amount: preview.amount,

          ...result,
        })
      } catch (
        error
      ) {
        console.error(
          "Payment failed:",
          error
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

  /*
    ========================================================
    UI
    ========================================================
  */

  const actionAccount = networkError ? null : account
  const networkLabel = walletChainId === "31337"
    ? "Hardhat Local"
    : walletChainId === "11155111"
      ? "Sepolia"
      : walletChainId
        ? `Chain ${walletChainId}`
        : "Wallet network"

  return (
    <div className="relative min-h-screen bg-zinc-50 text-zinc-900">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(0,71,171,0.08),transparent_65%)]"
      />

      <Navbar
        account={
          account
        }
        networkLabel={networkLabel}
        connecting={
          connecting
        }
        onConnect={
          handleConnect
        }
        onDisconnect={
          handleDisconnect
        }
      />

      <main className="relative mx-auto flex max-w-6xl flex-col gap-10 px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
        {networkError && (
          <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            {networkError}
          </div>
        )}
        <RoundSection
          account={
            actionAccount
          }
          round={
            round
          }
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
          domain={
            domain
          }
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
            domain={
              domain
            }
            account={
              actionAccount
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
            domain={
              domain
            }
            account={
              actionAccount
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
            actionAccount
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
          domain={
            domain
          }
          account={
            actionAccount
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
          key={account ?? "no-wallet"}
          account={
            actionAccount
          }
          sending={
            sending
          }
          lastPayment={
            lastPayment
          }
          onPreview={previewPayment}
          onSend={
            handleSend
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
