import { BrowserProvider } from "ethers"

declare global {
  interface Window {
    ethereum?: unknown
  }
}

export type DomainStatus = "available" | "commit" | "reveal" | "registered"

export interface DomainInfo {
  name: string
  status: DomainStatus
  phaseEndsAt?: number
  owner?: string
  highestBid?: string
  bidCount?: number
}

export interface Commitment {
  name: string
  amount: string
  salt: string
  hash: string
  txHash: string
  createdAt: number
  revealed: boolean
}

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms))

const randomHex = (bytes: number) =>
  "0x" +
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")

export function generateSalt(): string {
  return randomHex(32)
}

/* Real wallet connection */
export async function connectWallet(): Promise<string> {
  if (!window.ethereum) {
    throw new Error(
      "MetaMask is not installed. Please install MetaMask first."
    )
  }

  const provider = new BrowserProvider(
    window.ethereum as any
  )

  await provider.send("eth_requestAccounts", [])

  const signer = await provider.getSigner()

  const address = await signer.getAddress()

  return address
}


export async function disconnectWallet(): Promise<void> {
  return
}

/* Mock domain search */
export async function checkDomain(
  name: string
): Promise<DomainInfo> {
  // TODO:
  // Read auction / registry state from the actual smart contract

  await delay(500)

  const statuses: DomainStatus[] = [
    "available",
    "commit",
    "reveal",
    "registered",
  ]

  const score = [...name].reduce(
    (acc, ch) => acc + ch.charCodeAt(0),
    0
  )

  const status =
    statuses[score % statuses.length]

  const now = Date.now()

  switch (status) {
    case "commit":
      return {
        name,
        status,
        phaseEndsAt:
          now + 1000 * 60 * 60 * 18,
        bidCount: (score % 7) + 1,
      }

    case "reveal":
      return {
        name,
        status,
        phaseEndsAt:
          now + 1000 * 60 * 60 * 6,
        bidCount: (score % 7) + 2,
        highestBid: "0.42",
      }

    case "registered":
      return {
        name,
        status,
        owner: randomHex(20),
        highestBid: "1.15",
      }

    default:
      return {
        name,
        status,
      }
  }
}

/*
  MOCK COMMIT BID
  ---------------

  Later this will:

  1. Convert ETH → Wei
  2. Compute commitment hash
  3. Call smart contract
  4. Ask MetaMask to sign
  5. Save reveal information
*/
export async function commitBid(params: {
  name: string
  amount: string
  salt: string
}): Promise<Commitment> {
  /*
    TODO eventually something like:

    const commitment = keccak256(...)

    const tx = await contract.commitBid(
      commitment,
      { value: deposit }
    )

    await tx.wait()
  */

  await delay(900)

  return {
    ...params,
    hash: randomHex(32),
    txHash: randomHex(32),
    createdAt: Date.now(),
    revealed: false,
  }
}

/*
  MOCK REVEAL BID
  ---------------

  Later this will call the actual reveal function
  in your teammate's Solidity contract.
*/
export async function revealBid(
  commitment: Commitment
): Promise<{ txHash: string }> {
  /*
    TODO eventually something like:

    const tx = await contract.revealBid(
      commitment.name,
      parseEther(commitment.amount),
      commitment.salt
    )

    await tx.wait()

    return {
      txHash: tx.hash
    }
  */

  await delay(900)

  return {
    txHash: randomHex(32),
  }
}

/*
  MOCK PAYMENT
  ------------

  Later:

  .ntu name
      ↓
  registry.resolve()
      ↓
  Ethereum address
      ↓
  signer.sendTransaction()
*/
export async function sendPayment(params: {
  name: string
  amount: string
}): Promise<{
  resolvedAddress: string
  txHash: string
}> {
  /*
    TODO eventually:

    const resolvedAddress =
      await contract.resolve(params.name)

    const provider =
      new BrowserProvider(window.ethereum)

    const signer =
      await provider.getSigner()

    const tx =
      await signer.sendTransaction({
        to: resolvedAddress,
        value: parseEther(params.amount)
      })

    await tx.wait()

    return {
      resolvedAddress,
      txHash: tx.hash
    }
  */

  await delay(900)

  return {
    resolvedAddress: randomHex(20),
    txHash: randomHex(32),
  }
}

/*
  DISPLAY HELPERS
*/

export function shortenHex(
  value: string,
  chars = 4
): string {
  if (value.length <= chars * 2 + 2) {
    return value
  }

  return `${value.slice(
    0,
    chars + 2
  )}…${value.slice(-chars)}`
}

export function formatTimeLeft(
  timestamp?: number
): string {
  if (!timestamp) return "—"

  const diff = Math.max(
    0,
    timestamp - Date.now()
  )

  const hours = Math.floor(
    diff / 3_600_000
  )

  const minutes = Math.floor(
    (diff % 3_600_000) / 60_000
  )

  return `${hours}h ${minutes}m`
}

export function sanitizeLabel(
  value: string
): string {
  return value
    .toLowerCase()
    .replace(/\.ntu$/, "")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 63)
}