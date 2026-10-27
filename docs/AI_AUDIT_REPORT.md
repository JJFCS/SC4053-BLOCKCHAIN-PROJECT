# AI Audit Report — Decentralized .ntu Domain Registrar

Status: working report of the supplied revisions and completed automated checks.
Frontend fixes, browser acceptance and remaining group history must be incorporated
before treating this as the final submission report. All results below are scoped
to recorded commands; expected future results are not presented as completed work.

Contract base: `cb1f3c4b5bbc04326804089d30991dc69c6a2f60`.
Reviewed integration base: `16decbda349a26e0a8bd44eb4e216b6edd2e4b70`.
Historical frontend: `7217ac7cd96be3813ba372c75f2bf3f8e042e9c2`.
Review date: 27 October 2026, Singapore time.

## 1. Initial Specification & System Scope

The starting requirements supplied to this workflow came from Option 3 in the
course brief: a .ntu registrar using hidden commitments and a reveal auction,
highest valid bid ownership, forward address resolution, a browser interface,
and ETH payments using registered names. The brief also raises non-reveal
penalties, domain leakage and accelerated auction phases.

Detailed round lifecycle, fixed deposit/penalty values, reservation rules,
checked payments, recovery schema and acceptance criteria were developed in the
assisted specification process. The complete v0.5 specification is therefore a
working engineering artifact; this report does not claim it was written before
AI use. The team should incorporate any actual earlier scope/registration record
when finalizing the account of its pre-tool intentions.

Baseline scope excludes expiry, renewal, resale, ownership transfer and subdomains.
Reverse resolution is optional. The system separates domain ownership from its
current resolution address. On-chain state determines deadlines, reservations,
ownership and credit; browser state supports input, wallet operations and recovery.

## 2. Development Methodology & AI Tooling Infrastructure

The working division is A for contracts and initial tests, B for frontend/wallet
integration, and C for independent validation, deployment and audit coordination.
Actual contributions should be described in the final group report; this split
is a team workflow rather than a separately assigned course rubric.

C used ChatGPT/Codex to inspect the uploaded code, follow the repository's
Hardhat skills, prepare scripts/tests/docs, execute validation in an isolated
Linux environment, and interpret the output. The original archives were retained.
New work was prepared in a separate copy and exported as a reviewable patch.

Infrastructure consists of:

- `docs/SPEC.md` and the compiler-generated ABI/interface guide from A's handoff.
- Repository `hardhat` and `hardhat-toolbox-mocha-ethers` skills for the actual
  Hardhat 3 API, test layers and build-before-typecheck workflow.
- `scripts/validate.mjs` for ordered build, ABI export, typecheck and tests with
  captured outputs and exit codes.
- Deployment, verification and local transaction scripts, with source/ABI/code
  bindings and actual transaction records.
- An archived-handler audit harness which connects the unchanged historical
  frontend module to a real simulated EVM through an EIP-1193 bridge.

A/B's exact generation tools/models and prompt chains have not been supplied in
the current handoff. Repository instruction files are not proof that a specific
assistant was used. Their actual records must be incorporated before submission.

## 3. Specification Engineering & Prompt Logs

The formal specification defines contract state transitions, deadline boundaries,
accounting, canonical function inputs, browser recovery and acceptance criteria.
This gives code generation and subsequent review a shared set of observable rules.

Representative conversation topics and the actual work authorization are in
`PROMPT_RECORDS.md`. Summary entries are labelled as summaries, not fabricated
verbatim prompts. The supplied context included the project brief, completed
v0.5 specification, main/frontend archives, package/config files, existing tests,
and A's interface and validation handoff.

Review proceeded in iterations: establish source revisions, run original checks,
incorporate the handoff, add deployment/integration tools, reproduce frontend
failures, review dependency advisories, and rerun affected checks after compatible
dependency changes. Raw results are stored independently of the narrative.

## 4. AI-Generated Architecture

The reviewed backend is a single DomainRegistrar contract. It stores explicit
round schedules, wallet commitments, per-round domain auctions, domain ownership
and resolution, withdrawal credits, and aggregate liabilities. Commitments bind
chain, registrar, round, wallet, canonical label, exact integer bid and salt.

Valid reveals reserve names for the original round. Highest bid wins, with
earlier on-chain commitment order breaking ties. Finalization assigns ownership
and credits the winning price. Settlement produces bidder credit; withdrawal
pays it using the shared reentrancy guard. Domain payment checks the expected
recipient at execution and forwards only new transaction value.

The current frontend uses React/Vite and ethers BrowserProvider. Commit 66b12a2
adds explicit-round, settlement and resolution screens; merge 16decbd includes
main's current contracts. Its ABI bindings correct several earlier assumptions.
Recovery, expected-chain enforcement and recipient-confirmation gaps remain.
The handoff supplies the 48-entry compiled ABI and precise interface guide.

## 5. Problems Discovered & Vulnerability Analysis

Detailed observations, impacts, inferred causes, proposed fixes and required
verification are in `FRONTEND_FINDINGS.md`.

| ID | Finding | Evidence/status |
| --- | --- | --- |
| DOC-01 | Main's specification was a heading; ABI/interface handoff absent. | Resolved in working copy by incorporating A's handoff; ABI equality checked. |
| DEPLOY-01 | Only the Counter example was deployable through the supplied module. | Registrar deployment/verification added and exercised over local HTTP RPC. |
| FE-01 | Current build fails on unused icon/orphan component imports. | Repaired and production build verified; before/after logs retained. |
| FE-02 | Historical short-name mismatch. | Fixed in 16decbd; current handler check passed. |
| FE-03 | Historical round-0 read failure. | Fixed in 16decbd; current handler check passed. |
| FE-04 | Historical pending-name status failure. | Fixed in 16decbd; current handler check passed. |
| FE-05 | Historical owner/recipient confusion. | Fixed in 16decbd; current handler check passed. |
| FE-06 | Historical direct transfer; current confirmation gap. | Checked contract path fixed/verified; explicit UI preview/confirmation still open. |
| FE-07 | Backup context, pre-commit persistence and import validation are incomplete. | Source-confirmed; browser reproduction/fix pending. |
| FE-08 | Historical missing lifecycle screens/operations. | Added in 66b12a2/16decbd; complete browser acceptance pending. |
| FE-09 | Expected network is not enforced. | Source-confirmed; open. |
| FE-10 | Invalid name input is silently changed. | Source-confirmed; open. |
| DEP-01 | Dependency audit reports affected tooling packages. | Compatible update reduced entries from 22 to 13; Zod-related finding remains open. |

No additional reproducible contract-logic vulnerability was identified in this
pass. This does not establish the absence of vulnerabilities. Existing adversarial
tests were rerun, while C added interface, evidence-binding and complete-flow checks.

For the major frontend findings, the likely causes are version drift or missing
integration context. These are inferences from the supplied versions and source;
the exact model decision cannot be reconstructed without the original prompts.
Pending fixes are not described as successful remediation. DEP-01 is a developer
dependency finding and is not presented as a demonstrated on-chain funds exploit.

## 6. Validation Process & Testing Strategy

Validation was executed in the assistant's Linux workspace with Node 24.22.1 and
npm 11.9.0. The repository specifies Node 26. An earlier Windows run showed
38 tests on an earlier state; those results are not substituted for current tests.

The unchanged supplied contract suite passed 176 named tests: 153 Solidity and
23 Mocha. After the integration additions, build, ABI export, typecheck and 179 tests passed:
153 Solidity and 26 Mocha. Five tests are Counter examples; 174 are registrar
tests. All existing Solidity/contract logic was preserved.

The three additional integration tests check exact compiler/published ABI equality and canonical
fields, verify deployment-evidence bindings and reject wrong chain/ABI/code
records, and drive an entire auction/refund/payment flow through the published
ABI. They complement the existing unit, adversarial and fuzz tests.

An actual local HTTP deployment was verified by chain, code, creation receipt,
compiled creation data, constructor treasury, source and ABI. A local scenario
then exercised competing bids, older-round finalization after a newer round had
started, winning/losing/non-reveal settlement, all withdrawals, address updates,
stale-recipient rejection and successful checked payment while preserving a
newer deposit. Actual local hashes and output are in `docs/evidence`.

The historical frontend build failed. Five behavioural issues were reproduced by
executing its real handler module against the EVM. This is not React/MetaMask
acceptance: browser storage, user confirmation, live wallet changes and reload
flows still require the browser checklist. The fixture remains historical and
deliberately continues to reproduce the old errors.

The complete branch bundle later revealed commit 66b12a2 followed by merge 16decbd.
All eleven contract tips are included in main, and contract files in 16decbd are
identical to main. Current handler execution verified four old fixes and the
checked payment path. Its production build initially failed on four errors;
removing an unused icon import and an unreferenced component produced a passing
build. Browser acceptance remains pending. The scope/status of each of the 29
specification criteria is recorded in REQUIREMENTS_COVERAGE.md.

Dependency changes were followed by the complete validation suite, frontend
reproductions and local deployment scenario. Current audit outputs distinguish
before/update/after states. No Slither run, public testnet deployment or formal
verification is claimed. `VALIDATION.md` identifies the evidence and boundaries.

## 7. Improvements & Refinements

- Integrated the agreed specification and compiler interface into the review copy.
- Added an explicit localhost network and actual registrar deployment entry points.
- Added validation of treasury/network before deployment and a requirement for
  persistent HTTP networks when writing a frontend deployment record.
- Bound deployment records to source, compiled creation transaction, runtime code,
  ABI, chain and constructor; generated current frontend deployment settings.
- Added automated local lifecycle evidence and repeatable validation commands.
- Added three focused interface/deployment integration tests and five reproducible
  frontend findings with source/version evidence.
- Updated compatible dependency versions without forcing a Hardhat major downgrade,
  then reran tests. The remaining advisory is explicitly recorded.
- Replaced the title-only README with setup, deployment and integration instructions.

No Solidity logic change was made in this pass. The production build repair removes an unused icon and unreferenced component.
The existing frontend commit fixes several older findings, verified separately
against the current handler module; these fixes are attributed to that commit.
Remaining UI remediation and browser regressions are still pending.

## 8. Lessons Learned

The recorded work shows why success at one layer does not establish application
completion: 176 contract tests passed while the separate frontend failed to build
and retained assumptions about names, rounds, ownership and payments that were
inconsistent with the current contract.

A compiler-generated ABI and formal specification made those inconsistencies
easier to inspect and reproduce. Versioned archives prevented the older contract
inside the frontend ZIP from being mistaken for the current implementation.
Local deployment records made environment assumptions explicit instead of
treating an example address as a shared deployment.

AI assistance accelerated inspection, test construction and documentation, but
the evidence came from actual command execution and chain assertions. Generated
suggestions still needed context, reproducible checks and clear ownership of
integration work. Dependency reports also required interpretation: compatible
updates removed some findings, while a forced fix proposed breaking changes.

Before submission, incorporate B's fixes and browser results, A/B's actual tool
and prompt history, the team's actual deployment records, and the final fresh
setup and demo evidence. Keep unresolved limitations visible in the submitted report.
