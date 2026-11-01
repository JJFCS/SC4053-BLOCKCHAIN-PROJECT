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
| FE-07 | Browser import originally lost IDs and times; repair restored #1/#2. Exact #7 wei and wrong-context/tampered imports passed. Round #7 prepared record survived reload after canceling webpage confirmation. Pending wallet receipt/reload and MetaMask rejection during bid submission remain unobserved in browser. |
| FE-08 | Auction lifecycle screens exercised through seven local rounds. |
| FE-09 | Wrong-chain `BAD_DATA` and mislabeled navbar reproduced. Corrected local navbar and visible chain-mismatch warning observed; search and write actions were blocked with wallet on 11155111 and registrar configured for 31337. |
| FE-10 | Input originally filtered unsupported characters; after correction `bad_name` remained visible and Search rejected it. No wrong-name transaction was observed. |

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
submitted. A pending-wallet-receipt reload was not exercised. The current
handler test covers rejected wallet approval with no on-chain commitment, but
that particular rejection was not observed in the browser.

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

## Test provenance

`npm run check:frontend` still executes an archived `16decbd` fixture, not the
new working-tree handler. `contracts/test/FrontendCurrentFlow.ts` tests the
current handler against a simulated EVM and passed in the 180-test run. The
browser observations and limits are in `BROWSER_ACCEPTANCE.md`.
