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
} from "./backup"

import {
  checkDomain,
  commitBid,
  connectWallet,
  disconnectWallet,
  finalizeDomain,
  getCurrentRoundState,
  getFriendlyError,
  getWithdrawalCredit,
  revealBid,
  sendPayment,
  setResolutionAddress,
  settleCommitment,
  startAuctionRound,
  withdrawCredit,
  type Commitment,
  type DomainInfo,
  type RoundState,
} from "./handlers"

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
        const saved =
          localStorage.getItem(
            "ntu-commitments"
          )

        if (!saved) {
          return []
        }

        const parsed =
          JSON.parse(
            saved
          )

        if (
          !Array.isArray(
            parsed
          )
        ) {
          return []
        }

        /*
          Older local records may not contain bidWei.

          We keep them loaded so they are not silently
          destroyed, but they will need migration before
          they can be used for a real reveal.
        */

        return parsed
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
      localStorage.setItem(
        "ntu-commitments",
        JSON.stringify(
          commitments
        )
      )
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
        } catch (
          error
        ) {
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
            params
          )

        setCommitments(
          (
            previous
          ) => [
            commitment,
            ...previous,
          ]
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
        const result =
          await revealBid(
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
      if (
        commitments.length ===
        0
      ) {
        alert(
          "No commitments to back up."
        )

        return
      }

      try {
        const backups =
          await Promise.all(
            commitments.map(
              (
                commitment
              ) =>
                createRevealBackup(
                  commitment
                )
            )
          )

        const data =
          JSON.stringify(
            backups,
            null,
            2
          )

        const blob =
          new Blob(
            [
              data,
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
          "ntu-reveal-backup-v1.json"

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

          await verifyRevealBackup(
            backup,
            account
          )

          verified.push(
            backupToCommitment(
              backup
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
                      incoming.bidder.toLowerCase()
                )

              if (
                index >=
                0
              ) {
                /*
                  Preserve any newer UI state such as
                  revealed/settled if already known locally.
                */

                merged[
                  index
                ] = {
                  ...incoming,

                  revealed:
                    merged[
                      index
                    ].revealed,

                  valid:
                    merged[
                      index
                    ].valid,

                  settled:
                    merged[
                      index
                    ].settled,
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

      setSending(
        true
      )

      try {
        const result =
          await sendPayment(
            params
          )

        setLastPayment({
          ...params,

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
        <RoundSection
          account={
            account
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
              account
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
              account
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
            account
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
            account
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
            account
          }
          sending={
            sending
          }
          lastPayment={
            lastPayment
          }
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