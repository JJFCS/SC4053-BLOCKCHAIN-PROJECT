# .ntu Domain Registrar Specification

Version: 0.5

Status: Implementation specification

## 1. Purpose

Build a decentralized domain registrar where users bid for unregistered `.ntu` names through a commit-and-reveal auction. The winning bidder owns the name and controls the Ethereum address it resolves to. The web application supports searching, bidding, resolution, and sending ETH to a registered name.

## 2. Scope

The application must support:

- Wallet connection and network checks.
- Domain search and registration status.
- Hidden bid commitments with ETH deposits.
- Bid reveals and highest-bid selection.
- Domain finalization and ownership records.
- Refund settlement, non-reveal penalties, and withdrawals.
- Forward resolution and owner-controlled address updates.
- ETH payments using a registered domain name.
- Local bid backup and recovery.

Registrations do not expire in this version. Renewals, subdomains, ownership transfers, resale, and browser DNS integration are outside the current scope.

## 3. Architecture

| Component | Technology | Responsibility |
| --- | --- | --- |
| Registrar contract | Solidity | Auctions, ownership, resolution records, deposit accounting, and checked payment forwarding. |
| Development environment | Hardhat | Compilation, local blockchain, deployment, and contract tests. |
| Web application | React and ethers | Wallet interaction, contract reads and writes, and domain payments. |
| Wallet | MetaMask | Account connection, transaction approval, and signing. |

The contract is the source of truth for ownership, balances, auction results, and deadlines. The frontend connects directly to the configured blockchain through the wallet and RPC provider. A separate application backend is not required.

Develop and test on a local network. Keep network settings configurable for Ethereum testnet deployment. Pin compatible compiler and package versions and commit the package lockfile.

## 4. Domain names

Store and hash the canonical label without the `.ntu` suffix. For example, `alice.ntu` uses the label `alice`.

A valid label:

- Contains 3-32 ASCII characters.
- Uses lowercase letters, digits, and hyphens only.
- Starts and ends with a letter or digit.
- Contains no spaces, dots, underscores, or other characters.

The frontend trims surrounding whitespace, lowercases ASCII letters, removes one trailing `.ntu`, and validates the result. The contract accepts canonical labels and independently validates them. Uppercase or otherwise invalid contract inputs must be rejected.

## 5. Configuration

| Setting | Default |
| --- | --- |
| Commit duration | 120 seconds |
| Reveal duration | 120 seconds |
| Fixed deposit, D | 0.1 ETH |
| Maximum bid | D |
| Minimum bid | 1 wei |
| Non-reveal penalty, P | 0.001 ETH |
| Commitments per wallet per round | 1 |
| Treasury | Nonzero address supplied at deployment |

These values use test funds during development. Keep durations, D, P, and treasury fixed after deployment. Require `0 < P < D` when deploying.

Each round has a start time, commit deadline, and reveal deadline:

- Commit: `startTime <= block.timestamp < commitEnd`.
- Reveal: `commitEnd <= block.timestamp < revealEnd`.
- Finalize and settle: `block.timestamp >= revealEnd`.

The frontend countdown follows chain timestamps. Contract checks determine whether a transaction is accepted.

## 6. Auction rules

1. A global round accepts commitments for different names without identifying those names during commit. Round IDs start at 1 and increase; 0 means no reservation.
2. Anyone may start the first round. A later round may start once the latest round's reveal deadline has passed, even if older domains still await finalization. Commit and reveal periods for different rounds do not overlap.
3. Keep commitments, auction results, settlement state, and pending-domain counts indexed by round. Old refunds and unfinished domains must not prevent new rounds.
4. Each wallet may submit one commitment per round. Different wallets may compete for the same domain.
5. A valid revealed bid must satisfy `0 < bidWei <= D`, match its stored commitment, and target a domain that is neither registered nor reserved by an earlier round.
6. The first valid reveal reserves the label for that round. Other valid bids committed in the same round may still reveal and compete for it. A later round cannot take that reservation.
7. The highest valid bid wins each domain. Equal bids are ranked by the earlier on-chain commit sequence, regardless of reveal order.
8. The winner pays its own bid amount. Valid losing bidders recover their full deposits, excluding transaction fees.
9. Ownership is assigned only after the reveal deadline and domain finalization. No valid reveals means no reservation or registration.
10. No administrator may override a winner, change another user's resolution record, or withdraw bidder escrow.

A domain has three states:

| State | Owner | Reserved round | Permitted use |
| --- | --- | --- | --- |
| Available | Zero address | 0 | May be targeted by a new commitment. |
| Reserved | Zero address | A nonzero round ID | Only commitments from that round may reveal for it; it awaits finalization after that round ends. |
| Registered | Nonzero address | 0 | Resolve, update its address as owner, and receive payments. |

Because the label is hidden during commit, the contract checks target eligibility during reveal. The frontend checks availability before commit. Reserving one domain must not block bidding on unrelated available names in later rounds.

Track the pending-domain count separately for each round. Finalize one domain per call without looping over all bidders or domains. Finalization of an older round must update that round's records without changing the latest round's deadlines or counters.

## 7. Contract operations

### 7.1 Start a round

`startRound()` creates the next nonzero round ID and records its start time and deadlines. Reject the call if the latest round has not reached its reveal deadline. Do not require older domains to be finalized before starting a new round.

### 7.2 Commit a bid

Generate a fresh, cryptographically random 32-byte salt in the browser. Compute the commitment locally using this exact field order and encoding:

```solidity
keccak256(abi.encode(
    uint256(chainId),
    address(registrarAddress),
    uint256(roundId),
    address(bidder),
    string(canonicalLabel),
    uint256(bidWei),
    bytes32(salt)
))
```

Call `commitBid(roundId, commitment)` during the commit phase with exactly D ETH.

The contract must:

- Verify that the round exists and is in its commit phase.
- Reject zero commitments, incorrect deposits, and a second commitment from the same wallet in that round.
- Store the commitment, deposit, bidder, and increasing commit sequence.
- Emit a commitment event containing no label, standalone label hash, bid amount, or salt.

The transaction arguments contain only the round ID and commitment. Secret inputs must not be sent to an on-chain hash helper or recorded in another transaction during commit.

D is identical for every bidder. Wallet addresses, deposits, timing, and participation remain public. Domain labels, bid amounts, and salts become public when revealed.

### 7.3 Reveal a bid

The original bidder calls `revealBid(roundId, label, bidWei, salt)` during the reveal phase.

The contract must verify:

- The round exists and is in its reveal phase.
- The caller has an unused commitment for that round.
- The label is canonical and has no registered owner.
- The label's reservation is either 0 or the same round ID. Reject a reservation belonging to any other round.
- The bid amount is within the allowed range.
- The commitment recomputed with the caller, current chain, current contract, round, label, amount, and salt matches the stored commitment.

Failed validation reverts without consuming the commitment. Correct details may be retried before the deadline. A successful reveal is consumed once and records the label and amount.

On the first valid reveal for a label, reserve it for this round and increment this round's pending-domain count. Update the highest bid and bidder according to the price and tie rules. Other valid reveals in the same round remain eligible. Do not assign ownership yet.

Reveals for registered names or names reserved by older rounds are rejected. A commitment that is never validly revealed before its deadline follows the non-reveal penalty policy.

### 7.4 Finalize a domain

After a round's reveal deadline, anyone may call `finalizeDomain(roundId, label)` for a domain with valid revealed bids.

The contract must:

- Reject early calls, missing auctions, repeated finalization, an existing owner, or a reservation that does not match `roundId`.
- Record the winning bidder as owner and set its initial resolution address to that winner.
- Clear the domain's reservation because it is now registered.
- Credit the winning bid to the treasury exactly once.
- Mark that round's domain auction finalized and decrement that round's pending-domain count.
- Emit the result without making external ETH calls.

Finalizing an older round must remain possible after newer rounds start. Work per call must be bounded independently of the total number of bidders or domains.

### 7.5 Settle deposits

A bidder calls `settleBid(roundId)` after that round's reveal deadline to settle its own deposit. A valid revealed bid requires its domain auction to be finalized first. An unrevealed commitment may settle without waiting for other domains.

| Outcome | Bidder withdrawal credit | Treasury credit |
| --- | --- | --- |
| Winner with bid B | D-B | B, already credited at finalization |
| Valid losing bidder | D | 0 |
| No valid reveal | D-P | P, credited during settlement |

Mark the commitment settled before creating credits. Reject missing commitments and repeated settlement. Settlement must not make external ETH calls. Do not credit the winning payment again when settling the winner. Starting later rounds must not erase or prevent earlier settlements.

### 7.6 Withdraw funds

`withdraw()` transfers the caller's available withdrawal credit to the caller.

- Reject withdrawals when no credit is available.
- Clear the credit before the external ETH call.
- Apply a reentrancy guard shared with the name-payment function.
- If the transfer fails, revert so the caller retains the credit.
- A failing recipient must not block other users, rounds, finalization, or settlement.

The treasury uses the same withdrawal mechanism and may withdraw only its credited proceeds. Never use the contract's entire balance as the treasury's allowance.

### 7.7 Resolve and update addresses

`ownerOf(label)` returns the owner of a valid canonical label or the zero address if unregistered.

`reservedRound(label)` returns the round holding its reservation, or 0 if available or registered.

`resolve(label)` returns its resolution address or the zero address if unregistered. A reserved name does not resolve to its leading bidder before finalization.

Only the owner may call `setAddress(label, target)`. Reject unregistered names, unauthorized callers, a zero target, and the registrar contract itself as target. Updating the resolution address does not change ownership.

### 7.8 Send ETH to a domain

`sendToDomain(label, expectedRecipient)` accepts the payment as `msg.value` and checks the name's current resolution within the same transaction.

- Require a valid registered label and `msg.value > 0`.
- Require a nonzero current resolution address equal to `expectedRecipient`, and reject the registrar contract itself as recipient.
- If the record changed after the user's preview, revert instead of sending to either the stale or newly changed address without confirmation.
- Forward exactly `msg.value` to the checked address using an ETH call, and require that call to succeed.
- Apply the reentrancy guard shared with `withdraw()`.
- Do not read the contract's entire balance as the payment amount, and do not alter bidder escrow, treasury credit, or withdrawal entitlements.
- If the recipient rejects ETH, revert the whole payment. A reverted payment must not create a deposit or refund credit.
- Emit a payment event containing the label, sender, actual recipient, and amount after a successful call.

This operation forwards the payment within one transaction; it does not retain payment balances. A receiver can execute code, so failed calls and cross-function reentrancy must be covered by tests.

## 8. Contract interface

```solidity
function startRound() external returns (uint256 roundId);
function commitBid(uint256 roundId, bytes32 commitment) external payable;
function revealBid(uint256 roundId, string calldata label, uint256 bidWei, bytes32 salt) external;
function finalizeDomain(uint256 roundId, string calldata label) external;
function settleBid(uint256 roundId) external;
function withdraw() external;
function ownerOf(string calldata label) external view returns (address);
function reservedRound(string calldata label) external view returns (uint256);
function resolve(string calldata label) external view returns (address);
function setAddress(string calldata label, address target) external;
function sendToDomain(string calldata label, address expectedRecipient) external payable;
```

Provide read access to:

- Latest round ID and timestamps for any recorded round.
- Deposit, penalty, treasury, and pending-domain count for a specified round.
- Commitment details, commit sequence, reveal status, and settlement status for a wallet and round.
- Highest revealed bid, bidder, and finalization status for a domain and round.
- Available withdrawal credit for an address.

Emit events for round creation, commitment, reveal, finalization, settlement, resolution updates, withdrawal, and domain payments. Include round IDs where relevant so the frontend can display historical bids and unfinished auctions. Labels and bid amounts may appear in reveal and finalization events, but must not appear in commitment events.

## 9. Frontend behaviour

### Wallet and network

Display the connected address and network. Refresh state on account or network changes. Disable write actions when no wallet is connected or the selected network has no configured deployment.

### Domain search

Display invalid, available, reserved, and registered states using the definitions in section 6. Show the reserved round for a pending name and the owner and resolution address for a registered name.

Check that a name is available before requesting a new commitment. Search uses read calls, not a transaction. During commit, hidden commitments cannot be enumerated by name, so an available name is not guaranteed to be uncontested. The RPC provider can observe read requests; the privacy requirement here concerns public on-chain commit data.

### Bidding and recovery

Before commit, display the bid amount, fixed deposit, penalty, and phase deadlines. Use integer wei and BigInt for calculations and hashing. The frontend must use standard ABI encoding matching `abi.encode`, followed by Keccak-256. Do not substitute packed encoding.

Use the following versioned JSON backup format:

| Field | Stored representation |
| --- | --- |
| `schemaVersion` | JSON integer 1. |
| `chainId` | Positive base-10 integer string. |
| `registrarAddress` | Valid nonzero 20-byte Ethereum address as a hex string. |
| `bidderAddress` | Valid nonzero 20-byte Ethereum address as a hex string. |
| `roundId` | Positive base-10 integer string. |
| `label` | Canonical label without `.ntu`. |
| `bidWei` | Positive base-10 integer string within the deposit limit. |
| `salt` | `0x` followed by exactly 64 hex digits. |
| `commitment` | `0x` followed by exactly 64 hex digits. |
| `commitTxHash` | Null before submission; transaction hash when available. |

Store uint256 values as decimal strings rather than JSON numbers or raw BigInt values. Parse them as BigInt on import, reject values outside uint256 bounds, and preserve the exact amount down to 1 wei.

Provide JSON export and import. Save the reveal record and require backup acknowledgement before requesting the commit transaction. After submission and confirmation, attach the transaction hash and confirmed status without discarding the original preimage.

On import:

1. Validate the schema version, required fields, label, integer ranges, and hex lengths.
2. Check the chain, contract, wallet, and round against the intended context.
3. Recompute the commitment from the imported label, amount, salt, and context. Require it to match the backup's commitment.
4. Before reveal, require that hash to match the commitment actually recorded on-chain for that wallet and round.
5. Reject a mismatch without replacing a valid saved record or sending a transaction.

Namespace local records by chain ID, registrar address, bidder address, and round ID. Refreshes and wallet/network switching must preserve other contexts and older rounds. Keep backups local, avoid logging salts, and never request private keys or seed phrases.

### Auction controls

Show the latest round phase and deadlines, own bid statuses across recorded rounds, reveal actions, results, finalization actions, settlement actions, and withdrawal credit. Display unfinished older rounds separately from the latest round. A new round can start when its timing condition is satisfied even if older domains are unfinished.

Show pending, confirmed, rejected, and failed transaction states with readable errors. Use emitted round IDs and contract reads to recover results after refresh.

### Send ETH by name

1. Validate and normalize the name and parse the amount from a decimal string into integer wei. Reject zero or negative amounts, malformed input, and amounts needing more than 18 decimal places.
2. Resolve the name on the selected chain and reject unregistered or reserved names and a zero destination.
3. Display the full recipient address, amount, and network for confirmation.
4. Call `sendToDomain(label, displayedRecipient)` with the payment as transaction value. Do not use a separate direct ETH transfer for the name-payment action.
5. If the recipient record has changed, show the failure, refresh the address, and require a new confirmation before retrying. Never silently retry with a different recipient.
6. Show the transaction hash, confirmation state, and successful payment event.

The contract validates the displayed recipient at execution time and forwards the exact payment or reverts. Transaction fees are separate; a failed transaction can still consume gas.

## 10. Security requirements

- Enforce phase, ownership, reservation, input, and deposit checks in the contract.
- Bind commitments to the bidder, round, contract, and chain.
- Use fresh random salts and identical standard ABI encoding in the frontend and contract.
- Prevent repeated reveals, settlements, finalizations, and withdrawals.
- Protect older reservations while allowing unrelated later-round auctions to proceed.
- Keep refundable deposits separate from treasury proceeds in accounting.
- Use checks-effects-interactions and a shared reentrancy guard for withdrawal and payment forwarding.
- Avoid external ETH calls during reveal, finalization, and settlement.
- Forward only the current payment's `msg.value`; never expose existing escrow through the payment function.
- Reject a changed recipient before making the payment call.
- Avoid unbounded loops over bidders or domains in state-changing functions.
- Treat the contract balance as at least its outstanding liabilities; unsolicited ETH must not break accounting.
- Preserve exact integer values in saved bid data and verify imported preimages against on-chain commitments.
- Use test accounts and test funds during development. Keep keys and reveal backups out of source control.

## 11. Acceptance criteria

| Check | Expected result |
| --- | --- |
| Different wallets bid for one domain | Highest valid bid wins after the reveal deadline. |
| Different domains share a round | Results, ownership, and deposits remain independent. |
| Equal bids reveal in reverse order | Earlier commit sequence wins. |
| Wrong label, bid, salt, or caller | Reveal fails without consuming the correct bidder's commitment. |
| Copied commitment or wrong chain, contract, or round | Cannot produce a valid reveal in the wrong context. |
| Exact deadline boundaries | Commit, reveal, finalize, and settle follow section 5. |
| Incorrect deposit or duplicate operation | Rejected without duplicate ownership or credit. |
| Invalid name or out-of-range bid | Rejected by the contract even when bypassing the UI. |
| Winner, loser, and missing reveal | Refunds and treasury credits match section 7.5, including bid = D. |
| No valid reveals | No owner or reservation created; expired deposits remain settleable. |
| New round while an older domain is unfinished | New round starts after the timing condition; an unrelated available name can receive valid bids. |
| Later round targets an older reserved name | Reveal fails; the older reservation and eventual winner remain unchanged. |
| Multiple bidders reveal in the reserved round | Same-round competition works; the reservation does not reject later valid reveals from that round. |
| Older domain finalizes after a new round starts | Correct older winner is registered; only the older pending count changes. |
| Earlier settlements and withdrawals after later rounds start | Old entitlements remain claimable exactly once. |
| Recipient rejects ETH or attempts reentrancy | No excess withdrawal or escrow loss; unrelated users and rounds remain usable. |
| Commit transaction inspection | No label, standalone label hash, bid amount, or salt in its inputs or events. |
| Frontend/contract commitment conformance | Dummy test vectors produce identical hashes using the specified standard ABI encoding. |
| Unauthorized or invalid address update | Reject non-owners, zero targets, and the registrar as target; a valid owner update preserves ownership. |
| Backup round trip using `30000000000000001` wei | The exact integer survives export/import with no rounding. |
| Modified backup fields or mismatched stored commitment | Import or reveal preparation is blocked without a transaction. |
| Refresh, wallet/network switching, and new rounds | Context-specific backups remain recoverable; wrong contexts are blocked. |
| Name recipient changes after preview | Payment reverts; no ETH payment or escrow change occurs; gas may still be charged. |
| Recipient matches preview | Exact `msg.value` reaches that recipient and a correct payment event is emitted. |
| Payment receiver rejects ETH | Entire payment reverts; it does not become registrar escrow or withdrawal credit. |
| Zero payment, unknown name, or reserved name | Payment is blocked in the UI and rejected by the contract. |
| Successful payment alongside locked auction funds | Bidder and treasury entitlements are unchanged; only the new payment is forwarded. |
| Different settlement and withdrawal orders | Escrow remains sufficient and every entitlement is credited once. |
| Fresh installation and deployment | README instructions reproduce the working application. |

Automate contract checks, including exact time boundaries, old/new round interactions, stale-recipient payments, and malicious receivers. Check wallet, recovery, and payment flows in the browser. Retain commands, actual results, and the code revision needed to reproduce failures and verify fixes.

## 12. Deployment and documentation

Provide deployment scripts, an example environment configuration without secrets, and a README covering installation, compilation, testing, deployment, wallet setup, and frontend startup.

Record chain IDs, deployment addresses, and compatible contract ABIs in the frontend configuration. A local redeployment must update the frontend's contract address and ABI.

The application must run from a fresh checkout using the documented prerequisites and commands. Include known limitations and the configured auction timings, deposits, and penalties.

### Project completion checklist

The specification defines intended work. Complete the following implementation, validation, and submission items before treating the project as finished:

- [ ] Implement the baseline contract and frontend features in sections 2-10.
- [ ] Run the acceptance checks in section 11 against the actual code, record results, and fix observed failures. Record any unresolved limitations.
- [ ] Verify that a fresh installation can deploy the contracts and run the frontend using the README.
- [ ] Record design decisions, version history, issues, fixes, test commands, and validation evidence throughout development.
- [ ] Complete the separate audit report using the actual development history and test evidence.
- [ ] Package the complete codebase as `GroupName.zip`, including source code, required assets, dependency manifests and lockfiles, deployment and test scripts, example configuration, README, specification, report, and relevant evidence. Exclude private keys, seed phrases, live reveal backups, and credentials.
- [ ] Produce `GroupName.mp4`, or a hosted video URL, with a duration of at most 10 minutes. Start with an architecture/design introduction, then demonstrate the deployed application through the required user flows. Include competing bids, reveal, finalization, resolution, and an ETH payment by name.
- [ ] Submit the codebase and video through their respective submission portals. The posted deadline is 8 November 2026, 11:59 pm, Singapore time.
- [ ] Complete the mandatory individual peer evaluation using the course instructions.

Local deployment and demonstration are permitted by the posted submission instructions. The domain-registrar description also refers to an Ethereum testnet. Document the actual network used; provide testnet configuration when deploying there. Record real deployment addresses and transaction references rather than example values as evidence.

### Separate audit report

Prepare the required audit report separately, following the official headings and evidence requirements in the project brief. Cover initial scope, development methods and tooling, specification and development records, initial architecture, discovered issues, validation, improvements, and lessons learned.

For major findings, explain the likely cause, impact, change made, and evidence that the resolution works. Distinguish observed failures, possible risks, and unperformed tests. Keep process disclosures and detailed development history in that report.

## 13. Optional extension: reverse resolution

Support an address selecting one of its owned domains as its primary `.ntu` name. Reject attempts to select another address's domain. An address without a primary name returns an empty result. Forward resolution continues to work independently of this extension.
