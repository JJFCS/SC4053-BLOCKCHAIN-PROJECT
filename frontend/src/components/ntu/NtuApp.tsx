import {
  useEffect,
  useState,
  useCallback,
} from "react"

import {
  Navbar,
} from "./Navbar"

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
  PaymentSection,
} from "./PaymentSection"

import {
  checkDomain,
  commitBid,
  connectWallet,
  disconnectWallet,
  revealBid,
  sendPayment,
  type Commitment,
  type DomainInfo,
} from "./handlers"

export default function NtuApp() {
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

  /*
    Load reveal recovery data.
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

        return saved
          ? JSON.parse(
              saved
            )
          : []
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
    SAVE REVEAL DATA
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
      } catch (
        error
      ) {
        console.error(
          error
        )

        alert(
          error instanceof
            Error
            ? error.message
            : "Failed to connect wallet"
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
            error instanceof
              Error
              ? error.message
              : "Failed to search domain"
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
    Called automatically when the
    commit/reveal countdown reaches zero.
  */

  const handlePhaseExpired =
    useCallback(
      async () => {
        if (
          !domain
        ) {
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
            "Failed to refresh auction phase:",
            error
          )
        }
      },
      [domain]
    )

  /*
    ========================================================
    COMMIT BID
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
      if (
        !account
      ) {
        alert(
          "Connect your wallet before committing a bid."
        )

        return
      }

      /*
        Frontend duplicate safeguard.
      */

      const existing =
        commitments.find(
          (
            commitment
          ) =>
            commitment.name.toLowerCase() ===
              params.name.toLowerCase() &&
            commitment.bidder?.toLowerCase() ===
              account.toLowerCase() &&
            !commitment.revealed
        )

      if (
        existing
      ) {
        alert(
          `You already have an active commitment for ${params.name}.ntu with this wallet.`
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

        /*
          Refresh domain state after
          successful commit.
        */

        const updated =
          await checkDomain(
            params.name
          )

        setDomain(
          updated
        )
      } catch (
        error
      ) {
        console.error(
          "Commit failed:",
          error
        )

        alert(
          error instanceof
            Error
            ? error.message
            : "Failed to commit bid"
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
  */

  const handleReveal =
    async (
      commitment:
        Commitment
    ) => {
      if (
        !account
      ) {
        alert(
          "Connect your wallet before revealing."
        )

        return
      }

      if (
        commitment.bidder &&
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

        /*
          Refresh domain auction info,
          because the highest bid may
          have changed after reveal.
        */

        const updated =
          await checkDomain(
            commitment.name
          )

        setDomain(
          updated
        )
      } catch (
        error
      ) {
        console.error(
          "Reveal failed:",
          error
        )

        alert(
          error instanceof
            Error
            ? error.message
            : "Failed to reveal bid"
        )
      } finally {
        setRevealingHash(
          null
        )
      }
    }

  /*
    ========================================================
    DOWNLOAD BACKUP
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
    IMPORT BACKUP
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
            (
              item
            ) =>
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

        if (
          !valid
        ) {
          throw new Error(
            "Backup file contains invalid commitment data."
          )
        }

        setCommitments(
          imported
        )

        alert(
          "Reveal backup imported successfully."
        )
      } catch (
        error
      ) {
        console.error(
          error
        )

        alert(
          error instanceof
            Error
            ? error.message
            : "Failed to import reveal backup."
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
      if (
        !account
      ) {
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
          error instanceof
            Error
            ? error.message
            : "Failed to send payment"
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