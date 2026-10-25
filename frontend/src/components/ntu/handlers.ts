import {
  AbiCoder,
  BrowserProvider,
  Contract,
  ZeroAddress,
  formatEther,
  keccak256,
  parseEther,
} from "ethers"

/*
  ============================================================
  METAMASK TYPE
  ============================================================
*/

declare global {
  interface Window {
    ethereum?: any
  }
}

/*
  ============================================================
  CONTRACT CONFIGURATION
  ============================================================
*/

const REGISTRAR_ADDRESS =
  import.meta.env.VITE_REGISTRAR_ADDRESS as string | undefined

/*
  Contract interface based on Person A's current
  DomainRegistrar.sol.

  We only include functions/events that the frontend needs.
*/

const REGISTRAR_ABI = [
  // Auction timing
  "function getCurrentRound() view returns (uint256)",

  "function getRound(uint256 roundId) view returns (tuple(uint256 startTime, uint256 commitEnd, uint256 revealEnd, uint8 phase))",

  // Deposit
  "function COMMIT_DEPOSIT() view returns (uint256)",

  // Commitment
  "function computeCommitment(uint256 roundId, address bidder, string label, uint256 bidWei, bytes32 salt) view returns (bytes32)",

  "function commit(uint256 roundId, bytes32 digest) payable returns (uint256 commitmentId)",

  "function getCommitment(uint256 commitmentId) view returns (tuple(address bidder, bytes32 digest, uint256 roundId, uint256 deposit, bool revealed, bool valid, bytes32 labelHash, uint256 bidWei))",

  // Reveal
  "function reveal(uint256 commitmentId, string label, uint256 bidWei, bytes32 salt) returns (bool valid)",

  // Auction
  "function getAuction(string label) view returns (tuple(uint256 roundId, uint256 winningCommitmentId, address highestBidder, uint256 highestBidWei))",

  // Ownership
  "function finalizeName(string label) returns (address owner)",

  "function getDomain(string label) view returns (tuple(address owner, uint256 roundId, uint256 winningCommitmentId, uint256 priceWei))",

  "function resolve(string label) view returns (address)",

  // Events
  "event CommitmentSubmitted(uint256 indexed commitmentId, uint256 indexed roundId, address indexed bidder, bytes32 digest)",

  "event CommitmentRevealed(uint256 indexed commitmentId, uint256 indexed roundId, address indexed bidder, string label, uint256 bidWei, bool valid)",

  "event DomainFinalized(bytes32 indexed labelHash, uint256 indexed roundId, address indexed owner, string label, uint256 winningCommitmentId, uint256 priceWei)",
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
  | "registered"

export interface DomainInfo {
  name: string

  status: DomainStatus

  phaseEndsAt?: number

  owner?: string

  highestBid?: string

  bidCount?: number

  roundId?: string

  winningCommitmentId?: string

  priceWei?: string
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
}

/*
  ============================================================
  BASIC HELPERS
  ============================================================
*/

const randomHex = (bytes: number) =>
  "0x" +
  Array.from(
    crypto.getRandomValues(
      new Uint8Array(bytes)
    )
  )
    .map((b) =>
      b.toString(16).padStart(2, "0")
    )
    .join("")

export function generateSalt(): string {
  return randomHex(32)
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

/*
  ============================================================
  PROVIDER / CONTRACT HELPERS
  ============================================================
*/

function getProvider() {
  const ethereum =
    requireMetaMask()

  return new BrowserProvider(
    ethereum
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

/*
  ============================================================
  WALLET
  ============================================================
*/

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
  /*
    MetaMask does not provide a normal
    programmatic disconnect function.

    NtuApp clears the account from React state.
  */

  return
}

/*
  ============================================================
  AUCTION ROUND
  ============================================================
*/

export async function getCurrentRound(): Promise<string> {
  const contract =
    await getReadContract()

  const roundId: bigint =
    await contract.getCurrentRound()

  return roundId.toString()
}

export interface RoundState {
  roundId: string

  startTime: number

  commitEnd: number

  revealEnd: number

  phase:
    | "not-started"
    | "commit"
    | "reveal"
    | "ended"

  phaseEndsAt?: number
}

export async function getCurrentRoundState(): Promise<RoundState> {
  const contract =
    await getReadContract()

  const roundId: bigint =
    await contract.getCurrentRound()

  const round =
    await contract.getRound(
      roundId
    )

  const phaseNumber =
    Number(round.phase)

  let phase:
    RoundState["phase"]

  switch (phaseNumber) {
    case 1:
      phase = "commit"
      break

    case 2:
      phase = "reveal"
      break

    case 3:
      phase = "ended"
      break

    default:
      phase = "not-started"
  }

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
  }
}

/*
  ============================================================
  COMMITMENT HASH
  ============================================================

  Solidity:

  keccak256(
    abi.encode(
      block.chainid,
      address(this),
      roundId,
      bidder,
      label,
      bidWei,
      salt
    )
  )

  This reproduces that exact encoding locally.

  IMPORTANT:
  abi.encode != abi.encodePacked
*/

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

  const chainId =
    network.chainId

  const contractAddress =
    requireContractAddress()

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
        contractAddress,
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
  REAL DOMAIN SEARCH
  ============================================================

  Search logic:

  1. resolve(label)
     → if non-zero address, name is already registered.

  2. Otherwise inspect the current auction round.

  3. getAuction(label)
     → gives current leading revealed bid if one exists.
*/

export async function checkDomain(
  name: string
): Promise<DomainInfo> {
  const contract =
    await getReadContract()

  /*
    First check whether the name
    has already been finalized.
  */

  const owner: string =
    await contract.resolve(name)

  if (
    owner !== ZeroAddress
  ) {
    const domain =
      await contract.getDomain(
        name
      )

    return {
      name,

      status:
        "registered",

      owner,

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
    }
  }

  /*
    Name is not yet registered.

    Determine current round/phase.
  */

  const roundId: bigint =
    await contract.getCurrentRound()

  const round =
    await contract.getRound(
      roundId
    )

  const phase =
    Number(
      round.phase
    )

  const auction =
    await contract.getAuction(
      name
    )

  const highestBidWei:
    bigint =
    auction.highestBidWei

  /*
    Phase enum:

    0 = NotStarted
    1 = Commit
    2 = Reveal
    3 = Ended
  */

  if (phase === 1) {
    return {
      name,

      status:
        "commit",

      roundId:
        roundId.toString(),

      phaseEndsAt:
        Number(
          round.commitEnd
        ) * 1000,

      highestBid:
        highestBidWei > 0n
          ? formatEther(
              highestBidWei
            )
          : undefined,
    }
  }

  if (phase === 2) {
    return {
      name,

      status:
        "reveal",

      roundId:
        roundId.toString(),

      phaseEndsAt:
        Number(
          round.revealEnd
        ) * 1000,

      highestBid:
        highestBidWei > 0n
          ? formatEther(
              highestBidWei
            )
          : undefined,

      winningCommitmentId:
        auction.winningCommitmentId >
        0n
          ? auction.winningCommitmentId.toString()
          : undefined,
    }
  }

  /*
    If there is no finalized owner and
    we are outside the active phases,
    treat the name as available.
  */

  return {
    name,

    status:
      "available",

    roundId:
      roundId.toString(),
  }
}

/*
  ============================================================
  REAL COMMIT BID
  ============================================================
*/

export async function commitBid(
  params: {
    name: string

    amount: string

    salt: string
  }
): Promise<Commitment> {
  const provider =
    getProvider()

  const signer =
    await provider.getSigner()

  const bidder =
    await signer.getAddress()

  const contract =
    await getWriteContract()

  /*
    Current auction round
  */

  const roundId: bigint =
    await contract.getCurrentRound()

  /*
    User's hidden bid
    converted from ETH → Wei.
  */

  const bidWei =
    parseEther(
      params.amount
    )

  /*
    Exact commitment hash.
  */

  const digest =
    await computeCommitmentHash({
      roundId,

      bidder,

      label:
        params.name,

      bidWei,

      salt:
        params.salt,
    })

  /*
    Read required deposit
    directly from contract.
  */

  const commitDeposit:
    bigint =
    await contract.COMMIT_DEPOSIT()

  /*
    MetaMask opens here.
  */

  const tx =
    await contract.commit(
      roundId,

      digest,

      {
        value:
          commitDeposit,
      }
    )

  console.log(
    "Commit submitted:",
    tx.hash
  )

  const receipt =
    await tx.wait()

  let commitmentId:
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
          "CommitmentSubmitted"
        ) {
          commitmentId =
            parsed.args.commitmentId.toString()

          break
        }
      } catch {
        /*
          Ignore unrelated logs.
        */
      }
    }
  }

  if (!commitmentId) {
    throw new Error(
      "Commit transaction succeeded, but commitment ID could not be recovered."
    )
  }

  return {
    commitmentId,

    roundId:
      roundId.toString(),

    bidder,

    name:
      params.name,

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
  }
}

/*
  ============================================================
  REAL REVEAL
  ============================================================

  Contract:

  reveal(
    commitmentId,
    label,
    bidWei,
    salt
  )
*/

export async function revealBid(
  commitment: Commitment
): Promise<{
  txHash: string

  valid?: boolean
}> {
  if (
    !commitment.commitmentId
  ) {
    throw new Error(
      "This saved bid does not contain a commitment ID."
    )
  }

  const contract =
    await getWriteContract()

  const bidWei =
    parseEther(
      commitment.amount
    )

  /*
    MetaMask opens here.
  */

  const tx =
    await contract.reveal(
      BigInt(
        commitment.commitmentId
      ),

      commitment.name,

      bidWei,

      commitment.salt
    )

  console.log(
    "Reveal submitted:",
    tx.hash
  )

  const receipt =
    await tx.wait()

  let valid:
    boolean | undefined

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
            parsed.args.valid

          break
        }
      } catch {
        /*
          Ignore unrelated logs.
        */
      }
    }
  }

  if (valid === false) {
    console.warn(
      "Reveal transaction succeeded, but the contract marked the bid as invalid."
    )
  }

  return {
    txHash:
      tx.hash,

    valid,
  }
}

/*
  ============================================================
  FINALIZE NAME
  ============================================================

  finalizeName() can be called by anyone
  after the round ends.

  The contract assigns ownership to the
  highest valid bidder.
*/

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
        /*
          Ignore unrelated logs.
        */
      }
    }
  }

  if (!owner) {
    throw new Error(
      "Domain was finalized, but owner could not be recovered."
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
  RESOLVE .ntu NAME
  ============================================================
*/

export async function resolveDomain(
  name: string
): Promise<string> {
  const contract =
    await getReadContract()

  const address:
    string =
    await contract.resolve(
      name
    )

  if (
    address === ZeroAddress
  ) {
    throw new Error(
      `${name}.ntu is not registered yet.`
    )
  }

  return address
}

/*
  ============================================================
  REAL PAYMENT
  ============================================================

  User enters:

      alice.ntu
      0.10 ETH

  Frontend:

      resolve("alice")
          ↓
      0xRecipient
          ↓
      signer.sendTransaction(...)
*/

export async function sendPayment(
  params: {
    name: string

    amount: string
  }
): Promise<{
  resolvedAddress: string

  txHash: string
}> {
  const provider =
    getProvider()

  const signer =
    await provider.getSigner()

  /*
    Resolve .ntu name first.
  */

  const resolvedAddress =
    await resolveDomain(
      params.name
    )

  const value =
    parseEther(
      params.amount
    )

  if (value <= 0n) {
    throw new Error(
      "Payment amount must be greater than zero."
    )
  }

  /*
    MetaMask opens here.
  */

  const tx =
    await signer.sendTransaction({
      to:
        resolvedAddress,

      value,
    })

  console.log(
    "Payment submitted:",
    tx.hash
  )

  await tx.wait()

  return {
    resolvedAddress,

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

export function formatTimeLeft(
  timestamp?: number
): string {
  if (!timestamp) {
    return "—"
  }

  const diff =
    Math.max(
      0,
      timestamp -
        Date.now()
    )

  const minutes =
    Math.floor(
      diff /
        60_000
    )

  const seconds =
    Math.floor(
      (diff %
        60_000) /
        1000
    )

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

/*
  ============================================================
  LABEL VALIDATION
  ============================================================

  Matches Person A's Solidity rules:

  - 1–32 bytes
  - lowercase a-z
  - digits 0-9
  - hyphens
  - cannot start/end with hyphen
*/

export function sanitizeLabel(
  value: string
): string {
  return value
    .toLowerCase()
    .replace(
      /\.ntu$/,
      ""
    )
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
    value.replace(
      /\.ntu$/,
      ""
    )

  if (
    label.length === 0
  ) {
    return {
      valid: false,

      error:
        "Enter a domain name.",
    }
  }

  /*
    Solidity checks bytes,
    not JavaScript character count.

    TextEncoder lets us apply the
    same UTF-8 byte-length rule.
  */

  const byteLength =
    new TextEncoder()
      .encode(label)
      .length

  if (
    byteLength > 32
  ) {
    return {
      valid: false,

      error:
        "Domain names cannot exceed 32 bytes.",
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
    !/^[a-z0-9-]+$/.test(
      label
    )
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