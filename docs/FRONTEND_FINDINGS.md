# Frontend integration findings

Historical captured revisions: `7217ac7`, `16decbd`, and later `b753e49`.
Contract main is `cb1f3c4`. The current UI correction was applied locally on
registrar-validation `67f8874` and had not yet been pushed when these results
were recorded. This document distinguishes historical defects, changes and
actual retests. Older reproductions remain in `history/frontend-7217ac7.md`.

| ID | Status through 1 November 2026 |
| --- | --- |
| FE-01 | Unused icon and orphan component originally broke production build; repaired and build passed. |
| FE-02–FE-05 | Short-name, round-zero, reservation and owner/recipient mismatches were historical; the later handler passed these checks. |
| FE-06 | Contract payment already used the checked path. The added full recipient/amount/chain preview was observed with cancellation and then a successful 0.001 ETH browser payment. Stale-recipient race passed in current-handler EVM test, not live browser. |
| FE-07 | Browser import originally lost IDs and times; repair restored #1/#2. Exact #7 wei and wrong-context/tampered imports passed. Round #7 prepared record survived reload after canceling webpage confirmation. A fresh local round #1 MetaMask rejection also preserved the prepared record. Round #2 preserved a pending transaction across reload; after MetaMask reported a failed transaction, receipt reconciliation changed the stale Submitted label to Commit failed. Successful pending-receipt reconciliation remains unobserved. |
| FE-08 | Auction lifecycle screens exercised through seven local rounds. |
| FE-09 | Wrong-chain `BAD_DATA` and mislabeled navbar reproduced. Corrected local navbar and visible chain-mismatch warning observed; search and write actions were blocked with wallet on 11155111 and registrar configured for 31337. |
| FE-10 | Input originally filtered unsupported characters; after correction `bad_name` remained visible and Search rejected it. No wrong-name transaction was observed. |
| FE-11 | After local RPC time advances, the UI showed 7m54s in a 120-second reveal window and offered Reveal; the contract rejected the attempt. The first chain-clock correction then showed Reveal at 0s while the latest block still had five seconds left. With the follow-up applied, the page showed Awaiting chain block and then Round ended after a block crossed the deadline. |

## FE-01: build gate

The older `16decbd` build failed on unused `Clock3` in `RoundSection` and three
unresolved imports in an unreferenced UI component. Removing the unused import
and component allowed the TypeScript/Vite production build to pass. Before/after
logs are retained in `docs/evidence/recorded-run`; later Windows build passed.
The bundle-size warning is not a build failure. Cause is inferred as a missed
production build gate; the original prompt or author intent is unavailable.

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
fresh review. That race has not been repeated with a live browser wallet.

## FE-07: reveal backup and context

Initial browser import displayed two settled bids without their commitment IDs
and original commit times. A team member reported the failure, requested an
AI-assisted correction and re-imported #1/#2; IDs and times returned. Source
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
not established. A successful receipt arriving after reload still needs a
browser check.

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
tested manually.

## Test provenance

`npm run check:frontend` now executes `contracts/test/FrontendCurrentFlow.ts`
against the current handler and simulated EVM. Its two focused tests passed on
2 November. The earlier `16decbd` fixture remains available under
`npm run check:frontend-archived` for historical comparison. The browser
observations and limits are in `BROWSER_ACCEPTANCE.md`.
