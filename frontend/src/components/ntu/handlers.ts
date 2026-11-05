import {
  AbiCoder,
  BrowserProvider,
  Contract,
  ZeroAddress,
  formatEther,
  isAddress,
  keccak256,
  parseEther,
} from "ethers"

interface MetaMaskProvider {
  request(args: {
    method: string
    params?: unknown[] | Record<string, unknown>
  }): Promise<unknown>

  on(
    event: "accountsChanged",
    listener: (accounts: string[]) => void
  ): void

  on(
    event: "chainChanged",
    listener: (chainId: string) => void
  ): void

  removeListener(
    event: "accountsChanged",
    listener: (accounts: string[]) => void
  ): void

  removeListener(
    event: "chainChanged",
    listener: (chainId: string) => void
  ): void
}

declare global {
  interface Window {
    ethereum?: MetaMaskProvider
  }
}

/*
  ============================================================
  CONFIGURATION
  ============================================================
*/

const REGISTRAR_ADDRESS =
  import.meta.env.VITE_REGISTRAR_ADDRESS as
    | string
    | undefined

const CONFIGURED_CHAIN_ID =
  import.meta.env.VITE_CHAIN_ID as
    | string
    | undefined

/*
  ============================================================
  CONTRACT ABI
  ============================================================
*/

const REGISTRAR_ABI = [
  "function startRound() returns (uint256 roundId)",
  "function getCurrentRound() view returns (uint256)",
  "function getRound(uint256 roundId) view returns (tuple(uint256 startTime, uint256 commitEnd, uint256 revealEnd, uint8 phase, uint256 pendingDomainCount, uint256 deposit, uint256 nonRevealPenalty, address treasury))",

  "function COMMIT_DEPOSIT() view returns (uint256)",
  "function NON_REVEAL_PENALTY() view returns (uint256)",

  "function commitBid(uint256 roundId, bytes32 digest) payable",
  "function revealBid(uint256 roundId, string label, uint256 bidWei, bytes32 salt)",

  "function getCommitment(uint256 commitmentId) view returns (tuple(address bidder, bytes32 digest, uint256 roundId, uint256 deposit, bool revealed, bool valid, bytes32 labelHash, uint256 bidWei, bool settled))",
  "function getCommitmentId(uint256 roundId, address bidder) view returns (uint256)",
  "function getCommitmentForRound(uint256 roundId, address bidder) view returns (tuple(address bidder, bytes32 digest, uint256 roundId, uint256 deposit, bool revealed, bool valid, bytes32 labelHash, uint256 bidWei, bool settled))",

  "function getAuction(string label) view returns (tuple(uint256 roundId, uint256 winningCommitmentId, address highestBidder, uint256 highestBidWei, bool finalized))",
  "function getAuctionForRound(uint256 roundId, string label) view returns (tuple(uint256 roundId, uint256 winningCommitmentId, address highestBidder, uint256 highestBidWei, bool finalized))",
  "function reservedRound(string label) view returns (uint256)",

  "function finalizeName(string label) returns (address owner)",
  "function finalizeDomain(uint256 roundId, string label) returns (address owner)",

  "function getDomain(string label) view returns (tuple(address owner, uint256 roundId, uint256 winningCommitmentId, uint256 priceWei, address resolutionAddress))",
  "function ownerOf(string label) view returns (address)",
  "function resolve(string label) view returns (address)",
  "function setAddress(string label, address target)",

  "function settleBid(uint256 roundId)",
  "function settleCommit(uint256 commitmentId) returns (uint256 refundWei, uint256 proceedsWei)",
  "function withdrawalCredits(address account) view returns (uint256)",
  "function withdraw()",

  "function sendToDomain(string label, address expectedRecipient) payable",

  "event RoundStarted(uint256 indexed roundId, address indexed starter, uint256 startTime, uint256 commitEnd, uint256 revealEnd)",
  "event CommitmentSubmitted(uint256 indexed commitmentId, uint256 indexed roundId, address indexed bidder, bytes32 digest)",
  "event CommitmentRevealed(uint256 indexed commitmentId, uint256 indexed roundId, address indexed bidder, string label, uint256 bidWei, bool valid)",
  "event DomainFinalized(bytes32 indexed labelHash, uint256 indexed roundId, address indexed owner, string label, uint256 winningCommitmentId, uint256 priceWei)",
  "event CommitmentSettled(uint256 indexed commitmentId, uint256 indexed roundId, address indexed bidder, uint256 refundWei, uint256 proceedsWei)",
  "event Withdrawn(address indexed account, uint256 amountWei)",
  "event AddressUpdated(bytes32 indexed labelHash, address indexed owner, address indexed target, string label)",
  "event DomainPayment(bytes32 indexed labelHash, address indexed sender, address indexed recipient, string label, uint256 amountWei)",
]

/*
  ============================================================
  TYPES
  ============================================================
*/

export type DomainStatus =
  | "available"
  | "commit"
  | "reveal"
  | "ended"
  | "registered"

export type RoundPhase =
  | "not-started"
  | "commit"
  | "reveal"
  | "ended"

export interface ChainClock {
  chainTimestampMs: number
  capturedAtMs: number
}

export type CommitmentSubmissionStatus =
  | "prepared"
  | "pending"
  | "confirmed"
  | "rejected"
  | "failed"

export interface DomainInfo {
  name: string
  status: DomainStatus
  roundId?: string
  phaseEndsAt?: number
  chainClock?: ChainClock
  owner?: string
  resolutionAddress?: string
  highestBid?: string
  highestBidder?: string
  winningCommitmentId?: string
  priceWei?: string
  finalized?: boolean
  reservedRoundId?: string
}

export interface Commitment {
  commitmentId?: string

  chainId?: string
  registrarAddress?: string

  roundId: string
  bidder: string
  name: string

  amount: string
  bidWei: string

  salt: string
  hash: string

  txHash: string

  createdAt: number

  submissionStatus?: CommitmentSubmissionStatus
  submissionError?: string

  revealed: boolean
  valid?: boolean
  settled?: boolean
}

export interface RoundState {
  roundId: string
  startTime: number
  commitEnd: number
  revealEnd: number
  phase: RoundPhase
  phaseEndsAt?: number
  chainClock?: ChainClock
  pendingDomainCount: string
  deposit: string
  nonRevealPenalty: string
  treasury: string
}

export interface NetworkStatus {
  chainId: string
  networkName: string
  expectedChainId: string
  expectedNetworkName: string
  correctNetwork: boolean
  registrarConfigured: boolean
  registrarExists: boolean
  ready: boolean
}

export interface PaymentPreview {
  name: string
  amount: string
  amountWei: string
  recipient: string
  chainId: string
  networkName: string
  createdAt: number
}

/*
  ============================================================
  LABEL HELPERS
  ============================================================
*/

export function normalizeLabel(
  value: string
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.ntu$/, "")
}

export function sanitizeLabel(
  value: string
): string {
  return normalizeLabel(value)
}

export function validateLabel(
  value: string
): {
  valid: boolean
  error?: string
} {
  const label =
    normalizeLabel(value)

  const byteLength =
    new TextEncoder().encode(
      label
    ).length

  if (byteLength < 3) {
    return {
      valid: false,
      error:
        "Domain names must be at least 3 characters long.",
    }
  }

  if (byteLength > 32) {
    return {
      valid: false,
      error:
        "Domain names cannot exceed 32 characters.",
    }
  }

  if (
    label.startsWith("-") ||
    label.endsWith("-")
  ) {
    return {
      valid: false,
      error:
        "Domain names cannot start or end with a hyphen.",
    }
  }

  if (
    !/^[a-z0-9-]+$/.test(label)
  ) {
    return {
      valid: false,
      error:
        "Use lowercase letters, numbers and hyphens only.",
    }
  }

  return {
    valid: true,
  }
}

/*
  ============================================================
  SALT
  ============================================================
*/

export function generateSalt(): string {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(32)
    )

  return (
    "0x" +
    Array.from(bytes)
      .map((byte) =>
        byte
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  )
}

/*
  ============================================================
  CONFIG / METAMASK
  ============================================================
*/

function requireMetaMask() {
  if (!window.ethereum) {
    throw new Error(
      "MetaMask is not installed. Please install MetaMask first."
    )
  }

  return window.ethereum
}

export function getRegistrarAddress():
string {
  if (!REGISTRAR_ADDRESS) {
    throw new Error(
      "Registrar contract has not been deployed/configured yet."
    )
  }

  return REGISTRAR_ADDRESS
}

export function getConfiguredChainId():
bigint {
  if (!CONFIGURED_CHAIN_ID) {
    throw new Error(
      "Frontend network has not been configured."
    )
  }

  try {
    return BigInt(
      CONFIGURED_CHAIN_ID
    )
  } catch {
    throw new Error(
      "VITE_CHAIN_ID is invalid."
    )
  }
}

/*
  ============================================================
  NETWORK
  ============================================================
*/

function getNetworkName(
  chainId: bigint,
  providerName?: string
): string {
  if (chainId === 1n) {
    return "Ethereum Mainnet"
  }

  if (chainId === 11155111n) {
    return "Sepolia"
  }

  if (chainId === 17000n) {
    return "Holesky"
  }

  if (chainId === 31337n) {
    return "Hardhat Local"
  }

  if (
    providerName &&
    providerName !== "unknown"
  ) {
    return providerName
  }

  return `Chain ${chainId.toString()}`
}

export function getConfiguredNetworkName():
string {
  return getNetworkName(
    getConfiguredChainId()
  )
}

export function getProvider() {
  return new BrowserProvider(
    requireMetaMask()
  )
}

export async function getNetworkStatus():
Promise<NetworkStatus> {
  const provider =
    getProvider()

  const network =
    await provider.getNetwork()

  const expectedChainId =
    getConfiguredChainId()

  const correctNetwork =
    network.chainId ===
    expectedChainId

  const registrarConfigured =
    Boolean(REGISTRAR_ADDRESS)

  let registrarExists =
    false

  if (
    correctNetwork &&
    registrarConfigured
  ) {
    try {
      const code =
        await provider.getCode(
          getRegistrarAddress()
        )

      registrarExists =
        code !== "0x"
    } catch {
      registrarExists =
        false
    }
  }

  return {
    chainId:
      network.chainId.toString(),

    networkName:
      getNetworkName(
        network.chainId,
        network.name
      ),

    expectedChainId:
      expectedChainId.toString(),

    expectedNetworkName:
      getNetworkName(
        expectedChainId
      ),

    correctNetwork,
    registrarConfigured,
    registrarExists,

    ready:
      correctNetwork &&
      registrarConfigured &&
      registrarExists,
  }
}

export async function switchToConfiguredNetwork():
Promise<void> {
  const ethereum =
    requireMetaMask()

  const chainId =
    getConfiguredChainId()

  try {
    await ethereum.request({
      method:
        "wallet_switchEthereumChain",

      params: [
        {
          chainId:
            `0x${chainId.toString(
              16
            )}`,
        },
      ],
    })
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error
        ? (error as { code?: unknown }).code
        : undefined

    if (code === 4902) {
      throw new Error(
        `${getConfiguredNetworkName()} is not available in MetaMask. Enable the network in MetaMask and try again.`,
        { cause: error }
      )
    }

    throw error
  }
}

async function requireReadyNetwork():
Promise<void> {
  const status =
    await getNetworkStatus()

  if (!status.correctNetwork) {
    throw new Error(
      `Wrong network. MetaMask is connected to ${status.networkName}. Switch to ${status.expectedNetworkName} before continuing.`
    )
  }

  if (!status.registrarConfigured) {
    throw new Error(
      "Registrar contract has not been configured."
    )
  }

  if (!status.registrarExists) {
    throw new Error(
      "No registrar contract was found at the configured address on this network."
    )
  }
}

/*
  ============================================================
  FRIENDLY ERRORS
  ============================================================
*/

export function getFriendlyError(
  error: unknown
): string {
  const raw =
    error instanceof Error
      ? error.message
      : String(error)

  const messages:
    Record<string, string> = {
      "WRONG ROUND":
        "This auction round is no longer the current round.",

      "ROUND NOT ENDED":
        "The auction round has not ended yet.",

      "NOT COMMIT PHASE":
        "Bids can only be committed during the commit phase.",

      "NOT REVEAL PHASE":
        "Bids can only be revealed during the reveal phase.",

      "INCORRECT DEPOSIT":
        "The transaction used the wrong commitment deposit.",

      "EMPTY COMMITMENT":
        "The commitment hash cannot be empty.",

      "ALREADY COMMITTED":
        "This wallet has already committed a bid in this round.",

      "NO COMMITMENT":
        "No commitment was found for this wallet in this round.",

      "INVALID COMMITMENT":
        "The commitment could not be found.",

      "NOT BIDDER":
        "Only the wallet that created this commitment can perform this action.",

      "ALREADY REVEALED":
        "This commitment has already been revealed.",

      "INVALID LABEL":
        "This .ntu name is invalid.",

      "INVALID BID":
        "The revealed bid is outside the allowed range.",

      "ALREADY REGISTERED":
        "This .ntu name has already been registered.",

      "NAME RESERVED":
        "This .ntu name is reserved by another auction round.",

      "COMMITMENT MISMATCH":
        "The name, bid, salt or context does not match the original commitment.",

      "NO WINNING BID":
        "There is no winning bid for this name.",

      "ALREADY FINALIZED":
        "This domain has already been finalized.",

      "WRONG RESERVATION":
        "This name belongs to a different auction round.",

      "DOMAIN NOT FINALIZED":
        "This domain must be finalized before this revealed bid can be settled.",

      "ALREADY SETTLED":
        "This commitment has already been settled.",

      "NO CREDIT":
        "There is no ETH available to withdraw.",

      "NOT OWNER":
        "Only the domain owner can change its resolution address.",

      "UNREGISTERED NAME":
        "This .ntu name has not been registered.",

      "ZERO ADDRESS":
        "The zero address cannot be used here.",

      "INVALID TARGET":
        "This address cannot be used as the resolution target.",

      "ZERO PAYMENT":
        "Payment amount must be greater than zero.",

      "RECIPIENT CHANGED":
        "The domain's resolution address changed before the payment was confirmed. Please review the new recipient before trying again.",

      "ETH TRANSFER FAILED":
        "The ETH transfer failed.",
    }

  for (
    const [
      code,
      friendly,
    ] of Object.entries(messages)
  ) {
    if (raw.includes(code)) {
      return friendly
    }
  }

  const lower =
    raw.toLowerCase()

  if (
    lower.includes(
      "user rejected"
    ) ||
    lower.includes(
      "user denied"
    ) ||
    lower.includes(
      "action_rejected"
    )
  ) {
    return "The MetaMask request was cancelled."
  }

  return raw
}

/*
  ============================================================
  CONTRACT HELPERS
  ============================================================
*/

async function getReadContract() {
  await requireReadyNetwork()

  return new Contract(
    getRegistrarAddress(),
    REGISTRAR_ABI,
    getProvider()
  )
}

const clockStorageKey = "ntu-chain-clock-v1"
let observedClock: { blockKey: string; clock: ChainClock } | null = null

async function readChainClock(): Promise<ChainClock> {
  const block = await getProvider().getBlock("latest")
  if (!block) throw new Error("Could not read the latest chain timestamp.")

  const blockKey = `${getConfiguredChainId()}:${block.hash ?? block.number}`
  if (observedClock?.blockKey === blockKey &&
      observedClock.clock.chainTimestampMs === block.timestamp * 1000) return observedClock.clock

  try {
    const saved = JSON.parse(sessionStorage.getItem(clockStorageKey) ?? "null")
    if (saved?.blockKey === blockKey &&
        saved.clock?.chainTimestampMs === block.timestamp * 1000 &&
        Number.isFinite(saved.clock.capturedAtMs)) {
      observedClock = saved
      return saved.clock
    }
  } catch {
    // Session storage may be unavailable; contract reads still work.
  }

  const clock = { chainTimestampMs: block.timestamp * 1000, capturedAtMs: Date.now() }
  observedClock = { blockKey, clock }
  try {
    sessionStorage.setItem(clockStorageKey, JSON.stringify(observedClock))
  } catch {
    // Keep the observed clock in memory when storage is unavailable.
  }
  return clock
}

async function getWriteContract() {
  await requireReadyNetwork()

  const provider =
    getProvider()

  const signer =
    await provider.getSigner()

  return new Contract(
    getRegistrarAddress(),
    REGISTRAR_ABI,
    signer
  )
}

/*
  ============================================================
  WALLET
  ============================================================
*/

export async function connectWallet():
Promise<string> {
  const provider =
    getProvider()

  await provider.send(
    "eth_requestAccounts",
    []
  )

  const signer =
    await provider.getSigner()

  return await signer.getAddress()
}

export async function disconnectWallet():
Promise<void> {
  return
}

/*
  ============================================================
  ROUND
  ============================================================
*/

function phaseFromNumber(
  phase: number
): RoundPhase {
  switch (phase) {
    case 1:
      return "commit"

    case 2:
      return "reveal"

    case 3:
      return "ended"

    default:
      return "not-started"
  }
}

export async function getCurrentRound():
Promise<string> {
  const contract =
    await getReadContract()

  const roundId: bigint =
    await contract.getCurrentRound()

  return roundId.toString()
}

export async function getCurrentRoundState():
Promise<RoundState | null> {
  const contract =
    await getReadContract()

  const roundId: bigint =
    await contract.getCurrentRound()

  if (roundId === 0n) {
    return null
  }

  const round =
    await contract.getRound(
      roundId
    )

  const chainClock = await readChainClock()

  const phase =
    phaseFromNumber(
      Number(round.phase)
    )

  let phaseEndsAt:
    number | undefined

  if (phase === "commit") {
    phaseEndsAt =
      Number(
        round.commitEnd
      ) * 1000
  }

  if (phase === "reveal") {
    phaseEndsAt =
      Number(
        round.revealEnd
      ) * 1000
  }

  return {
    roundId:
      roundId.toString(),

    startTime:
      Number(
        round.startTime
      ) * 1000,

    commitEnd:
      Number(
        round.commitEnd
      ) * 1000,

    revealEnd:
      Number(
        round.revealEnd
      ) * 1000,

    phase,
    phaseEndsAt,
    chainClock,

    pendingDomainCount:
      round.pendingDomainCount.toString(),

    deposit:
      formatEther(
        round.deposit
      ),

    nonRevealPenalty:
      formatEther(
        round.nonRevealPenalty
      ),

    treasury:
      round.treasury,
  }
}

export async function startAuctionRound():
Promise<{
  roundId: string
  txHash: string
}> {
  const contract =
    await getWriteContract()

  const tx =
    await contract.startRound()

  const receipt =
    await tx.wait()

  let roundId:
    string | undefined

  if (receipt) {
    for (
      const log of receipt.logs
    ) {
      try {
        const parsed =
          contract.interface.parseLog(
            log
          )

        if (
          parsed?.name ===
          "RoundStarted"
        ) {
          roundId =
            parsed.args.roundId.toString()

          break
        }
      } catch {
        // Ignore unrelated logs.
      }
    }
  }

  if (!roundId) {
    throw new Error(
      "Round started, but the round ID could not be recovered."
    )
  }

  return {
    roundId,
    txHash:
      tx.hash,
  }
}

/*
  ============================================================
  COMMITMENT HASH
  ============================================================
*/

export async function computeCommitmentHash(
  params: {
    roundId: bigint
    bidder: string
    label: string
    bidWei: bigint
    salt: string
    chainId?: bigint
    registrarAddress?: string
  }
): Promise<string> {
  let chainId:
    bigint

  if (
    params.chainId !==
    undefined
  ) {
    chainId =
      params.chainId
  } else {
    const network =
      await getProvider()
        .getNetwork()

    chainId =
      network.chainId
  }

  const registrarAddress =
    params.registrarAddress ??
    getRegistrarAddress()

  const coder =
    AbiCoder.defaultAbiCoder()

  const encoded =
    coder.encode(
      [
        "uint256",
        "address",
        "uint256",
        "address",
        "string",
        "uint256",
        "bytes32",
      ],
      [
        chainId,
        registrarAddress,
        params.roundId,
        params.bidder,
        params.label,
        params.bidWei,
        params.salt,
      ]
    )

  return keccak256(
    encoded
  )
}

/*
  ============================================================
  PREPARE COMMITMENT
  ============================================================
*/

export async function prepareBidCommitment(
  params: {
    name: string
    amount: string
    salt: string
  }
): Promise<Commitment> {
  await requireReadyNetwork()

  const name =
    normalizeLabel(
      params.name
    )

  const validation =
    validateLabel(name)

  if (!validation.valid) {
    throw new Error(
      validation.error ??
        "Invalid domain name."
    )
  }

  const provider =
    getProvider()

  const network =
    await provider.getNetwork()

  const signer =
    await provider.getSigner()

  const bidder =
    await signer.getAddress()

  const contract =
    await getReadContract()

  const roundId: bigint =
    await contract.getCurrentRound()

  if (roundId === 0n) {
    throw new Error(
      "No auction round has been started yet."
    )
  }

  const round =
    await contract.getRound(
      roundId
    )

  if (
    Number(round.phase) !==
    1
  ) {
    throw new Error(
      "Bids can only be committed during the commit phase."
    )
  }

  let bidWei: bigint

  try {
    bidWei =
      parseEther(
        params.amount
      )
  } catch {
    throw new Error(
      "Enter a valid ETH bid with no more than 18 decimal places."
    )
  }

  if (bidWei < 1n) {
    throw new Error(
      "Bid must be at least 1 wei."
    )
  }

  const deposit: bigint =
    await contract.COMMIT_DEPOSIT()

  if (bidWei > deposit) {
    throw new Error(
      `Bid cannot exceed ${formatEther(
        deposit
      )} ETH.`
    )
  }

  const existingId: bigint =
    await contract.getCommitmentId(
      roundId,
      bidder
    )

  if (existingId > 0n) {
    throw new Error(
      "This wallet has already committed a bid in the current round."
    )
  }

  const digest =
    await computeCommitmentHash({
      chainId:
        network.chainId,

      registrarAddress:
        getRegistrarAddress(),

      roundId,

      bidder,

      label:
        name,

      bidWei,

      salt:
        params.salt,
    })

  return {
    chainId:
      network.chainId.toString(),

    registrarAddress:
      getRegistrarAddress(),

    roundId:
      roundId.toString(),

    bidder,
    name,

    amount:
      params.amount,

    bidWei:
      bidWei.toString(),

    salt:
      params.salt,

    hash:
      digest,

    txHash:
      "",

    createdAt:
      Date.now(),

    submissionStatus:
      "prepared",

    revealed:
      false,

    settled:
      false,
  }
}

/*
  ============================================================
  REQUEST COMMITMENT
  ============================================================
*/

export async function requestBidCommitment(
  commitment:
    Commitment
): Promise<{
  txHash: string
  commitmentId?: string
  alreadyConfirmed: boolean
}> {
  await requireReadyNetwork()

  const provider =
    getProvider()

  const network =
    await provider.getNetwork()

  if (
    commitment.chainId &&
    commitment.chainId !==
      network.chainId.toString()
  ) {
    throw new Error(
      "This prepared bid belongs to a different blockchain network."
    )
  }

  if (
    commitment.registrarAddress &&
    commitment.registrarAddress.toLowerCase() !==
      getRegistrarAddress().toLowerCase()
  ) {
    throw new Error(
      "This prepared bid belongs to a different registrar deployment."
    )
  }

  const signer =
    await provider.getSigner()

  const bidder =
    await signer.getAddress()

  if (
    bidder.toLowerCase() !==
    commitment.bidder.toLowerCase()
  ) {
    throw new Error(
      "Switch to the wallet that prepared this bid."
    )
  }

  const contract =
    await getWriteContract()

  const existingId: bigint =
    await contract.getCommitmentId(
      BigInt(
        commitment.roundId
      ),
      commitment.bidder
    )

  if (existingId > 0n) {
    const stored =
      await contract.getCommitment(
        existingId
      )

    if (
      stored.digest.toLowerCase() !==
      commitment.hash.toLowerCase()
    ) {
      throw new Error(
        "A different on-chain commitment already exists for this wallet and round."
      )
    }

    return {
      txHash:
        commitment.txHash,

      commitmentId:
        existingId.toString(),

      alreadyConfirmed:
        true,
    }
  }

  const deposit: bigint =
    await contract.COMMIT_DEPOSIT()

  const tx =
    await contract.commitBid(
      BigInt(
        commitment.roundId
      ),
      commitment.hash,
      {
        value:
          deposit,
      }
    )

  return {
    txHash:
      tx.hash,

    alreadyConfirmed:
      false,
  }
}

/*
  ============================================================
  CONFIRM COMMITMENT
  ============================================================
*/

export async function confirmBidCommitment(
  commitment:
    Commitment,
  txHash: string
): Promise<{
  commitmentId: string
  txHash: string
}> {
  await requireReadyNetwork()

  const provider =
    getProvider()

  const contract =
    await getReadContract()

  if (txHash) {
    const receipt =
      await provider.waitForTransaction(
        txHash
      )

    if (
      receipt &&
      receipt.status === 0
    ) {
      throw new Error(
        "The commitment transaction failed on-chain."
      )
    }

    if (receipt) {
      if (receipt.from.toLowerCase() !== commitment.bidder.toLowerCase() ||
          receipt.to?.toLowerCase() !== getRegistrarAddress().toLowerCase()) {
        throw new Error("The transaction does not match the saved commitment context.")
      }
    }
  }

  const recoveredId: bigint =
    await contract.getCommitmentId(
      BigInt(
        commitment.roundId
      ),
      commitment.bidder
    )

  if (recoveredId === 0n) {
    throw new Error(
      "The commitment has not been confirmed on-chain yet."
    )
  }

  const stored =
    await contract.getCommitment(
      recoveredId
    )

  if (
    stored.digest.toLowerCase() !==
    commitment.hash.toLowerCase() ||
    stored.bidder.toLowerCase() !== commitment.bidder.toLowerCase() ||
    stored.roundId !== BigInt(commitment.roundId)
  ) {
    throw new Error(
      "The on-chain commitment does not match the saved recovery record."
    )
  }

  return {
    commitmentId:
      recoveredId.toString(),

    txHash,
  }
}

/*
  ============================================================
  RECONCILE COMMITMENT
  ============================================================
*/

export async function reconcileBidCommitment(
  commitment:
    Commitment
): Promise<Commitment> {
  await requireReadyNetwork()

  const contract =
    await getReadContract()

  const commitmentId: bigint =
    await contract.getCommitmentId(
      BigInt(
        commitment.roundId
      ),
      commitment.bidder
    )

  if (commitmentId === 0n) {
    if (commitment.txHash) {
      const receipt = await getProvider().getTransactionReceipt(commitment.txHash)
      if (receipt) {
        return {
          ...commitment,
          submissionStatus: "failed",
          submissionError: receipt.status === 0
            ? "The commitment transaction failed on-chain."
            : "The transaction did not create the saved commitment.",
        }
      }
    }
    return commitment
  }

  const stored =
    await contract.getCommitment(
      commitmentId
    )

  if (
    stored.digest.toLowerCase() !==
    commitment.hash.toLowerCase() ||
    stored.bidder.toLowerCase() !== commitment.bidder.toLowerCase() ||
    stored.roundId !== BigInt(commitment.roundId)
  ) {
    return {
      ...commitment,
      submissionStatus: "failed",
      submissionError: "A different on-chain commitment exists for this wallet and round.",
    }
  }

  return {
    ...commitment,

    commitmentId:
      commitmentId.toString(),

    submissionStatus:
      "confirmed",

    submissionError:
      undefined,
  }
}

/*
  ============================================================
  DOMAIN SEARCH
  ============================================================
*/

export async function checkDomain(
  rawName: string
): Promise<DomainInfo> {
  const name =
    normalizeLabel(
      rawName
    )

  const validation =
    validateLabel(name)

  if (!validation.valid) {
    throw new Error(
      validation.error ??
        "Invalid domain name."
    )
  }

  const contract =
    await getReadContract()

  const chainClock = await readChainClock()

  const domain =
    await contract.getDomain(
      name
    )

  if (
    domain.owner !==
    ZeroAddress
  ) {
    return {
      name,

      status:
        "registered",

      owner:
        domain.owner,

      resolutionAddress:
        domain.resolutionAddress,

      roundId:
        domain.roundId.toString(),

      winningCommitmentId:
        domain.winningCommitmentId.toString(),

      highestBid:
        formatEther(
          domain.priceWei
        ),

      priceWei:
        domain.priceWei.toString(),

      finalized:
        true,
    }
  }

  const reservedRoundId: bigint =
    await contract.reservedRound(
      name
    )

  if (
    reservedRoundId > 0n
  ) {
    const round =
      await contract.getRound(
        reservedRoundId
      )

    const auction =
      await contract.getAuctionForRound(
        reservedRoundId,
        name
      )

    const phase =
      phaseFromNumber(
        Number(round.phase)
      )

    if (phase === "reveal") {
      return {
        name,
        status:
          "reveal",

        roundId:
          reservedRoundId.toString(),

        reservedRoundId:
          reservedRoundId.toString(),

        phaseEndsAt:
          Number(
            round.revealEnd
          ) * 1000,

        chainClock,

        highestBid:
          auction.highestBidWei >
          0n
            ? formatEther(
                auction.highestBidWei
              )
            : undefined,

        highestBidder:
          auction.highestBidder !==
          ZeroAddress
            ? auction.highestBidder
            : undefined,

        winningCommitmentId:
          auction.winningCommitmentId >
          0n
            ? auction.winningCommitmentId.toString()
            : undefined,

        finalized:
          auction.finalized,
      }
    }

    if (phase === "ended") {
      return {
        name,
        status:
          "ended",

        roundId:
          reservedRoundId.toString(),

        reservedRoundId:
          reservedRoundId.toString(),

        highestBid:
          auction.highestBidWei >
          0n
            ? formatEther(
                auction.highestBidWei
              )
            : undefined,

        highestBidder:
          auction.highestBidder !==
          ZeroAddress
            ? auction.highestBidder
            : undefined,

        winningCommitmentId:
          auction.winningCommitmentId >
          0n
            ? auction.winningCommitmentId.toString()
            : undefined,

        finalized:
          auction.finalized,
      }
    }
  }

  const currentRound: bigint =
    await contract.getCurrentRound()

  if (currentRound === 0n) {
    return {
      name,
      status:
        "available",
    }
  }

  const round =
    await contract.getRound(
      currentRound
    )

  const phase =
    phaseFromNumber(
      Number(round.phase)
    )

  if (phase === "commit") {
    return {
      name,
      status:
        "commit",

      roundId:
        currentRound.toString(),

      phaseEndsAt:
        Number(
          round.commitEnd
        ) * 1000,

      chainClock,
    }
  }

  if (phase === "reveal") {
    return {
      name,
      status:
        "reveal",

      roundId:
        currentRound.toString(),

      phaseEndsAt:
        Number(
          round.revealEnd
        ) * 1000,

      chainClock,
    }
  }

  return {
    name,

    status:
      "available",

    roundId:
      currentRound.toString(),
  }
}

/*
  ============================================================
  REVEAL BID
  ============================================================
*/

export async function revealBid(
  commitment:
    Commitment
): Promise<{
  txHash: string
  valid: boolean
}> {
  await requireReadyNetwork()

  const provider =
    getProvider()

  const network =
    await provider.getNetwork()

  if (
    commitment.chainId &&
    commitment.chainId !==
      network.chainId.toString()
  ) {
    throw new Error(
      "This commitment belongs to a different blockchain network."
    )
  }

  if (
    commitment.registrarAddress &&
    commitment.registrarAddress.toLowerCase() !==
      getRegistrarAddress().toLowerCase()
  ) {
    throw new Error(
      "This commitment belongs to a different registrar deployment."
    )
  }

  const signer =
    await provider.getSigner()

  const account =
    await signer.getAddress()

  if (
    account.toLowerCase() !==
    commitment.bidder.toLowerCase()
  ) {
    throw new Error(
      "Switch to the wallet that created this commitment."
    )
  }

  const contract =
    await getWriteContract()

  const commitmentId: bigint =
    await contract.getCommitmentId(
      BigInt(
        commitment.roundId
      ),
      commitment.bidder
    )

  if (commitmentId === 0n) {
    throw new Error(
      "This saved bid has not been committed on-chain."
    )
  }

  const stored =
    await contract.getCommitment(
      commitmentId
    )

  if (
    stored.digest.toLowerCase() !==
    commitment.hash.toLowerCase()
  ) {
    throw new Error(
      "The saved recovery data does not match the on-chain commitment."
    )
  }

  const tx =
    await contract.revealBid(
      BigInt(
        commitment.roundId
      ),
      commitment.name,
      BigInt(
        commitment.bidWei
      ),
      commitment.salt
    )

  const receipt =
    await tx.wait()

  let valid =
    false

  if (receipt) {
    for (
      const log of receipt.logs
    ) {
      try {
        const parsed =
          contract.interface.parseLog(
            log
          )

        if (
          parsed?.name ===
          "CommitmentRevealed"
        ) {
          valid =
            Boolean(
              parsed.args.valid
            )

          break
        }
      } catch {
        // Ignore unrelated logs.
      }
    }
  }

  return {
    txHash:
      tx.hash,

    valid,
  }
}

/*
  ============================================================
  FINALIZE DOMAIN
  ============================================================
*/

export async function finalizeDomain(
  name: string
): Promise<{
  owner: string
  txHash: string
}> {
  const canonical =
    normalizeLabel(name)

  const contract =
    await getWriteContract()

  const reservedRound: bigint =
    await contract.reservedRound(
      canonical
    )

  if (
    reservedRound === 0n
  ) {
    throw new Error(
      "There is no pending auction to finalize for this name."
    )
  }

  const tx =
    await contract.finalizeDomain(
      reservedRound,
      canonical
    )

  const receipt =
    await tx.wait()

  let owner:
    string | undefined

  if (receipt) {
    for (
      const log of receipt.logs
    ) {
      try {
        const parsed =
          contract.interface.parseLog(
            log
          )

        if (
          parsed?.name ===
          "DomainFinalized"
        ) {
          owner =
            parsed.args.owner

          break
        }
      } catch {
        // Ignore unrelated logs.
      }
    }
  }

  if (!owner) {
    const domain =
      await contract.getDomain(
        canonical
      )

    if (
      domain.owner !==
      ZeroAddress
    ) {
      owner =
        domain.owner
    }
  }

  if (!owner) {
    throw new Error(
      "Domain finalized, but the new owner could not be recovered."
    )
  }

  return {
    owner,
    txHash:
      tx.hash,
  }
}

/*
  ============================================================
  SETTLEMENT
  ============================================================
*/

export async function settleCommitment(
  commitment:
    Commitment
): Promise<{
  txHash: string
  refundWei: string
  refundEth: string
  proceedsWei: string
  proceedsEth: string
}> {
  const contract =
    await getWriteContract()

  const tx =
    await contract.settleBid(
      BigInt(
        commitment.roundId
      )
    )

  const receipt =
    await tx.wait()

  let refundWei =
    0n

  let proceedsWei =
    0n

  if (receipt) {
    for (
      const log of receipt.logs
    ) {
      try {
        const parsed =
          contract.interface.parseLog(
            log
          )

        if (
          parsed?.name ===
          "CommitmentSettled"
        ) {
          refundWei =
            parsed.args.refundWei

          proceedsWei =
            parsed.args.proceedsWei

          break
        }
      } catch {
        // Ignore unrelated logs.
      }
    }
  }

  return {
    txHash:
      tx.hash,

    refundWei:
      refundWei.toString(),

    refundEth:
      formatEther(
        refundWei
      ),

    proceedsWei:
      proceedsWei.toString(),

    proceedsEth:
      formatEther(
        proceedsWei
      ),
  }
}

/*
  ============================================================
  WITHDRAWAL
  ============================================================
*/

export async function getWithdrawalCredit(
  account: string
): Promise<{
  wei: string
  eth: string
}> {
  const contract =
    await getReadContract()

  const amount: bigint =
    await contract.withdrawalCredits(
      account
    )

  return {
    wei:
      amount.toString(),

    eth:
      formatEther(
        amount
      ),
  }
}

export async function withdrawCredit():
Promise<{
  txHash: string
  amountWei: string
  amountEth: string
}> {
  const contract =
    await getWriteContract()

  const tx =
    await contract.withdraw()

  const receipt =
    await tx.wait()

  let amount =
    0n

  if (receipt) {
    for (
      const log of receipt.logs
    ) {
      try {
        const parsed =
          contract.interface.parseLog(
            log
          )

        if (
          parsed?.name ===
          "Withdrawn"
        ) {
          amount =
            parsed.args.amountWei

          break
        }
      } catch {
        // Ignore unrelated logs.
      }
    }
  }

  return {
    txHash:
      tx.hash,

    amountWei:
      amount.toString(),

    amountEth:
      formatEther(
        amount
      ),
  }
}

/*
  ============================================================
  DOMAIN RESOLUTION
  ============================================================
*/

export async function resolveDomain(
  rawName: string
): Promise<string> {
  const name =
    normalizeLabel(
      rawName
    )

  const validation =
    validateLabel(name)

  if (!validation.valid) {
    throw new Error(
      validation.error ??
        "Invalid domain name."
    )
  }

  const contract =
    await getReadContract()

  const address: string =
    await contract.resolve(
      name
    )

  if (
    address ===
    ZeroAddress
  ) {
    throw new Error(
      `${name}.ntu is not registered or does not currently resolve to an Ethereum address.`
    )
  }

  return address
}

/*
  ============================================================
  SET RESOLUTION ADDRESS
  ============================================================
*/

export async function setResolutionAddress(
  rawName: string,
  target: string
): Promise<{
  txHash: string
}> {
  const name =
    normalizeLabel(rawName)

  const validation =
    validateLabel(name)

  if (!validation.valid) {
    throw new Error(
      validation.error ??
        "Invalid domain name."
    )
  }

  if (!isAddress(target)) {
    throw new Error(
      "Enter a valid Ethereum address."
    )
  }

  if (
    target.toLowerCase() ===
    ZeroAddress.toLowerCase()
  ) {
    throw new Error(
      "The zero address cannot be used as a resolution address."
    )
  }

  if (
    target.toLowerCase() ===
    getRegistrarAddress().toLowerCase()
  ) {
    throw new Error(
      "The registrar contract cannot be used as a resolution address."
    )
  }

  const contract =
    await getWriteContract()

  const tx =
    await contract.setAddress(
      name,
      target
    )

  await tx.wait()

  return {
    txHash:
      tx.hash,
  }
}

/*
  ============================================================
  PAYMENT PREVIEW
  ============================================================
*/

export async function previewPayment(
  params: {
    name: string
    amount: string
  }
): Promise<PaymentPreview> {
  await requireReadyNetwork()

  const name =
    normalizeLabel(
      params.name
    )

  const validation =
    validateLabel(name)

  if (!validation.valid) {
    throw new Error(
      validation.error ??
        "Invalid domain name."
    )
  }

  let amountWei: bigint

  try {
    amountWei =
      parseEther(
        params.amount
      )
  } catch {
    throw new Error(
      "Enter a valid ETH amount with no more than 18 decimal places."
    )
  }

  if (
    amountWei <= 0n
  ) {
    throw new Error(
      "Payment amount must be greater than zero."
    )
  }

  const provider =
    getProvider()

  const network =
    await provider.getNetwork()

  const contract =
    await getReadContract()

  const recipient: string =
    await contract.resolve(
      name
    )

  if (
    recipient ===
    ZeroAddress
  ) {
    throw new Error(
      `${name}.ntu is not registered or does not currently resolve to an Ethereum address.`
    )
  }

  return {
    name,

    amount:
      params.amount,

    amountWei:
      amountWei.toString(),

    recipient,

    chainId:
      network.chainId.toString(),

    networkName:
      getNetworkName(
        network.chainId,
        network.name
      ),

    createdAt:
      Date.now(),
  }
}

/*
  ============================================================
  PAYMENT CONFIRMATION
  ============================================================
*/

export async function confirmPayment(
  preview:
    PaymentPreview
): Promise<{
  resolvedAddress: string
  txHash: string
}> {
  await requireReadyNetwork()

  const provider =
    getProvider()

  const network =
    await provider.getNetwork()

  /*
    Force a fresh preview if network changed.
  */

  if (
    network.chainId.toString() !==
    preview.chainId
  ) {
    throw new Error(
      "The network changed after the payment preview. Please preview the payment again."
    )
  }

  const contract =
    await getReadContract()

  /*
    Resolve again immediately before opening MetaMask.
  */

  const currentRecipient: string =
    await contract.resolve(
      preview.name
    )

  if (
    currentRecipient ===
    ZeroAddress
  ) {
    throw new Error(
      "The domain no longer resolves to a valid recipient. Please preview the payment again."
    )
  }

  /*
    If resolution changed, require a new confirmation.
  */

  if (
    currentRecipient.toLowerCase() !==
    preview.recipient.toLowerCase()
  ) {
    throw new Error(
      "The domain recipient changed after the payment preview. Please review the new recipient and confirm again."
    )
  }

  const amountWei =
    BigInt(
      preview.amountWei
    )

  if (
    amountWei <= 0n
  ) {
    throw new Error(
      "Payment amount must be greater than zero."
    )
  }

  const writeContract =
    await getWriteContract()

  /*
    The contract receives exactly the address that
    the user reviewed in the preview.
  */

  const tx =
    await writeContract.sendToDomain(
      preview.name,
      preview.recipient,
      {
        value:
          amountWei,
      }
    )

  await tx.wait()

  return {
    resolvedAddress:
      preview.recipient,

    txHash:
      tx.hash,
  }
}

/*
  ============================================================
  DISPLAY HELPERS
  ============================================================
*/

export function shortenHex(
  value: string,
  chars = 4
): string {
  if (
    value.length <=
    chars * 2 + 2
  ) {
    return value
  }

  return `${value.slice(
    0,
    chars + 2
  )}…${value.slice(
    -chars
  )}`
}

export function phaseRemainingMs(
  timestamp?: number,
  clock?: ChainClock,
  now = Date.now()
): number {
  if (!timestamp) return 0
  const estimatedChainTime = clock
    ? clock.chainTimestampMs + Math.max(0, now - clock.capturedAtMs)
    : now
  if (clock && clock.chainTimestampMs < timestamp) {
    return Math.max(1, timestamp - estimatedChainTime)
  }
  return Math.max(0, timestamp - estimatedChainTime)
}

export function phaseEstimateExpired(
  timestamp?: number,
  clock?: ChainClock,
  now = Date.now()
): boolean {
  if (!timestamp) return false
  const estimatedChainTime = clock
    ? clock.chainTimestampMs + Math.max(0, now - clock.capturedAtMs)
    : now
  return estimatedChainTime >= timestamp
}

export function formatTimeLeft(
  timestamp?: number,
  clock?: ChainClock,
  now = Date.now()
): string {
  if (!timestamp) {
    return "—"
  }

  if (clock && clock.chainTimestampMs < timestamp &&
      phaseEstimateExpired(timestamp, clock, now)) {
    return "Awaiting chain block"
  }

  const difference = phaseRemainingMs(timestamp, clock, now)

  const totalSeconds =
    Math.ceil(
      difference /
        1000
    )

  const minutes =
    Math.floor(
      totalSeconds /
        60
    )

  const seconds =
    totalSeconds %
    60

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}
