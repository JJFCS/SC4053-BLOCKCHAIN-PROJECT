# Validation results

Date: 27 October 2026, Singapore time.
Execution: isolated automated Linux workspace, Node 24.22.1, npm 11.9.0.
The automated test results below came from that workspace. The public Sepolia
deployment and verification were subsequently run on Windows;
their outputs were supplied separately on 27 October.

## Inputs and preservation

- Main archive comment: `cb1f3c4b5bbc04326804089d30991dc69c6a2f60`.
- Current frontend/integration base: `16decbda349a26e0a8bd44eb4e216b6edd2e4b70`.
- Historical frontend archive: `7217ac7cd96be3813ba372c75f2bf3f8e042e9c2`.
- The complete Git bundle accounts for all 13 remote branch heads; all eleven contract feature tips are included in main.
- A's handoff patch and its four proposed files match its manifest hashes.
- The main contract and original lockfile match A's hashes after CRLF-to-LF
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
| Specification/interface handoff application | Patch check and application passed in the working copy. |
| Expanded build/export/typecheck/tests | Passed; 179 tests: 153 Solidity, 26 Mocha. |
| Fresh installation of the updated lockfile | Passed: npm ci installed 224 packages. |
| Additional integration coverage | Compiler ABI equality/canonical fields; deployment-evidence validation and mismatch rejection; complete user flow through the published ABI. |
| ABI export | 48 entries, regenerated from the current compiler artifact. |
| HTTP localhost deployment | Passed on chain 31337, nonzero constructor treasury, no auction automatically started. |
| Deployment verification | Passed before and after the transaction scenario. |
| Public Sepolia deployment | Windows command output: chain 11155111; registrar `0x9dbe733cDB4F8BBB6a960177c2c3bB7E005819F9`; treasury/deployer `0x20Dc8080A1e86d2e2E80FbF9E6FAe548073B0c6F`; transaction `0xb07b99bb1b8e63c1610ab77b9103f1665045a837eb70cd684ca3157915d55408`. |
| Public Sepolia verification | Separate `verify-deployment.ts` command reported `verified: true`, chain 11155111, same address, and `currentRoundId: 0`. |
| Local transaction scenario | Passed: competing bids, late reveal ordering, older finalization during a newer round, all three refund outcomes, withdrawals, address update and checked payment. |
| Invalid deployment configuration | Zero treasury and ephemeral deployment requests were rejected before a deployment transaction. |
| Frontend locked install | Passed. |
| Current frontend production build | Failed before repair (unused icon plus unresolved orphan component); passed after the two-file build repair. |
| Historical frontend runtime probes | Five issues reproduced in 7217ac7 only. |
| Current frontend handler checks | FE-02 through FE-05 fixed/verified; checked payment path verified, with confirmation UI still open. |
| Browser/storage/wallet acceptance | Not performed. Checklist and source observations are supplied. |

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

The advisory describes resource exhaustion during validation of oversized
collections: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 . Exploitability
against this particular developer workflow was not demonstrated. Further action
requires an upstream-compatible fix or a separately tested toolchain migration;
controlling configuration inputs does not count as patching the dependency.
Raw before/update/after outputs are retained as evidence.

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
integration. No Slither, formal verification, complete Windows suite rerun, or
real MetaMask/React flow is claimed by this record. The public explorer page was
not independently loaded in this review; the separate network verification
command reported success.

## Remaining integration work

1. Complete the remaining recovery, recipient-confirmation and network checks against the current frontend.
2. Run the browser checklist against that version and record real results.
3. State the limits of the available team tooling and development history in the report.
4. The group addresses or explicitly evaluates the remaining dependency finding,
   then completes the audit report, fresh installation check and demo video.
