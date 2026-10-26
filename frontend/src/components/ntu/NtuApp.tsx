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
    WALLET STATE
    ========================================================
  */

  const [
    account,
    setAccount,
  ] = useState<string | null>(
    null
  )

  const [
    connecting,
    setConnecting,
  ] = useState(false)

  /*
    ========================================================
    ROUND STATE
    ========================================================
  */

  const [
    round,
    setRound,
  ] = useState<RoundState | null>(
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
    DOMAIN STATE
    ========================================================
  */

  const [
    domain,
    setDomain,
  ] = useState<DomainInfo | null>(
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
    SAVED COMMITMENTS / REVEAL RECOVERY
    ========================================================
  */

  const [
    commitments,
    setCommitments,
  ] = useState<Commitment[]>(() => {
    try {
      const saved =
        localStorage.getItem(
          "ntu-commitments"
        )

      return saved
        ? JSON.parse(saved)
        : []
    } catch (error) {
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
  ] = useState<string | null>(
    null
  )

  /*
    ========================================================
    SETTLEMENT / WITHDRAWAL STATE
    ========================================================
  */

  const [
    settlingHash,
    setSettlingHash,
  ] = useState<string | null>(
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
  ] = useState<SettlementResult | null>(
    null
  )

  const [
    lastWithdrawal,
    setLastWithdrawal,
  ] = useState<WithdrawalResult | null>(
    null
  )

  /*
    ========================================================
    RESOLUTION ADDRESS STATE
    ========================================================
  */

  const [
    updatingResolution,
    setUpdatingResolution,
  ] = useState(false)

  const [
    lastResolutionTxHash,
    setLastResolutionTxHash,
  ] = useState<string | null>(
    null
  )

  /*
    ========================================================
    PAYMENT STATE
    ========================================================
  */

  const [
    sending,
    setSending,
  ] = useState(false)

  const [
    lastPayment,
    setLastPayment,
  ] = useState<{
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
      (accounts: string[]) => {
        if (
          accounts.length === 0
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
      }

    const handleChainChanged =
      () => {
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
    SAVE COMMITMENTS TO LOCAL STORAGE
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
    } catch (error) {
      console.error(
        "Failed to save commitments:",
        error
      )
    }
  }, [commitments])

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
        } catch (error) {
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
    Load the current round when the app loads.

    Once the contract is deployed/configured, this will:
    - return null if no round exists
    - otherwise show Commit / Reveal / Ended
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
          "Started auction round:",
          result.roundId
        )

        await refreshRound()

        /*
          If the user already searched a domain,
          refresh it because it may now be in the
          new round's commit phase.
        */

        if (domain) {
          const updated =
            await checkDomain(
              domain.name
            )

          setDomain(
            updated
          )
        }
      } catch (error) {
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
        } catch (error) {
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
      [account]
    )

  /*
    Whenever the connected wallet changes,
    load that wallet's withdrawal credit.
  */

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
    WALLET
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
      } catch (error) {
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
        } catch (error) {
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
        } catch (error) {
          console.error(
            "Failed to refresh domain:",
            error
          )
        }
      },
      [domain]
    )

  /*
    Called when the domain countdown expires.

    Refresh both:
    - the searched domain
    - overall round state
  */

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

      setCommitting(
        true
      )

      try {
        const commitment =
          await commitBid(
            params
          )

        setCommitments(
          (previous) => [
            commitment,
            ...previous,
          ]
        )

        const updated =
          await checkDomain(
            params.name
          )

        setDomain(
          updated
        )

        await refreshRound()
      } catch (error) {
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
        commitment.bidder.toLowerCase() !==
        account.toLowerCase()
      ) {
        alert(
          "Switch to the wallet that created this commitment before revealing."
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
          (previous) =>
            previous.map(
              (current) =>
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
      } catch (error) {
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
      } catch (error) {
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
          (previous) =>
            previous.map(
              (current) =>
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
      } catch (error) {
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
      } catch (error) {
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
      } catch (error) {
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
    BACKUP DOWNLOAD
    ========================================================
  */

  const handleDownloadBackup =
    () => {
      if (
        commitments.length ===
        0
      ) {
        alert(
          "No commitments to back up."
        )

        return
      }

      const data =
        JSON.stringify(
          commitments,
          null,
          2
        )

      const blob =
        new Blob(
          [data],
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
        "ntu-reveal-backup.json"

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
      try {
        const text =
          await file.text()

        const imported =
          JSON.parse(
            text
          )

        if (
          !Array.isArray(
            imported
          )
        ) {
          throw new Error(
            "Invalid backup format."
          )
        }

        const valid =
          imported.every(
            (item) =>
              typeof item.commitmentId ===
                "string" &&
              typeof item.roundId ===
                "string" &&
              typeof item.bidder ===
                "string" &&
              typeof item.name ===
                "string" &&
              typeof item.amount ===
                "string" &&
              typeof item.salt ===
                "string" &&
              typeof item.hash ===
                "string" &&
              typeof item.txHash ===
                "string" &&
              typeof item.createdAt ===
                "number" &&
              typeof item.revealed ===
                "boolean"
          )

        if (!valid) {
          throw new Error(
            "Backup file contains invalid or incomplete commitment data."
          )
        }

        const normalized:
          Commitment[] =
          imported.map(
            (item) => ({
              ...item,

              settled:
                typeof item.settled ===
                "boolean"
                  ? item.settled
                  : false,
            })
          )

        setCommitments(
          normalized
        )

        alert(
          "Reveal backup imported successfully."
        )
      } catch (error) {
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
      } catch (error) {
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