# AI Audit Report: .ntu Domain Registrar

Review through 5 November 2026 (Singapore time). Contract base `cb1f3c4`, frontend revision `b753e49`, and registrar-validation base `67f8874` identify the earlier reviewed inputs. Commit `7eaebed` first integrated frontend corrections and this report. Code revision `e63143b` was merged into main by PR #12 as `cc7e309`; its fresh local browser check is described below. Automated tests, supplied terminal output and manual browser observations are distinguished.

## 1. Initial Specification & System Scope

The team selected Option 3: a `.ntu` registrar in which users search for a name, submit a hidden bid with a deposit, reveal it within a deadline, and register the name to the highest valid bidder. A registered name resolves to an Ethereum address and can be used to send ETH through a wallet-connected web application. Short auction phases and a non-reveal penalty are within scope.

`docs/SPEC.md` expands this into 120-second commit and reveal windows, a 0.1 ETH deposit, a 0.001 ETH penalty, one commitment per wallet per round, earlier-commit tie breaking, independent later rounds, pull-based refunds, owner-controlled resolution, checked payment forwarding and versioned local bid backups. These are choices in the AI-assisted working specification. No separate record of every requirement *before* AI use was available, so this report does not claim otherwise. Expiry, renewal, transfers, resale and reverse resolution were excluded or optional.

The contract controls deadlines, bids, ownership and funds. The frontend prepares transactions and stores reveal preimages locally; the ABI and configured chain/address join the layers.

## 2. Development Methodology & AI Tooling Infrastructure

The repository has Solidity/Hardhat 3 contracts and tests, a React/Vite frontend with ethers v6 and MetaMask, a compiled ABI, deployment and validation scripts, and the specification. Contract implementation progressed on main; frontend work was on `feature/frontend-wallet`; integration, independent validation, deployment and documentation were on `feature/registrar-validation`. Git revisions and test records support the development account below.

ChatGPT/Codex assisted the independent validation: comparing revisions against the specification and ABI, constructing tests and frontend corrections, executing checks in a separate copy, and drafting reviewable code and documentation patches. The team member exercised the application in a Windows checkout, reported browser defects, and verified the corrections.

The infrastructure includes `scripts/validate.mjs` (build, ABI export, typecheck and tests), local and Sepolia deployment/verification scripts, an HTTP local smoke scenario, a historical frontend reproduction harness, and `test/FrontendCurrentFlow.ts` for the corrected handler. The compiler ABI and `docs/CONTRACT_INTERFACE.md` make frontend bindings checkable. Source revisions and earlier output are listed in `SOURCE_REVISIONS.md` and `VALIDATION.md`.

## 3. Specification Engineering & Prompt Logs

`docs/SPEC.md` gives method signatures, exact commitment encoding, state transitions, accounting, recovery schema and 29 acceptance checks. Review context included the brief, specification, source revisions, ABI, package/config files, existing tests and failing outputs. The table records technical development iterations and their validation evidence:

| Iteration | Technical task | Result and next check |
| --- | --- | --- |
| Interface/deployment | Compare registrar source and compiler ABI with the spec; make local and testnet deployment independently verifiable. | Added ABI export, deployment/verification and evidence binding; checked local HTTP and Sepolia outputs against actual chain, code and treasury. |
| Frontend revision review | Reproduce handler/contract mismatches in the older captured revision, then recheck against the newer frontend. | Historical short-label, round-zero, reservation, owner/recipient and direct-payment errors were reproduced; several were already corrected in the newer revision. |
| Bid recovery | Browser import lost on-chain IDs and commit times. Reconcile imported records with chain state and preserve exact amounts. | Import repair restored #1/#2. Later work added scoped storage, digest checks and preapproval backup preparation; #7 exact-wei import and five negative variants were observed. |
| Network/payment | Diagnose `BAD_DATA` when the site wallet used Sepolia with a local contract address; require recipient/amount/network review before payment. | Added expected-chain/code checks and two-step preview. Visible wrong-chain warning, blocked search/write actions, declined payment and successful fresh payment were observed; automated stale-recipient rejection passed. |
| Regression | Test the current handler with a rejected approval, exact integer bid, stale address and subsequent fresh payment. | `FrontendCurrentFlow.ts` passed in the 180-test run; subsequent browser observations are recorded in `BROWSER_ACCEPTANCE.md`. |

## 4. AI-Generated Architecture

The reviewed system has one `DomainRegistrar` contract and no application backend. It records round schedules, bidder commitments, name auctions per round, ownership and resolution, withdrawal credits and liabilities. A commitment hashes the chain, registrar, round, bidder, canonical label, integer bid and random salt with standard ABI encoding. Commit exposes the round, digest and fixed deposit; reveal verifies the preimage and ranks valid bids. Highest bid wins, with earlier on-chain commit order breaking ties. After the deadline anyone can finalize. Bidders settle and withdraw their own credits; the treasury withdraws only credited proceeds.

The React frontend uses MetaMask through ethers to show state, prepare a salt and backup, and request transactions. `sendToDomain` checks the displayed expected recipient against current resolution in the same transaction and forwards only `msg.value`; ownership remains separate from the receiving address. The reviewed ABI has 48 entries. The original integrated frontend lacked complete backup context, expected-chain checks and a separate payment confirmation; later corrections address these gaps.

## 5. Problems Discovered & Vulnerability Analysis

No new reproducible Solidity logic vulnerability was identified. Existing adversarial tests cover reentrancy, authorization, deadline boundaries, refunds and escrow. That does not prove the absence of other vulnerabilities. The causes below are **inferences from source and revisions**.

### FE-07 — Bid backup and pending receipt recovery

**Cause and impact.** Import originally lost on-chain IDs and commit times. Shared storage and saving only after the receipt could leave a paid bid without its reveal preimage, exposing it to the non-reveal penalty. A pending transaction survived reload but was still labeled Submitted after a failed receipt.

**Correction.** Save and download the preimage before wallet approval; scope it by chain, registrar, wallet and round; validate the digest and reconcile imported IDs, times and transaction receipts against the chain. A failed receipt is labeled Commit failed without erasing the preimage.

**Evidence.** Import restored #1/#2 IDs and times. Exact `30000000000000001` wei and negative imports were observed; a rejected MetaMask request kept a prepared record. A failed round #2 pending commit changed to Commit failed after the correction. Separately, a fresh-chain round #6 pending 0.02 ETH bid survived reload and reconciled to commitment #2 after controlled mining. The final `e63143b` browser run restored a prepared backup, recovered a pending transaction across reload, and re-imported a settled bid with its original time. The final-source EVM test covers failed-transaction backup and RPC receipt interruption after broadcast. The reason for the earlier round #2 revert was not established.

### FE-09 — Wrong-network handling

Without a configured-chain comparison, a local contract address queried on Sepolia returned opaque `BAD_DATA` and the fixed navbar label was wrong. The correction checks chain and deployed code before reads or writes and displays the wallet's actual network. With the wallet on 11155111 and the registrar configured for 31337, the browser showed the mismatch, blocked Search and made writes unavailable; the local navbar showed Hardhat Local. No wrong-chain transaction was attempted.

### FE-06 — Payment confirmation and stale recipient

The earlier UI invoked the checked contract method but sent without a separate full recipient, amount and network review. The correction adds an explicit preview, binds the expected recipient and requires fresh review after a change. The browser showed the complete address, 0.001 ETH and chain 31337. The current-handler EVM test rejected a stale recipient and succeeded after a new preview. In a later browser check, resolution changed in another tab after preview; confirmation of the old address failed with the recipient-changed error. A new preview showed the changed address and the UI reported a successful 0.001 ETH payment (`0xfdb826…d55e5f`).

### FE-10 — Invalid name input

The original field silently removed an underscore, hiding that the target changed. The corrected field keeps invalid text visible for validation. The browser retained `bad_name` and rejected Search with the syntax message. No wrong-name transaction was observed.

### FE-11 — Phase clock and transaction deadlines

The frontend compared chain deadlines with the computer clock. After local time changes it showed 7m54s in a 120-second reveal window and offered a Reveal action that the contract rejected. An initial clock correction then showed Reveal at 0s while the latest block was five seconds before its deadline. The follow-up anchors estimates to block time, shows Awaiting chain block at the estimated boundary, refreshes state, and rechecks before requesting a reveal transaction. Round #3's unrevealed bid was settled and withdrawn; a later browser run transitioned from Awaiting chain block to Round ended after a new block. Round #6's reveal mined one second before the deadline succeeded. Inclusion time remains authoritative, so a transaction submitted near a deadline can still fail if mined later.

### FE-01 — Production build

An unused icon and orphan UI component with unresolved imports prevented the production build. Removing those unused files/imports allowed the TypeScript/Vite build to pass on later checks. The bundle-size warning does not fail the build.

### DEP-01 — Development dependency advisories

Transitive tooling packages retained security advisories. A compatible update was validated and reduced an earlier count of 22 affected entries. The 1 November audit still reported **13 high and 5 moderate affected package entries**, recorded in `evidence/audit-summary-2026-11-01.json`; the high entries propagate from Zod through Hardhat tools. A forced major-version migration was deferred because it could disrupt Hardhat compatibility and would require a separate migration and full validation pass. No on-chain exploit was demonstrated. The remaining tooling risk is disclosed rather than described as remediated.

### DEPLOY-02 — Compiler metadata across checkouts

The verifier normalizes source for its source hash, but CRLF and LF compiler inputs change Solidity metadata and creation data. The correction records the original line ending and replays the pinned 0.8.34 compiler input and forge-std remapping when a checkout's artifact differs. An offline LF-checkout test reconstructed the Sepolia record's exact creation hash (`0x2694ea5c…bff`); the focused integration test passed. The separate Sepolia network verification succeeded on Windows. Public-RPC verification from the LF checkout was not performed.

FE-02 through FE-05 were historical errors in `7217ac7` already corrected by the later frontend. Version-specific reproductions and limits are in `FRONTEND_FINDINGS.md` and `history/frontend-7217ac7.md`.

## 6. Validation Process & Testing Strategy

An isolated Linux run recorded 176 baseline named tests and 179 after interface/deployment/flow tests. With the current-handler integration test added, the Windows terminal reported **180 passing (153 Solidity, 27 Mocha)**; the frontend TypeScript/Vite production build passed. Five named tests are Counter examples. A separate clean local clone of `67f8874` plus reviewable patches installed both lockfiles offline, passed 180 tests and frontend build, deployed/verified a new local registrar, ran the local smoke scenario and served Vite's HTML with matching chain/address settings. This reproduced the README command path on that earlier integrated revision.

The registrar was deployed to Sepolia chain 11155111 at `0x9dbe733cDB4F8BBB6a960177c2c3bB7E005819F9`, transaction `0xb07b99bb1b8e63c1610ab77b9103f1665045a837eb70cd684ca3157915d55408`. The separate verification command reported `verified: true` and round zero. This is deployment evidence, not Sepolia browser acceptance.

Local smoke and manual browser checks covered competing bids, later-round interaction, missing reveal, winner/loser/zero refunds, withdrawals, address updates, checked payment and exact-wei backup import. Browser rounds #3/#4 showed higher bid and earlier-commit tie outcomes; round #5 had two independent names and exact `69999999999999999` wei refund for #7. Parsed #7/#8 commit transactions had two arguments, 68 calldata bytes, fixed deposits and no label/bid/salt in calldata or events. Round #6 #9 was revealed and remained visible after page reload before wallet reconnection, then was reported finalized and settled. A prior 0.01 ETH name payment reached its recipient. The revised two-step preview was tested with both a canceled request and a successful 0.001 ETH browser payment. Round #7 canceled before MetaMask and remained Prepared, not submitted after reload, with older records intact. A site-wallet switch to Sepolia while the configured registrar remained on local chain 31337 displayed a visible wrong-network warning and blocked search and write actions. `BROWSER_ACCEPTANCE.md` records the local browser observations.

The current-handler test verifies preapproval callback, wallet rejection with no on-chain commit, wrong-chain blocking, stale-recipient rejection and fresh successful payment. Browser observations separately exercise MetaMask and the UI. Archived handler probes deliberately reproduce obsolete errors; the supplied terminal output and browser observations are identified by origin throughout the report.

A later fresh-chain round #6 exercised successful pending-commit recovery in
the browser: with automining paused, a submitted 0.02 ETH bid survived reload
without an ID, then a block mined at `commitEnd - 1` confirmed commitment #2
and the browser restored its ID. The reveal transaction was mined at
`revealEnd - 1` with receipt status 1 and `revealed: true`. Direct reads
confirmed finalization to the bidder, `settled: true`, a 0.08 ETH refund
credit and a zero credit after withdrawal. MetaMask displayed failed-
transaction notifications during this run. Its latest Failed Activity entry
was a previous round #5 commit `0xa7adb21b29c5c4de40a169c77bac0c0b95c5723d834f69eef75c2b8c9fef7188`
(receipt status 0); the round #6 commit `0x85164ee8367293a094014ed61018e06f598124928e719ddeda5954f26a2b11ea`
had receipt status 1. The repeated notification trigger was not independently
established, and the later on-chain success results remain valid.

An additional offline test replays the original CRLF compiler input on the LF checkout and compares the complete Sepolia creation data hash, including the constructor argument. After both follow-up changes, the full local suite passed **181 tests (153 Solidity, 28 Mocha)**. The verifier still checks the network, deployment transaction, runtime code, ABI and treasury when connected to an RPC.

On the final code-only integration revision `e63143b`, the full local suite
passed **182 tests (153 Solidity, 29 Mocha)**; the command log is in
`docs/evidence/validation-2026-11-05T10-04-09.952Z/`. A separate Windows worktree
installed both lockfiles, deployed and verified a clean local registrar at
`0x5FbDB2315678afecb367f032d93F642f64180aa3` on chain 31337, and
served the matching frontend at `127.0.0.1:5181`. In that browser, a canceled
webpage confirmation left a prepared backup recoverable after refresh; export
was scoped to the connected wallet. A 0.02 ETH bid remained pending across
reload while mining was paused. Transaction
`0x13a5cd25a6b97c51c60c06e108a3552b3858eae58a9765d5beb521f87c76e989`
then mined successfully at `commitEnd - 1` and reconciled to commitment #1.
The bid was revealed, the name finalized, and settlement credited 0.08 ETH.
Withdrawal `0x18b21ffe290156a19ab1139a5588717d60ea65d121eac83afabbf4254da90bc5`
had receipt status 1 and left zero credit. After deleting only that local
record, importing the saved backup restored its settled and revealed state,
ID #1 and original 5:22:56 PM commit time while retaining older records.
These are local browser observations; the failed-transaction backup and
simulated post-broadcast RPC interruption were verified by the final-source
`FrontendCurrentFlow.ts` EVM test.

## 7. Improvements & Refinements

The validation branch added specification, compiled ABI/interface record, reproducible deployment and verification, a local transaction scenario, integration tests and README setup. A public Sepolia deployment record is committed in `contracts/deployments/11155111.json`. Browser feedback exposed lost IDs on import; an AI-assisted repair restored them and was retested with #1/#2. Later #7 and #9 checks extended recovery evidence. Other findings led to exact-wei/context validation, preapproval backup, chain/code guard, preserved invalid input, two-step payment preview and periodic round refresh. A follow-up pointed `check:frontend` at the current handler regression test while preserving the archived fixture under a separate command; its focused test passed. Original Solidity logic was not changed by this validation work.

## 8. Lessons Learned

A passing contract suite did not establish that wallet and browser flows were correct. Comparing specification, compiled ABI, revisions and chain observations exposed stale bindings and separated obsolete bugs from current ones. AI assistance accelerated inspection, test construction and fixes, but browser observation found missing import metadata, wrong-network behaviour and a payment confirmation gap. Future dApp work should verify recovery before paid commitments, bind frontend actions to the actual chain and destination, test the full wallet path and keep command outputs beside claims.

Code PR #12 merged the tested `e63143b` revision into main as `cc7e309`. Documentation PR #13 merged this report and its acceptance evidence into main as `4006260`. The team still needs to assemble the complete code ZIP and <=10-minute architecture/demo video. The documented developer-dependency advisories remain open. The live browser stale-recipient race and successful receipt recovery after a pending reload were observed on local chain 31337; neither establishes Sepolia browser behaviour.
