# DomainRegistrar integration interface

Contract revision: cb1f3c4b5bbc04326804089d30991dc69c6a2f60 (PR #11).
Specification: v0.5, reproduced in docs/SPEC.md.
The handoff patch changes specification/interface files and adds an ABI export utility.
The ABI below comes directly from the Solidity 0.8.34 compiler artifact.

## Start here

- Frontend integration: use contracts/abi/DomainRegistrar.json with the deployed address and chain ID, and use the canonical round-based operations below.
- Deployment: deploy DomainRegistrar with one nonzero treasuryAddress constructor argument. Publish the real address, chain ID, deployment transaction, constructor argument, source revision, and matching ABI to the team.
- Contract maintenance: support integration questions and address observed contract failures against this interface.

A deployment starts with getCurrentRound() equal to 0. Deployment does not start an auction. Anyone may call startRound() when the first auction is ready. Each later round also requires an explicit start after the previous reveal deadline.

## Configuration

| Item | Value |
| --- | --- |
| Constructor | constructor(address treasuryAddress), nonpayable |
| Label | Canonical 3-32 ASCII characters without the .ntu suffix |
| Commit duration | 120 seconds |
| Reveal duration | 120 seconds |
| Fixed deposit D | 100000000000000000 wei, or 0.1 ETH |
| Minimum bid | 1 wei |
| Maximum bid | D |
| Non-reveal penalty P | 1000000000000000 wei, or 0.001 ETH |
| Wallet limit | One commitment per wallet per round |
| Treasury | Nonzero address supplied at deployment; immutable |

Read configured values from the deployed contract. The contract exposes COMMIT_DEPOSIT(), NON_REVEAL_PENALTY(), treasury(), and the per-round view fields. Keep IDs, wei, and timestamps as bigint when interacting with ethers. Keep uint256 values as decimal strings in JSON backups.

## Canonical transactions

All label arguments are canonical labels such as alice, without .ntu.

| Operation | Caller | Preconditions and result |
| --- | --- | --- |
| startRound() | Anyone | Previous latest round ended, or none exists. Emits RoundStarted; Solidity returns roundId. |
| commitBid(roundId, digest) | Bidder | Latest started round in commit phase; exactly D as transaction value; nonzero digest; wallet has no prior commitment in that round. |
| revealBid(roundId, label, bidWei, salt) | Original bidder | Reveal phase; matching commitment; eligible name; bid between 1 wei and D. Emits CommitmentRevealed. |
| finalizeDomain(roundId, label) | Anyone | Reveal deadline reached and domain has valid bids. Records ownership and initial resolution, credits treasury price, and clears reservation. Solidity returns owner. |
| settleBid(roundId) | Original bidder | Reveal deadline reached. Valid reveals require their domain to be finalized; an unrevealed bid does not. Creates withdrawal credit. |
| withdraw() | Credit holder | Pays all currently available caller credit to the caller; reverts when credit is zero. Emits Withdrawn. |
| setAddress(label, target) | Domain owner | Registered domain; target is neither zero nor the registrar itself. Ownership remains unchanged. |
| sendToDomain(label, expectedRecipient) | Payer | Registered name, nonzero value, and current resolution equals the address the user confirmed. Forwards exactly transaction value. |

With ethers, a write returns a transaction response. Wait for its receipt and read events/views; do not treat a Solidity return value as the result of a submitted transaction. In particular, obtain created round and commitment IDs from confirmed events or getters.

## Round and domain state

Check getCurrentRound() before getRound(). If the latest ID is 0, no round exists; getRound(0) and getRound(1) then revert.

The latest round ID stays unchanged after its deadline until startRound() is called. Use its phase and timestamps to distinguish an active round from an ended one. Query historical round IDs explicitly.

| Phase number | Name | Meaning |
| --- | --- | --- |
| 0 | NotStarted | Enum value; deployment instead exposes latest round ID 0 with no recorded round to query. |
| 1 | Commit | startTime <= block.timestamp < commitEnd |
| 2 | Reveal | commitEnd <= block.timestamp < revealEnd |
| 3 | Ended | block.timestamp >= revealEnd |

Use chain timestamps for countdowns. Transactions are accepted according to the timestamp of their mined block.

Classify a valid label by ownerOf(label) and reservedRound(label): nonzero owner means registered; otherwise a nonzero reserved round means reserved; otherwise available. Hidden commitments do not reserve labels, so available does not mean uncontested.

A reserved label resolves to zero until finalization. Keep the old reserved round on screen even when a newer round is active. A newer round can use unrelated available labels; it cannot replace an older reservation or registration.

## Reads for the UI

| Read | Meaning |
| --- | --- |
| getCurrentRound() | Latest explicitly started round ID, including an ended latest round; 0 before the first round. |
| getRound(roundId) | Schedule, calculated phase, pending count, deposit, penalty, and treasury for a recorded round. |
| getCommitmentId(roundId, bidder) | Global commitment ID for that wallet/round; 0 if no commitment. Unknown round reverts. |
| getCommitmentForRound(roundId, bidder) | CommitmentInfo for that wallet/round. A wallet with no commitment in an existing round gets a zero-filled record. |
| getCommitment(commitmentId) | CommitmentInfo by global sequence ID; missing ID reverts. |
| getAuctionForRound(roundId, label) | AuctionInfo for the specified historical round and canonical label. No auction gives a zero-filled record. |
| ownerOf(label) | Owner or zero; validates the label. |
| reservedRound(label) | Reservation round or zero; validates the label. |
| resolve(label) | Current payment recipient or zero; validates the label. |
| getDomain(label) | DomainInfo; no domain gives a zero-filled record. This older aggregate helper does not validate label syntax. |
| getAuction(label) | AuctionInfo selected from the active reservation or registered history. This older aggregate helper does not validate label syntax. Prefer getAuctionForRound for historical screens. |
| withdrawalCredits(account) | Total currently withdrawable credit for the account across all settled refunds and credited proceeds. |
| totalLockedDeposits() | Deposits still locked, excluding prices already allocated at finalization. |
| totalWithdrawalCredits() | Sum of all outstanding account credits. |
| commitmentCount() | Latest global commitment ID/commit sequence. |

## Returned record fields

The following field order and types are copied from the compiled ABI. Use named properties in ethers when possible.

### RoundInfo from getRound

| Field | ABI type |
| --- | --- |
| startTime | uint256 |
| commitEnd | uint256 |
| revealEnd | uint256 |
| phase | uint8 |
| pendingDomainCount | uint256 |
| deposit | uint256 |
| nonRevealPenalty | uint256 |
| treasury | address |

### CommitmentInfo from getCommitmentForRound

| Field | ABI type |
| --- | --- |
| bidder | address |
| digest | bytes32 |
| roundId | uint256 |
| deposit | uint256 |
| revealed | bool |
| valid | bool |
| labelHash | bytes32 |
| bidWei | uint256 |
| settled | bool |

### AuctionInfo from getAuctionForRound

| Field | ABI type |
| --- | --- |
| roundId | uint256 |
| winningCommitmentId | uint256 |
| highestBidder | address |
| highestBidWei | uint256 |
| finalized | bool |

### DomainInfo from getDomain

| Field | ABI type |
| --- | --- |
| owner | address |
| roundId | uint256 |
| winningCommitmentId | uint256 |
| priceWei | uint256 |
| resolutionAddress | address |

## Commitment hashing and backups

Generate a fresh cryptographically random 32-byte salt in the browser for every real bid. Calculate the digest locally using standard ABI encoding and Keccak-256 in exactly this field order:

~~~ts
const digest = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
  ["uint256", "address", "uint256", "address", "string", "uint256", "bytes32"],
  [chainId, registrarAddress, roundId, bidderAddress, label, bidWei, salt],
));
~~~

Use standard ABI encoding, rather than packed encoding. Keep the bidder, chain, registrar, round, canonical label, exact bid, and salt together as the preimage.

The contract exposes computeCommitment() for conformance checks. Calculate real commitments in the browser: sending real preimages to an RPC helper exposes those inputs to that RPC service, and sending them in a transaction publishes them. Existing tests call the helper with dummy test data.

Store/export the full version-1 backup before requesting commit approval, including decimal-string uint256 fields. On import, validate the schema and context, recompute the digest, and compare it to the recorded wallet/round commitment before revealing. Full backup requirements are in docs/SPEC.md section 9.

Test references:
- contracts/test/DomainRegistrar.ts:13 compares ethers and Solidity hashing.
- contracts/test/DomainRegistrarBidRules.ts:37 inspects commit calldata and event fields.
- contracts/test/DomainRegistrarBidRules.ts:80 uses a bid beyond Number's exact integer range.
- contracts/test/DomainRegistrarAccounting.ts:36 preserves 30000000000000001 wei exactly.

These contract tests do not verify the future browser's backup export/import implementation.

## Settlement and withdrawals

The winner's price is credited to the treasury during finalization. Winner settlement credits only D minus bid; it does not credit the price again. Valid losers get D. Unrevealed commitments get D minus P, and P is credited to the treasury during settlement.

Valid winners and losers must wait for domain finalization before settlement. Unrevealed commitments may settle after their own reveal deadline even when other domains are pending. Settlement is performed by the recorded bidder.

After settlement, call withdraw() separately if the account has positive credit. A winner bidding exactly D has zero refund; settlement still succeeds and the UI should not require a zero-credit withdrawal. Withdrawn has no round parameter because one withdrawal pays the account's combined current credit.

A treasury address may also be a bidder. Its auction refund and credited treasury proceeds share the same withdrawalCredits balance. Treasury credit may be withdrawn before bidders settle their remaining refunds.

A failed withdrawal reverts and preserves the credit. A rejecting wallet does not stop unrelated operations. Credits created during a withdrawal callback remain available afterward.

The accounting relation is contract balance >= totalLockedDeposits() + totalWithdrawalCredits(). Extra unsolicited ETH does not enlarge anyone's entitlement.

## Domain payments

1. Normalize and validate the name. Parse the user's decimal amount directly into integer wei.
2. Read resolve(label) on the selected deployment.
3. Display the full recipient, network, and amount and obtain the user's confirmation.
4. Call sendToDomain(label, displayedRecipient) with the amount as transaction value.
5. Wait for the receipt and DomainPayment event.
6. On RECIPIENT CHANGED, refresh the recipient and request a new confirmation before any retry.

An ETH call failure reverts the entire payment. It creates neither auction escrow nor withdrawal credit. A successful payment forwards exactly the new transaction value while preserving pre-existing escrow and credit.

## Earlier compatibility operations

The full ABI retains older names. New UI code should consistently use the canonical operations above.

| Earlier operation | Relationship |
| --- | --- |
| commit(roundId, digest) | Same commit checks; Solidity returns a global commitmentId. |
| reveal(commitmentId, label, bidWei, salt) | Uses a global commitment ID, not a round ID. Same reveal checks; Solidity returns true on success. |
| finalizeName(label) | Selects the reserved or registered round; uses the same finalization implementation. |
| settleCommit(commitmentId) | Uses a global commitment ID and still requires the original bidder. Solidity returns refundWei and proceedsWei. |
| withdrawRefund() | Uses the caller's same combined withdrawal credit and shared guard; it is not a separate refund pool. |
| withdrawTreasury() | Requires the treasury caller, then uses that caller's same combined credit and shared guard. |

Do not confuse global commitment IDs with round IDs. A winning settlement's proceedsWei is zero because the winning price was credited during finalization; read DomainFinalized or DomainInfo for that price.

## Events

Indexed parameters below are suitable for event filters. Fields and their order are generated from the ABI.

~~~solidity
event AddressUpdated(bytes32 indexed labelHash, address indexed owner, address indexed target, string label);
event CommitmentRevealed(uint256 indexed commitmentId, uint256 indexed roundId, address indexed bidder, string label, uint256 bidWei, bool valid);
event CommitmentSettled(uint256 indexed commitmentId, uint256 indexed roundId, address indexed bidder, uint256 refundWei, uint256 proceedsWei);
event CommitmentSubmitted(uint256 indexed commitmentId, uint256 indexed roundId, address indexed bidder, bytes32 digest);
event DomainFinalized(bytes32 indexed labelHash, uint256 indexed roundId, address indexed owner, string label, uint256 winningCommitmentId, uint256 priceWei);
event DomainPayment(bytes32 indexed labelHash, address indexed sender, address indexed recipient, string label, uint256 amountWei);
event RoundStarted(uint256 indexed roundId, address indexed starter, uint256 startTime, uint256 commitEnd, uint256 revealEnd);
event Withdrawn(address indexed account, uint256 amountWei);
~~~

CommitmentSubmitted contains only commitmentId, roundId, bidder, and digest. Labels, standalone label hashes, bid amounts, and salts are absent. CommitmentSettled.proceedsWei reports proceeds created by that settlement, not the winning price previously credited at finalization.

## Reverts

The contract uses Error(string), not custom errors. Surface a readable reason and refresh affected chain state after a failed transaction. The compiled ABI therefore contains no custom-error entries.

These are the exact require-message strings in this revision:

- ALREADY COMMITTED
- ALREADY FINALIZED
- ALREADY REGISTERED
- ALREADY REVEALED
- ALREADY SETTLED
- COMMITMENT MISMATCH
- DOMAIN NOT FINALIZED
- EMPTY COMMITMENT
- ETH TRANSFER FAILED
- INCORRECT DEPOSIT
- INVALID BID
- INVALID COMMITMENT
- INVALID LABEL
- INVALID PENALTY
- INVALID ROUND
- INVALID TARGET
- NAME RESERVED
- NO COMMITMENT
- NO CREDIT
- NO WINNING BID
- NOT BIDDER
- NOT COMMIT PHASE
- NOT OWNER
- NOT REVEAL PHASE
- NOT TREASURY
- RECIPIENT CHANGED
- REENTRANT WITHDRAWAL
- ROUND NOT ENDED
- UNREGISTERED NAME
- WRONG RESERVATION
- WRONG ROUND
- ZERO ADDRESS
- ZERO PAYMENT
- ZERO TREASURY

## Generate the ABI after a contract change

From the contracts directory:

~~~bash
npx hardhat build
node scripts/export-registrar-abi.mjs
~~~

The exporter writes a bare ABI array to abi/DomainRegistrar.json. It does not include bytecode, addresses, or private configuration. It exports the existing compiler artifact, so build after changing the contract before exporting. Publish the regenerated ABI and matching deployed address together.

## Integration acceptance still required

Browser acceptance should demonstrate the full wallet, normalization, backup/export/import, old-round status, finalization, settlement, withdrawal, address update, and stale-recipient payment flows in a browser.

Deployment validation should deploy the actual DomainRegistrar, record its constructor argument/address/chain, verify a clean setup, run independent security/integration checks, and retain deployment/transaction evidence.

The original main snapshot contained the Vite starter and Counter deployment example. The integration base now includes the frontend and registrar deployment additions. Remaining report, browser acceptance and demo requirements are tracked in REQUIREMENTS_COVERAGE.md.
