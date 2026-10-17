import {
  useEffect,
  useState,
} from "react"

import { Navbar } from "./Navbar"
import { DomainSearch } from "./DomainSearch"
import { DomainStatusCard } from "./DomainStatusCard"
import { BidForm } from "./BidForm"
import { RevealSection } from "./RevealSection"
import { PaymentSection } from "./PaymentSection"

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
  const [account, setAccount] =
    useState<string | null>(null)

  const [connecting, setConnecting] =
    useState(false)

  const [domain, setDomain] =
    useState<DomainInfo | null>(null)

  const [searching, setSearching] =
    useState(false)

  const [committing, setCommitting] =
    useState(false)


/* Reveal recovery: Load any previously saved commitments when the app first opens */
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
        "Failed to load saved commitments:",
        error
      )

      return []
    }
  })

  const [
    revealingHash,
    setRevealingHash,
  ] = useState<string | null>(null)

  const [sending, setSending] =
    useState(false)

  const [
    lastPayment,
    setLastPayment,
  ] = useState<{
    name: string
    amount: string
    resolvedAddress: string
    txHash: string
  } | null>(null)

  /* Metamask Event Listeners */
  useEffect(() => {
    const ethereum =
      window.ethereum as any

    if (!ethereum) {
      return
    }

    const handleAccountsChanged = (
      accounts: string[]
    ) => {
      console.log(
        "Accounts changed:",
        accounts
      )

      if (accounts.length === 0) {
        setAccount(null)
      } else {
        setAccount(
          accounts[0]
        )
      }
    }

    const handleChainChanged = (
      chainId: string
    ) => {
      console.log(
        "Network changed:",
        chainId
      )

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

  /* Save committments */
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

  /* Connect wallet */
  const handleConnect = async () => {
    setConnecting(true)

    try {
      const address =
        await connectWallet()

      console.log(
        "Connected wallet:",
        address
      )

      setAccount(address)
    } catch (error) {
      console.error(
        "Wallet connection failed:",
        error
      )

      alert(
        error instanceof Error
          ? error.message
          : "Failed to connect wallet"
      )
    } finally {
      setConnecting(false)
    }
  }

  /* Disconnect wallet */
  const handleDisconnect =
    async () => {
      await disconnectWallet()

      setAccount(null)
    }

  /* Domain search (mock data) */
  const handleSearch = async (
    name: string
  ) => {
    setSearching(true)

    try {
      const result =
        await checkDomain(name)

      setDomain(result)
    } catch (error) {
      console.error(
        "Domain search failed:",
        error
      )

      alert(
        error instanceof Error
          ? error.message
          : "Failed to search domain"
      )
    } finally {
      setSearching(false)
    }
  }

  /* Commit bid (mock logic) */
  const handleCommit = async (
    params: {
      name: string
      amount: string
      salt: string
    }
  ) => {
    setCommitting(true)

    try {
      const commitment =
        await commitBid(params)

      setCommitments(
        (prev) => [
          commitment,
          ...prev,
        ]
      )
    } catch (error) {
      console.error(
        "Commit failed:",
        error
      )

      alert(
        error instanceof Error
          ? error.message
          : "Failed to commit bid"
      )
    } finally {
      setCommitting(false)
    }
  }

  /*Reveal bid*/
  const handleReveal = async (
    commitment: Commitment
  ) => {
    setRevealingHash(
      commitment.hash
    )

    try {
      await revealBid(
        commitment
      )

      setCommitments(
        (prev) =>
          prev.map((c) =>
            c.hash ===
            commitment.hash
              ? {
                  ...c,
                  revealed: true,
                }
              : c
          )
      )
    } catch (error) {
      console.error(
        "Reveal failed:",
        error
      )

      alert(
        error instanceof Error
          ? error.message
          : "Failed to reveal bid"
      )
    } finally {
      setRevealingHash(null)
    }
  }

  /* Download reveal backup */
  const handleDownloadBackup =
    () => {
      if (
        commitments.length === 0
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
            type: "application/json",
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

      anchor.href = url
      anchor.download =
        "ntu-reveal-backup.json"

      document.body.appendChild(
        anchor
      )

      anchor.click()

      document.body.removeChild(
        anchor
      )

      URL.revokeObjectURL(url)
    }

  /* Import reveal backup */
  const handleImportBackup =
    async (file: File) => {
      try {
        const text =
          await file.text()

        const imported =
          JSON.parse(text)

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
            "Backup file contains invalid commitment data."
          )
        }

        setCommitments(
          imported
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
          error instanceof Error
            ? error.message
            : "Failed to import reveal backup."
        )
      }
    }

  /* Payment (mock logic) */
  const handleSend = async (
    params: {
      name: string
      amount: string
    }
  ) => {
    setSending(true)

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
        error instanceof Error
          ? error.message
          : "Failed to send payment"
      )
    } finally {
      setSending(false)
    }
  }

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
          domain={domain}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <BidForm
            domain={domain}
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
            domain={domain}
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
          account={account}
          sending={sending}
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