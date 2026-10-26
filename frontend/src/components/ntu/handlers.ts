import {
  AbiCoder,
  BrowserProvider,
  Contract,
  ZeroAddress,
  formatEther,
  keccak256,
  parseEther,
} from "ethers"

declare global {
  interface Window {
    ethereum?: any
  }
}

const REGISTRAR_ADDRESS =
  import.meta.env.VITE_REGISTRAR_ADDRESS as string | undefined

const REGISTRAR_ABI = [
  "function startRound() returns (uint256 roundId)",
  "function getCurrentRound() view returns (uint256)",
  "function getRound(uint256 roundId) view returns (tuple(uint256 startTime, uint256 commitEnd, uint256 revealEnd, uint8 phase, uint256 pendingDomainCount, uint256 deposit, uint256 nonRevealPenalty, address treasury))",

  "function COMMIT_DEPOSIT() view returns (uint256)",
  "function NON_REVEAL_PENALTY() view returns (uint256)",

  "function computeCommitment(uint256 roundId, address bidder, string label, uint256 bidWei, bytes32 salt) view returns (bytes32)",

  "function commit(uint256 roundId, bytes32 digest) payable returns (uint256 commitmentId)",
  "function commitBid(uint256 roundId, bytes32 digest) payable",

  "function reveal(uint256 commitmentId, string label, uint256 bidWei, bytes32 salt) returns (bool valid)",
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

export interface DomainInfo {
  name: string
  status: DomainStatus
  roundId?: string
  phaseEndsAt?: number
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
  roundId: string
  bidder: string
  name: string
  amount: string
  salt: string
  hash: string
  txHash: string
  createdAt: number
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
  pendingDomainCount: string
  deposit: string
  nonRevealPenalty: string
  treasury: string
}

export function generateSalt(): string {
  const bytes = crypto.getRandomValues(
    new Uint8Array(32)
  )

  return (
    "0x" +
    Array.from(bytes)
      .map((byte) =>
        byte.toString(16).padStart(2, "0")
      )
      .join("")
  )
}

function requireMetaMask() {
  if (!window.ethereum) {
    throw new Error(
      "MetaMask is not installed. Please install MetaMask first."
    )
  }

  return window.ethereum
}

function requireContractAddress(): string {
  if (!REGISTRAR_ADDRESS) {
    throw new Error(
      "Registrar contract has not been deployed/configured yet."
    )
  }

  return REGISTRAR_ADDRESS
}

export function getFriendlyError(
  error: unknown
): string {
  const raw =
    error instanceof Error
      ? error.message
      : String(error)

  const messages: Record<string, string> = {
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
      "The revealed bid is invalid.",

    "ALREADY REGISTERED":
      "This .ntu name has already been registered.",

    "NAME RESERVED":
      "This .ntu name is already reserved by another auction round.",

    "COMMITMENT MISMATCH":
      "The bid, name or salt does not match the original commitment.",

    "NO WINNING BID":
      "There is no winning bid for this name.",

    "ALREADY FINALIZED":
      "This domain has already been finalized.",

    "WRONG RESERVATION":
      "This name belongs to a different auction round.",

    "DOMAIN NOT FINALIZED":
      "The domain must be finalized before this commitment can be settled.",

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
      "The domain resolution address changed before the payment was confirmed. Please try again.",

    "ETH TRANSFER FAILED":
      "The ETH transfer failed.",
  }

  for (const [code, friendly] of Object.entries(messages)) {
    if (raw.includes(code)) {
      return friendly
    }
  }

  const lower =
    raw.toLowerCase()

  if (
    lower.includes("user rejected") ||
    lower.includes("user denied")
  ) {
    return "The MetaMask transaction was cancelled."
  }

  return raw
}

function getProvider() {
  return new BrowserProvider(
    requireMetaMask()
  )
}

async function getReadContract() {
  const provider =
    getProvider()

  return new Contract(
    requireContractAddress(),
    REGISTRAR_ABI,
    provider
  )
}

async function getWriteContract() {
  const provider =
    getProvider()

  const signer =
    await provider.getSigner()

  return new Contract(
    requireContractAddress(),
    REGISTRAR_ABI,
    signer
  )
}

export async function connectWallet(): Promise<string> {
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

export async function disconnectWallet(): Promise<void> {
  return
}

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

export async function getCurrentRound(): Promise<string> {
  const contract =
    await getReadContract()

  const roundId: bigint =
    await contract.getCurrentRound()

  return roundId.toString()
}

export async function getCurrentRoundState(): Promise<
  RoundState | null
> {
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

  const phase =
    phaseFromNumber(
      Number(round.phase)
    )

  let phaseEndsAt:
    number | undefined

  if (phase === "commit") {
    phaseEndsAt =
      Number(round.commitEnd) *
      1000
  }

  if (phase === "reveal") {
    phaseEndsAt =
      Number(round.revealEnd) *
      1000
  }

  return {
    roundId:
      roundId.toString(),

    startTime:
      Number(round.startTime) *
      1000,

    commitEnd:
      Number(round.commitEnd) *
      1000,

    revealEnd:
      Number(round.revealEnd) *
      1000,

    phase,

    phaseEndsAt,

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

export async function startAuctionRound(): Promise<{
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
    for (const log of receipt.logs) {
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

export async function computeCommitmentHash(
  params: {
    roundId: bigint
    bidder: string
    label: string
    bidWei: bigint
    salt: string
  }
): Promise<string> {
  const provider =
    getProvider()

  const network =
    await provider.getNetwork()

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
        network.chainId,
        requireContractAddress(),
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

export async function checkDomain(
  rawName: string
): Promise<DomainInfo> {
  const name =
    rawName
      .toLowerCase()
      .replace(/\.ntu$/, "")

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

  const reservedRoundId:
    bigint =
    await contract.reservedRound(
      name
    )

  if (
    reservedRoundId >
    0n
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

    if (
      phase === "reveal"
    ) {
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

    if (
      phase === "ended"
    ) {
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

  const currentRound:
    bigint =
    await contract.getCurrentRound()

  if (
    currentRound ===
    0n
  ) {
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

  if (
    phase === "commit"
  ) {
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
    }
  }

  if (
    phase === "reveal"
  ) {
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

export async function commitBid(
  params: {
    name: string
    amount: string
    salt: string
  }
): Promise<Commitment> {
  const name =
    params.name
      .toLowerCase()
      .replace(/\.ntu$/, "")

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

  const signer =
    await provider.getSigner()

  const bidder =
    await signer.getAddress()

  const contract =
    await getWriteContract()

  const roundId:
    bigint =
    await contract.getCurrentRound()

  if (
    roundId ===
    0n
  ) {
    throw new Error(
      "No auction round has been started yet."
    )
  }

  const round =
    await contract.getRound(
      roundId
    )

  if (
    Number(
      round.phase
    ) !== 1
  ) {
    throw new Error(
      "Bids can only be committed during the commit phase."
    )
  }

  const bidWei =
    parseEther(
      params.amount
    )

  if (
    bidWei <=
    0n
  ) {
    throw new Error(
      "Bid must be greater than zero."
    )
  }

  const existingCommitmentId:
    bigint =
    await contract.getCommitmentId(
      roundId,
      bidder
    )

  if (
    existingCommitmentId >
    0n
  ) {
    throw new Error(
      "This wallet has already committed a bid in the current round."
    )
  }

  const digest =
    await computeCommitmentHash({
      roundId,
      bidder,
      label:
        name,
      bidWei,
      salt:
        params.salt,
    })

  const deposit:
    bigint =
    await contract.COMMIT_DEPOSIT()

  const tx =
    await contract.commit(
      roundId,
      digest,
      {
        value:
          deposit,
      }
    )

  const receipt =
    await tx.wait()

  let commitmentId:
    string | undefined

  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const parsed =
          contract.interface.parseLog(
            log
          )

        if (
          parsed?.name ===
          "CommitmentSubmitted"
        ) {
          commitmentId =
            parsed.args.commitmentId.toString()

          break
        }
      } catch {
        // Ignore unrelated logs.
      }
    }
  }

  if (!commitmentId) {
    throw new Error(
      "Commit succeeded, but the commitment ID could not be recovered."
    )
  }

  return {
    commitmentId,

    roundId:
      roundId.toString(),

    bidder,

    name,

    amount:
      params.amount,

    salt:
      params.salt,

    hash:
      digest,

    txHash:
      tx.hash,

    createdAt:
      Date.now(),

    revealed:
      false,

    settled:
      false,
  }
}

export async function revealBid(
  commitment: Commitment
): Promise<{
  txHash: string
  valid: boolean
}> {
  if (
    !commitment.commitmentId
  ) {
    throw new Error(
      "This saved commitment does not contain its on-chain commitment ID."
    )
  }

  const contract =
    await getWriteContract()

  const bidWei =
    parseEther(
      commitment.amount
    )

  const tx =
    await contract.reveal(
      BigInt(
        commitment.commitmentId
      ),
      commitment.name,
      bidWei,
      commitment.salt
    )

  const receipt =
    await tx.wait()

  let valid =
    false

  if (receipt) {
    for (const log of receipt.logs) {
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

export async function finalizeDomain(
  name: string
): Promise<{
  owner: string
  txHash: string
}> {
  const contract =
    await getWriteContract()

  const tx =
    await contract.finalizeName(
      name
    )

  const receipt =
    await tx.wait()

  let owner:
    string | undefined

  if (receipt) {
    for (const log of receipt.logs) {
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

export async function settleCommitment(
  commitment: Commitment
): Promise<{
  txHash: string
  refundWei: string
  refundEth: string
  proceedsWei: string
  proceedsEth: string
}> {
  if (
    !commitment.commitmentId
  ) {
    throw new Error(
      "This commitment does not contain its on-chain commitment ID."
    )
  }

  const contract =
    await getWriteContract()

  const tx =
    await contract.settleCommit(
      BigInt(
        commitment.commitmentId
      )
    )

  const receipt =
    await tx.wait()

  let refundWei =
    0n

  let proceedsWei =
    0n

  if (receipt) {
    for (const log of receipt.logs) {
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

export async function getWithdrawalCredit(
  account: string
): Promise<{
  wei: string
  eth: string
}> {
  const contract =
    await getReadContract()

  const amount:
    bigint =
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

export async function withdrawCredit(): Promise<{
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
    for (const log of receipt.logs) {
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

export async function resolveDomain(
  rawName: string
): Promise<string> {
  const name =
    rawName
      .toLowerCase()
      .replace(/\.ntu$/, "")

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

  const address:
    string =
    await contract.resolve(
      name
    )

  if (
    address ===
    ZeroAddress
  ) {
    throw new Error(
      `${name}.ntu does not currently resolve to an Ethereum address.`
    )
  }

  return address
}

export async function setResolutionAddress(
  name: string,
  target: string
): Promise<{
  txHash: string
}> {
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

export async function sendPayment(
  params: {
    name: string
    amount: string
  }
): Promise<{
  resolvedAddress: string
  txHash: string
}> {
  const name =
    params.name
      .toLowerCase()
      .replace(/\.ntu$/, "")

  const validation =
    validateLabel(name)

  if (!validation.valid) {
    throw new Error(
      validation.error ??
        "Invalid domain name."
    )
  }

  const amountWei =
    parseEther(
      params.amount
    )

  if (
    amountWei <=
    0n
  ) {
    throw new Error(
      "Payment amount must be greater than zero."
    )
  }

  const resolvedAddress =
    await resolveDomain(
      name
    )

  const contract =
    await getWriteContract()

  const tx =
    await contract.sendToDomain(
      name,
      resolvedAddress,
      {
        value:
          amountWei,
      }
    )

  await tx.wait()

  return {
    resolvedAddress,

    txHash:
      tx.hash,
  }
}

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

export function formatTimeLeft(
  timestamp?: number
): string {
  if (!timestamp) {
    return "—"
  }

  const difference =
    Math.max(
      0,
      timestamp -
        Date.now()
    )

  const totalSeconds =
    Math.floor(
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

  if (
    minutes > 0
  ) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

export function sanitizeLabel(
  value: string
): string {
  return value
    .toLowerCase()
    .replace(/\.ntu$/, "")
    .replace(
      /[^a-z0-9-]/g,
      ""
    )
    .slice(
      0,
      32
    )
}

export function validateLabel(
  value: string
): {
  valid: boolean
  error?: string
} {
  const label =
    value
      .toLowerCase()
      .replace(/\.ntu$/, "")

  const byteLength =
    new TextEncoder()
      .encode(label)
      .length

  if (
    byteLength < 3
  ) {
    return {
      valid:
        false,

      error:
        "Domain names must be at least 3 characters long.",
    }
  }

  if (
    byteLength > 32
  ) {
    return {
      valid:
        false,

      error:
        "Domain names cannot exceed 32 characters.",
    }
  }

  if (
    label.startsWith("-") ||
    label.endsWith("-")
  ) {
    return {
      valid:
        false,

      error:
        "Domain names cannot start or end with a hyphen.",
    }
  }

  if (
    !/^[a-z0-9-]+$/.test(
      label
    )
  ) {
    return {
      valid:
        false,

      error:
        "Use lowercase letters, numbers and hyphens only.",
    }
  }

  return {
    valid:
      true,
  }
}