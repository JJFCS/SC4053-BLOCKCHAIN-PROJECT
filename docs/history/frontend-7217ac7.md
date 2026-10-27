> Historical review of 7217ac7. Current status is in ../FRONTEND_FINDINGS.md.

# Frontend integration findings

Reviewed frontend: `feature/frontend-wallet`, revision
`7217ac7cd96be3813ba372c75f2bf3f8e042e9c2`.
Contract target: `cb1f3c4b5bbc04326804089d30991dc69c6a2f60` plus its handoff ABI.
These findings refer to those snapshots. Recheck any newer teammate version.

## Reproduction and status

From `contracts`, run `npm run audit:frontend-history`. The harness transpiles the exact
archived `handlers.ts`, supplies its deployment address, and connects its
BrowserProvider to an EIP-1193 bridge backed by an actual simulated EVM. It does
not execute React, MetaMask, or browser storage. The fixture's exact byte hash is
recorded in `docs/evidence/frontend-reproductions.json`.

All frontend findings below remain open in the reviewed 7217ac7 snapshot. The five successful
reproductions demonstrate failures, not successful fixes. Person B owns the
frontend changes; C reruns acceptance and retains evidence afterward.

## FE-01 — Frontend production build fails

- **Observed:** fresh locked installation succeeds; `npm run build` exits 2.
  `src/components/ui/button.tsx` imports `@base-ui/react/button`,
  `class-variance-authority`, and `@/lib/utils`, which are unresolved.
- **Impact:** the supplied frontend cannot produce the required build.
- **Likely cause (inference):** generated UI component code was added without its
  supporting packages, utility file, or alias configuration being integrated.
- **Proposed fix:** either integrate the real dependencies, utility and alias,
  or remove/replace the unused component with the established UI implementation.
  Avoid adding placeholder declarations that merely hide errors.
- **Verification needed:** clean `npm ci`, typecheck/build, and a browser render.
  Original failure output is retained in the evidence directory.

## FE-02 — Short labels pass the frontend validator

- **Observed:** `validateLabel("xy")` reports valid; the current contract reports
  invalid. Source: `handlers.ts:1155–1230`.
- **Impact:** a user can prepare a hidden commitment that cannot later be
  revealed, risking the specified non-reveal penalty.
- **Likely cause (inference):** the UI retains the older 1–32 rule after the
  contract/specification moved to 3–32.
- **Proposed fix:** reject labels shorter than three ASCII characters before
  enabling commit. Normalize case/suffix/outer whitespace, then validate; do not
  silently delete internal invalid characters or truncate an overlong name.
- **Evidence:** runtime reproduction FE-02. Retest boundary lengths and invalid
  characters in the actual browser after the fix.

## FE-03 — A fresh deployment is treated as a recorded round

- **Observed:** on a fresh deployment, `getCurrentRound()` returns 0; the handler
  calls `getRound(0)` and gets `INVALID ROUND`. Source: `handlers.ts:280–290`.
- **Impact:** round-dependent search/state cannot initialize correctly before
  someone explicitly starts the first auction.
- **Likely cause (inference):** frontend assumptions predate explicit rounds.
- **Proposed fix:** handle ID 0 as no recorded round, show an appropriate state,
  and expose the intended start-round action. Preserve historical round IDs.
- **Evidence:** runtime reproduction FE-03. Test both fresh and ended deployments.

## FE-04 — A reserved name is shown as available

- **Observed:** after a valid reveal and the deadline, before finalization, the
  handler returns `available` while `reservedRound(label)` is 1.
  Source: `handlers.ts:590–604`.
- **Impact:** incorrect availability can lead to unusable bids and hides the
  unfinished auction. Later rounds must not overwrite the old reservation.
- **Likely cause (inference):** status is derived from the latest global phase
  instead of the name's owner and reservation.
- **Proposed fix:** classify registered/reserved/available using `ownerOf` and
  `reservedRound`; show the reserved round and its finalization action.
- **Evidence:** runtime reproduction FE-04. Retest with a newer round active.

## FE-05 — Payment address is displayed as the owner

- **Observed:** `checkDomain` assigns `resolve(label)` to `owner`. After an
  address update, the displayed owner differs from `ownerOf(label)`.
  Source: `handlers.ts:464–481`.
- **Impact:** misleading ownership information and potentially incorrect UI
  permissions; changing resolution does not transfer a domain.
- **Likely cause (inference):** forward resolution and ownership were treated
  as the same concept during the initial UI binding.
- **Proposed fix:** read and display owner and resolution recipient separately.
- **Evidence:** runtime reproduction FE-05. Test owner controls after an update.

## FE-06 — Direct transfer bypasses the checked payment operation

- **Observed:** `sendPayment` resolves the name and calls
  `signer.sendTransaction({to, value})`. The harness changes resolution between
  lookup and submission; the transfer still succeeds to the old recipient.
  The registrar's `sendToDomain` rejects the same stale recipient.
  Source: `handlers.ts:999–1060`.
- **Impact:** the application does not provide the specified transaction-time
  recipient check or the registrar's DomainPayment event.
- **Likely cause (inference):** the handler was written for an earlier direct
  payment workflow and was not updated after the checked operation was added.
- **Proposed fix:** preview the full address, network and amount; get the user's
  confirmation; call `sendToDomain(label, expectedRecipient)` with the exact
  value. A changed recipient requires a new confirmation, never a silent retry.
- **Evidence:** runtime reproduction FE-06 contains the actual simulated
  transaction and recipient checks. Retest the real wallet interaction after fixing.

## FE-07 — Recovery data lacks required context and pre-commit persistence

- **Source-confirmed:** all records share `ntu-commitments`; the Commitment type
  has no chain ID or registrar address. The app adds the commitment to saved state
  only after `await commitBid(...)` completes and the receipt has been processed.
  Imports check some field types, then replace the existing array without digest
  recomputation or on-chain comparison.
- **Sources:** `handlers.ts:108–130, 683–767`;
  `NtuApp.tsx:87–96, 202–208, 406–417, 630–684`.
- **Impact:** reloads during submission, network/deployment changes, corrupted
  imports, or replacement of an existing backup can leave a user unable to reveal.
- **Likely cause (inference):** generic persistence was implemented without the
  versioned backup and transaction-recovery requirements in specification section 9.
- **Proposed fix:** persist a version-1 preimage before wallet approval; key it
  by chain/contract/bidder/round; preserve exact wei as decimal strings; validate
  and recompute imports against the stored commitment; preserve valid existing data.
- **Verification needed:** actual browser reload/export/import, wallet/network
  changes, wrong context, tampering, and `30000000000000001` wei. No browser-level
  reproduction or successful fix is claimed by this package.

## FE-08 — Required lifecycle operations need UI integration

- **Source-confirmed:** the supplied frontend's hand-written ABI and main app do
  not implement the current round-start, settlement, withdrawal and owner-address
  update flows. The supplied ABI also predates the newer returned record fields.
- **Impact:** a successful contract suite does not make the required application
  usable end to end; users need to reclaim deposits and manage resolution.
- **Likely cause (inference):** frontend and contract branches advanced separately.
- **Proposed fix:** use the compiler-generated ABI and canonical operations from
  `CONTRACT_INTERFACE.md`, then implement the missing flows. Compatibility aliases
  in the old ABI are real operations, so their presence alone is not a vulnerability.
  Old ABI tuples may ignore extra returned fields without reverting; update them
  for complete current state, not on the assumption that every old read must fail.
- **Verification needed:** the complete browser checklist below, plus a clean build.

## Acceptance after B's changes

Run `docs/BROWSER_ACCEPTANCE.md`, capture the tested code revision and actual
results, and add targeted regression checks for each fixed finding. Keep the
historical reproduction fixture unchanged as evidence of the reviewed input.
It deliberately continues to reproduce the original issues until a separate
fixed-frontend acceptance harness is introduced.
