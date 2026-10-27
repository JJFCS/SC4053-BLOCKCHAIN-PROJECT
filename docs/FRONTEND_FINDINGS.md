# Frontend integration findings

Current captured frontend: 16decbda349a26e0a8bd44eb4e216b6edd2e4b70.
It includes 66b12a2 (Complete frontend auction integration) and main cb1f3c4.
The historical 7217ac7 review is retained in history/frontend-7217ac7.md.
Every captured branch head is accounted for in SOURCE_REVISIONS.md.

## Current verification

Run npm run check:frontend from contracts. The unmodified captured current handlers
are configured/transpiled and executed through BrowserProvider and an EIP-1193
bridge to a simulated EVM. Results are in evidence/frontend-current-checks.json.
This exercises real contract behaviour, not React, browser storage or MetaMask UI.

| Finding | Current status |
| --- | --- |
| FE-01: production build fails | Fixed by this integration patch; production build passed. |
| FE-02: short labels accepted | Fixed in the captured frontend; validation check passed. |
| FE-03: getRound(0) on fresh deployment | Fixed in the captured frontend; null returned safely. |
| FE-04: reserved name appears available | Fixed in the captured frontend; original ended reservation verified. |
| FE-05: resolution recipient shown as owner | Fixed in the captured frontend; separate fields verified. |
| FE-06: direct transfer bypasses registrar | Checked contract path fixed and verified; recipient confirmation remains open. |
| FE-07: reveal recovery context/persistence | Still open in current source. |
| FE-08: lifecycle screens absent | Implemented in current source; full browser acceptance pending. |

## FE-01: production build failure and repair

The captured 16decbd build failed on unused Clock3 in RoundSection and three
unresolved imports in src/components/ui/button.tsx. The latter component has no
consumers; the application uses ntu/primitives.tsx instead.

The integration patch removes the unused icon import and unreferenced component.
No placeholder declarations or extra UI dependencies were introduced. The
TypeScript/Vite production build then passed. Before/after evidence is retained
in recorded-run/frontend-latest-build.log and frontend-build-fixed.log.
The remaining large-chunk warning is not a build failure.

Likely cause (inference): unused generated component boilerplate was integrated
without a successful production build. No original generation prompt is available
to establish the exact model reasoning.

## FE-06: explicit recipient preview/confirmation remains incomplete

Current sendPayment correctly calls sendToDomain with the resolved address.
The form accepts a name/amount and submits directly; it does not show a full
resolved-recipient/network preview for a separate confirmation. Its success card
appears afterward.

Impact: transaction-time stale-recipient protection works, but the user has not
confirmed the recipient required by the specification. A retry after changes
must also require fresh confirmation.

Required change: separate preview and confirmation, bind the confirmed address,
amount and deployment context to submission, and require a new confirmation after
any change. Likely cause (inference): backend binding was updated without completing
the interaction. The current handler race test proves neither recipient is paid
on the stale call and a separate fresh checked call succeeds. Real UI confirmation
and retry remain untested.

## FE-07: reveal backup context, persistence and import validation

The current Commitment type has no schema version, chain ID or registrar address.
All records share the ntu-commitments storage key. handleCommit saves only after
the awaited commit/receipt completes. Import checks types and replaces state
without recomputing the digest or checking the stored on-chain commitment.

Impact: reload during submission, cross-network/deployment use, malformed imports
or replacement of valid records can prevent reveal and expose a non-reveal penalty.
Source: current handlers.ts Commitment; NtuApp.tsx storage initialization/effect,
handleCommit and handleImportBackup.

Required change: persist the versioned preimage before wallet approval; scope keys
to chain/contract/bidder/round; preserve exact integer wei; recompute/check imports
and preserve valid records on failure. Likely cause (inference): generic local
persistence was retained without completing specification section 9.

Verification needed: actual browser reload/export/import, wrong context, tampered
fields, network/wallet changes and 30000000000000001 wei. These are source-confirmed
gaps; no browser reproduction or successful fix is claimed.

## FE-09: expected network is not enforced

Deployment configuration supplies VITE_CHAIN_ID, but the current frontend does
not consume it or compare the wallet chain before reads/writes. Reloading on
chainChanged is not an expected-network check.

Impact: operations can be attempted in an unintended deployment context. Commitment
chain binding protects reveal validity, not correct wallet selection.

Required change: verify expected chain and deployed code; block actions with a
readable network message until the correct chain is selected. Test network/account
changes and stale in-flight requests in the browser. This is source-confirmed;
exploitability against another live deployment was not demonstrated.

## FE-10: invalid name input is silently changed

sanitizeLabel removes invalid characters and truncates overlong input. The agreed
normalization allows case, suffix and outer-whitespace changes, followed by
validation; it does not silently replace an invalid name.

Impact: the target can differ from what the user typed. Retain invalid input and
show an error. Test punctuation, Unicode, whitespace, overlong labels and suffixes
across search, bid and payment fields. This is source-confirmed; browser testing
is pending.

## Acceptance and provenance

The optional audit:frontend-history command deliberately reproduces old failures.
Current handler successes do not close the remaining browser findings. Use
BROWSER_ACCEPTANCE.md and REQUIREMENTS_COVERAGE.md to record actual results after
changes. Proposed causes are inferences from source/version differences, not
claims about unseen AI prompts. Historical findings are not attributed to the
current code where a fix has been verified.
