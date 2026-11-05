# Frontend integration findings

Historical captured revisions: `7217ac7`, `16decbd`, and later `b753e49`.
Contract main is `cb1f3c4`. The reviewed UI corrections were integrated
on `feature/registrar-validation`; final combined code is `e63143b`. This document distinguishes historical
defects, changes and actual retests. Older reproductions remain in
`history/frontend-7217ac7.md`.

| ID | Status through 5 November 2026 |
| --- | --- |
| FE-01 | Unused icon and orphan component originally broke production build; repaired and build passed. |
| FE-02–FE-05 | Short-name, round-zero, reservation and owner/recipient mismatches were historical; the later handler passed these checks. |
| FE-06 | Contract payment already used the checked path. The added full recipient/amount/chain preview was observed with cancellation and successful browser payments. A stale-recipient race was rejected in the current-handler EVM test and a later local browser run, followed by fresh review and a reported 0.001 ETH payment. |
| FE-07 | Browser import originally lost IDs and times; repair restored #1/#2. Exact #7 wei and wrong-context/tampered imports passed. Round #7 prepared record survived reload after canceling webpage confirmation. A fresh local round #1 MetaMask rejection also preserved the prepared record. Round #2 preserved a pending transaction across reload; after MetaMask reported a failed transaction, receipt reconciliation changed the stale Submitted label to Commit failed. A separate fresh-chain round #6 preserved a pending commitment across refresh and reconciled it to on-chain ID #2 after mining. Final revision `e63143b` restored a prepared backup, reconciled a pending bid after reload and re-imported a settled bid with its ID and original timestamp. Failed-transaction backup and RPC interruption were covered by the final-source EVM test. |
| FE-08 | Auction lifecycle screens exercised through seven local rounds. |
| FE-09 | Wrong-chain `BAD_DATA` and mislabeled navbar reproduced. Corrected local navbar and visible chain-mismatch warning observed; search and write actions were blocked with wallet on 11155111 and registrar configured for 31337. |
| FE-10 | Input originally filtered unsupported characters; after correction `bad_name` remained visible and Search rejected it. No wrong-name transaction was observed. |
| FE-11 | After local RPC time advances, the UI showed 7m54s in a 120-second reveal window and offered Reveal; the contract rejected the attempt. The first chain-clock correction then showed Reveal at 0s while the latest block still had five seconds left. With the follow-up applied, the page showed Awaiting chain block and then Round ended after a block crossed the deadline. In a later round, a reveal mined at `revealEnd - 1` succeeded on chain. |

## FE-01: build gate

The older `16decbd` build failed on unused `Clock3` in `RoundSection` and three
unresolved imports in an unreferenced UI component. Removing the unused import
and component allowed the TypeScript/Vite production build to pass. Before/after
logs are retained in `docs/evidence/recorded-run`; later Windows build passed.
The bundle-size warning is not a build failure. The likely cause was a missed
production build gate.

## FE-06: payment confirmation

The previous UI called `sendToDomain` but submitted directly after entering a
name and amount. Users could not inspect the full resolved address or selected
network before MetaMask. The correction separates preview from confirmation,
binds the displayed recipient and chain to the checked call, and requires a new
review after an error. The browser displayed the full recipient, 0.001 ETH and
Hardhat Local chain 31337; a canceled wallet request was handled; a subsequent
0.001 ETH name payment succeeded with UI transaction `0x529b07…7eefbe`.
The current-handler EVM test changed resolution between preview and send,
rejected the stale call without paying either recipient, then succeeded after
fresh review. In a later local browser test, the owner of
`receipt-pass-06.ntu` changed resolution in a second tab from
`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` to
`0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (UI transaction
`0xe5cce5…9c1cac`) while the first tab held the old 0.001 ETH preview.
Confirming that old preview displayed the recipient-changed error. The first
tab then reviewed the new address and reported a successful 0.001 ETH payment
to it (`0xfdb826…d55e5f`) on Hardhat Local.

## FE-07: reveal backup and context

Initial browser import displayed two settled bids without their commitment IDs
and original commit times. Browser feedback led to an AI-assisted correction;
re-importing #1/#2 restored their IDs and times. Source
review also found one shared storage key and saving only after a commit receipt.
Losing a paid bid's reveal preimage can incur the non-reveal penalty.

The current correction scopes records by chain/registrar/wallet/round, keeps
exact integer wei, validates import fields/digest and on-chain commitment, and
saves/downloads a backup before webpage confirmation and MetaMask. Browser #7
import retained `30000000000000001` wei and its settled status. Modified bid,
malformed salt, wrong chain/contract/wallet backups were rejected without
replacing valid records. In round #7 the webpage confirmation was canceled
before MetaMask; after refresh, the record still showed **Prepared, not
submitted**, no commitment ID, and older records remained. No deposit was
submitted. In the 2 November fresh-chain follow-up, rejecting a MetaMask
commit approval similarly left a prepared record after refresh. A round #2
transaction remained Submitted with no ID after reloading during a paused
mining interval. MetaMask then reported failure, while the original UI kept
showing Submitted. The correction polls saved transaction receipts and verifies
successful commitments against the registrar; a failed receipt marks the
record Commit failed without erasing the preimage. After the local patch and
refresh, the browser showed Commit failed. The transaction's revert cause was
not established. In a separate fresh-chain round #6, a 0.02 ETH bid stayed
Submitted without an ID after refresh while mining was paused. A block mined
at `commitEnd - 1` confirmed it as commitment #2, and the browser displayed
Committed with ID #2. This demonstrates successful receipt recovery after
reload under controlled local mining.

On the final combined code `e63143b`, a fresh browser origin preserved a
prepared bid across webpage cancellation, refresh and backup import. Backup
export was scoped to the connected wallet. A separate 0.02 ETH bid stayed
**Submitted, checking chain** after refresh while mining was paused; mining
at `commitEnd - 1` succeeded and the page reconciled commitment #1 without
changing its 5:22:56 PM time. The bid revealed and settled for a 0.08 ETH
refund. After removal of only that local storage record, importing the
downloaded backup restored **Settled**, **Revealed**, ID #1 and the original
time while older prepared records remained. The final-source
`FrontendCurrentFlow.ts` EVM test additionally exercised failed-transaction
backup and a simulated RPC receipt interruption after broadcast, preserving
the pending transaction hash. These latter two are automated observations.

The prepared record appeared as **Unrevealed** under the generic Your
commitments list even though it had no on-chain ID. This is a wording issue to
review; the reveal list correctly said Prepared, not submitted. No contract
penalty is owed for the canceled request.

## FE-09: expected chain

The earlier UI did not compare `VITE_CHAIN_ID` with the site's wallet chain
before reads. A local contract address queried on Sepolia gave `BAD_DATA`, and
the navbar incorrectly said Sepolia while the site used chain 31337. The
correction checks the expected chain and contract code and renders the actual
network. Console retest logged `Wrong network: wallet chain 11155111, registrar
chain 31337` instead of `BAD_DATA`; local navbar displayed Hardhat Local.
With the localhost site's MetaMask network changed to Sepolia while the
frontend configuration remained on 31337, the page displayed the mismatch
warning; Search showed the same error and write actions were unavailable.
The Sepolia navbar label reflected the wallet's actual network. No transaction
was submitted. The likely cause of the earlier failure is missing
deployment-context validation, not a proven property of a particular model.

## FE-10: invalid name input

The earlier input filtered `_` from a pasted label immediately. This could
hide that the entered target changed. The correction leaves unsupported text
visible until validation rejects it. In the browser, `bad_name` remained in
the field and Search said `Use lowercase letters, numbers and hyphens only.`
There was no on-chain wrong-name transaction. Other case/suffix/overlong cases
have not all been recorded manually.

## FE-11: local phase clock

The round #3 browser run confirmed a 0.02 ETH commitment with ID #1, which
survived refresh. Following local time manipulation, the UI showed Reveal with
7m54s remaining even though the configured reveal period is 120 seconds.
The reveal call failed with `Bids can only be revealed during the reveal phase`;
after refresh, the round showed Ended. No valid reveal or reservation was
created, and the unrevealed deposit was settled and withdrawn. The contract
deadline check held; the frontend compared a chain deadline with the computer's
wall clock. The first correction anchored countdowns to the latest block
timestamp and rechecked the reveal window before requesting a transaction.
During its browser retest, Commit began at 2m and decreased across Refresh,
but Reveal showed 0s after one `evm_mine` while the latest block still had
five seconds to its deadline. The block timestamp was 248 seconds ahead of
the computer clock. The wall-time estimate reached zero between blocks even
though `getRound` still returned Reveal. The follow-up treats the latest block
and contract phase as authoritative for offering actions, displays an
awaiting-block state after the estimate expires, and periodically refreshes.
A transaction can still cross a deadline between the final read and inclusion.
With the follow-up applied, the browser displayed Awaiting chain block and,
after a six-second local time advance and a mined block, Round ended. No bid
was submitted in that round; action acceptance at this boundary was not
tested manually in that round. A later fresh-chain round #6 confirmed a
reveal transaction at `revealEnd - 1` with receipt status 1 and on-chain
`revealed: true`. Its name was finalized; settlement credited 0.08 ETH and
withdrawal reduced the credit to zero. MetaMask also displayed failed
transaction notifications during this sequence. Its latest Failed Activity
entry was the earlier round #5 commit, `0xa7adb21b29c5c4de40a169c77bac0c0b95c5723d834f69eef75c2b8c9fef7188`
(receipt status 0), while round #6 commit `0x85164ee8367293a094014ed61018e06f598124928e719ddeda5954f26a2b11ea`
had receipt status 1. The contract reads support the later successful
outcomes; the repeated notification trigger was not independently established.

## Test provenance

`npm run check:frontend` executes `contracts/test/FrontendCurrentFlow.ts`
against the current handler and simulated EVM. Its two focused tests passed on
the final revision, and the full suite passed 182 tests. The earlier `16decbd` fixture remains available under
`npm run check:frontend-archived` for historical comparison. The browser
observations and limits are in `BROWSER_ACCEPTANCE.md`.
