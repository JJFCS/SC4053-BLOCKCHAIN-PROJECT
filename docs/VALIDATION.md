# Validation results

Date: 27 October 2026, Singapore time.
Execution: isolated automated Linux workspace, Node 24.22.1, npm 11.9.0.
The automated test results below came from that workspace. The public Sepolia
deployment and verification were subsequently run on Windows;
their outputs were supplied separately on 27 October.

## Inputs and preservation

- Main archive commit: `cb1f3c4b5bbc04326804089d30991dc69c6a2f60`.
- Current frontend/integration base: `16decbda349a26e0a8bd44eb4e216b6edd2e4b70`.
- Historical frontend archive: `7217ac7cd96be3813ba372c75f2bf3f8e042e9c2`.
- The complete Git bundle accounts for all 13 remote branch heads; all eleven contract feature tips are included in main.
- The interface patch and its four files match the recorded manifest hashes.
- The main contract and original lockfile match the recorded hashes after CRLF-to-LF
  normalization. The Windows ZIP contains CRLF line endings.
- `DomainRegistrar.sol` is unchanged in this package. Its normalized SHA-256 is
  `eda56c304c579d9c167550521279008830b4528169042442da05a94c9edabf89`.
- The first validation copy used a local imported Git baseline; its evidence records
  that actual local ID separately from sourceBaseRevision. The current integration
  working copy is based on the real captured 16decbd commit. No local import ID is
  presented as a GitHub revision.

## Observed checks

| Check | Actual outcome |
| --- | --- |
| Original contract dependency install | Passed: 208 packages, Hardhat 3.18.0. |
| Original complete suite | 176 passed: 153 Solidity, 23 Mocha. |
| Specification/interface integration | Patch check and application passed in the working copy. |
| Expanded build/export/typecheck/tests | Passed; 179 tests: 153 Solidity, 26 Mocha. |
| Fresh installation of the updated lockfile | Passed: npm ci installed 224 packages. |
| Additional integration coverage | Compiler ABI equality/canonical fields; deployment-evidence validation and mismatch rejection; complete user flow through the published ABI. |
| ABI export | 48 entries, regenerated from the current compiler artifact. |
| HTTP localhost deployment | Passed on chain 31337, nonzero constructor treasury, no auction automatically started. |
| Deployment verification | Passed before and after the transaction scenario. |
| Public Sepolia deployment | Windows command output: chain 11155111; registrar `0x9dbe733cDB4F8BBB6a960177c2c3bB7E005819F9`; treasury/deployer `0x20Dc8080A1e86d2e2E80FbF9E6FAe548073B0c6F`; transaction `0xb07b99bb1b8e63c1610ab77b9103f1665045a837eb70cd684ca3157915d55408`. |
| Public Sepolia verification | Separate `verify-deployment.ts` command reported `verified: true`, chain 11155111, same address, and `currentRoundId: 0`. |
| Sepolia compiler replay on LF checkout | Isolated Hardhat 0.8.34 build from the recorded CRLF registrar source and forge-std remapping produced the exact recorded creation hash `0x2694ea5cd0d5d7927c62df6502b094fa07ee208568f6f1ac266acf5e7edd6bff`. The focused integration test passed without testnet credentials. Public RPC verification from this checkout remains unperformed. |
| Local transaction scenario | Passed: competing bids, late reveal ordering, older finalization during a newer round, all three refund outcomes, withdrawals, address update and checked payment. |
| Invalid deployment configuration | Zero treasury and ephemeral deployment requests were rejected before a deployment transaction. |
| Frontend locked install | Passed. |
| Current frontend production build | Failed before repair (unused icon plus unresolved orphan component); passed after the two-file build repair. |
| Historical frontend runtime probes | Five issues reproduced in 7217ac7 only. |
| Current frontend handler checks | FE-02 through FE-05 fixed/verified; checked payment path verified, with confirmation UI still open. |
| Browser/storage/wallet acceptance | Not performed in this automated run; later partial manual results are described below. |

The totals include five Counter example tests; the expanded registrar-specific
total is 174. Fuzz function case counts in the raw logs are not added to the
named-test total.

## Dependency review

An actual `npm audit --json` on 27 October reported 22 affected package entries:
8 low and 14 high. Entries include transitive dependants; this is not a claim of
22 independent root vulnerabilities or 22 exploitable contract defects.

A normal, non-forced `npm audit fix` updated compatible versions in the existing
declared ranges, including Hardhat 3.18.0 to 3.21.1 and undici 7.30.0 to 7.30.1.
Its exit code remained nonzero because unresolved advisories remain. The supplied
lockfile captures those changes, and the full 179-test validation was rerun.

The follow-up audit reports 13 high entries rooted in the remaining Zod advisory
and its dependent tooling packages. This is an open dependency finding, not a
clean audit result. The installed Zod 3.x interface is used by Hardhat. A forced
fix proposes incompatible major tooling changes and was not applied.

A later `npm audit --json` on 1 November 2026, against the same locked contract
toolchain, reported 18 affected package entries: 13 high and 5 moderate. High
entries propagate through Hardhat plugins from Zod. Moderate entries include
Mocha, glob, minimatch and TypeChain dependants. These are package entries,
not 18 independent exploits. The audit's proposed fixes for direct Hardhat,
toolbox and Mocha dependencies involve major-version changes, including
downgrades; they were not applied without a compatible migration and rerun.
No runtime exploit or production deployment exposure was demonstrated.
The lockfile hash, affected package names, severities, advisory references and
reported fix options are captured in `docs/evidence/audit-summary-2026-11-01.json`.

The advisory describes resource exhaustion during validation of oversized
collections: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 . Exploitability
against this particular developer workflow was not demonstrated. Further action
requires an upstream-compatible fix or a separately tested toolchain migration;
controlling configuration inputs does not count as patching the dependency.
Raw before/update/after outputs are retained as evidence.

Decision on the 1 November lockfile: retain the already validated compatible
Hardhat 3 update and record the remaining development-tool advisories. The
reported direct fixes require major changes or downgrades to Hardhat/toolbox
and Mocha. No compatible, tested remediation for the remaining 13 high and 5
moderate entries has been established; `npm audit --offline` cannot verify
their absence because it has no advisory data. Do not treat its empty result
as a clean online audit. Reassess with an online audit and full test rerun if
the toolchain is changed before submission.

## Evidence and boundaries

- `docs/evidence/validation-*`: generated build/export/typecheck/test logs and exit codes.
- `docs/evidence/frontend-reproductions.json`: five observed frontend issues.
- `docs/evidence/local-smoke-*.json`: actual local transaction records.
- `docs/evidence/recorded-run/`: original suite, frontend build failure, dependency
  review, deployment and verification output captured during this work.
- `contracts/deployments/11155111.json` on the Windows checkout:
  public Sepolia deployment record written by the deployment script. Include
  that record in the final repository evidence; it was not part of the earlier
  captured Linux logs.

The local node used for captured evidence was stopped after testing. Its hashes
are local evidence, not public explorer links or an address hosted for teammates.
The Sepolia deployment above supplies a shared address for the current browser
integration. No Slither, formal verification, or complete Windows suite rerun is
claimed by the earlier automated record; a later Windows 180-test run is noted
below. The public explorer page was
not independently loaded in this review; the separate network verification
command reported success.

## Later manual browser check

On 29–30 October 2026, frontend-wallet `b753e49` and registrar-validation
`c2f8bcc` were combined on local chain 31337. Manual observations covered an
unrevealed bid, a revealed and finalized winning bid, settlement and withdrawal
of both refunds, an owner resolution update, and a 0.01 ETH payment by name.
The two settled backup records were imported after a local repair, restoring
their on-chain IDs and original commit times. A local RPC read showed recipient
10000.01 ETH and registrar 0.061 ETH after the payment. This manual run is
recorded in `BROWSER_ACCEPTANCE.md`; it does not add screenshots or full
browser receipts to the earlier automated evidence.

Wrong-chain reads showed `BAD_DATA`, the navbar labeled the local network
Sepolia, and Refresh appeared to stall at countdown zero until page reload.
Remaining browser paths are marked pending in the checklist.

## Subsequent integration checks through 1 November

With `contracts/test/FrontendCurrentFlow.ts` added on the Windows checkout,
`npm.cmd test` reported **180 passing (153 Solidity, 27 Mocha)**, and the
frontend TypeScript/Vite build passed. That test exercises the *current*
handler's preapproval record, rejected wallet request, wrong-chain guard,
stale-recipient rejection and fresh payment. At the time of this run,
`npm run check:frontend` still targeted the archived 16decbd fixture; the
command was corrected in the later follow-up below.

A separate clean local clone of `67f8874` plus reviewable patches installed
both lockfiles offline, passed the 180-test suite and frontend build, deployed
and independently verified a local registrar, ran the smoke scenario and
served Vite's HTML with matching chain/address settings. This reproduced the
README command path in a new directory, not a browser walkthrough of a final
commit by another teammate.

Manual browser rounds #3–#7 covered higher-bid and earlier-commit tie winners,
two names sharing a round, older unfinished names, loser/winner/non-reveal
refunds, a zero-refund winner, exact-wei backup import and rejected wrong-
context/tampered imports. Round #7's downloaded backup and locally prepared
record survived a reload after the webpage submission was canceled, before
MetaMask, with older records intact. The revised payment UI displayed full
recipient, 0.001 ETH and chain 31337; a declined attempt was handled and a
later 0.001 ETH payment by name succeeded. The old wrong-chain `BAD_DATA`
became an explicit visible warning. With site wallet chain 11155111 and
configured registrar chain 31337, search returned the mismatch warning and
write controls were unavailable; no transaction was attempted. Stored bids
remained visible. See BROWSER_ACCEPTANCE.md.

These later browser results came from reported on-screen output; full receipts
and screenshots were not captured in the repository. A browser reload during
a pending wallet transaction or delayed receipt and a live stale-recipient
race remain unobserved.

## Current frontend regression command, 2 November

`npm run check:frontend` now runs the existing `test/FrontendCurrentFlow.ts`
against the current frontend handler. A focused run passed with one Mocha test
covering preapproval recovery, wallet rejection, the network guard and a
stale-recipient payment followed by fresh preview. The older fixture remains
available as `npm run check:frontend-archived`. This command change does not
add a new browser observation or alter the earlier 180-test total.

## Sepolia compiler replay, 2 November

The public deployment record now stores the original CRLF source line ending.
An isolated Hardhat build of that original input on the LF checkout matched
the published creation hash byte for byte. The focused replay test passed.
The verifier uses this replay only when its current checkout artifact does
not match the recorded creation transaction. This resolves the checkout
metadata mismatch in code, subject to an on-chain rerun from an LF checkout
with a Sepolia RPC. No wallet key is needed for the offline replay test.
The full local suite passed 181 tests (153 Solidity, 28 Mocha) after this
change; the current frontend handler check and TypeScript typecheck passed.

## Remaining integration work

1. Document the unobserved pending-receipt and live browser stale-recipient
   cases without claiming they passed.
2. Record the final integrated revision and have a teammate reproduce the
   browser/wallet flow from that revision.
3. Keep the 13 high/5 moderate dependency finding visible unless a compatible
   update is actually applied and retested. Finish the group code package and
   demo video.
