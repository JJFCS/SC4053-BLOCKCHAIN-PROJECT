# Requirements coverage

This maps all 29 checks in specification section 11 to evidence through
5 November 2026. Contract checks and browser observations are
separate. SOURCE_REVISIONS.md is a historical snapshot; later browser revisions
are identified in BROWSER_ACCEPTANCE.md.

| ID | Specification check | Evidence | Current scope/status |
| --- | --- | --- | --- |
| R01 | Different wallets bid for one domain | DomainRegistrarAuction.t.sol; browser round #3 | Higher 0.06 ETH bid won over 0.04 ETH |
| R02 | Different domains share a round | DomainRegistrarAuctionRecords.t.sol; browser round #5 | Two names revealed and finalized independently |
| R03 | Equal bids reveal in reverse order | DomainRegistrarAuction.t.sol; browser round #4 | Earlier commitment #5 won |
| R04 | Wrong label, bid, salt, or caller | DomainRegistrarReveal.t.sol; DomainRegistrarBidRules.t.sol | Contract checks passed |
| R05 | Copied commitment or wrong chain, contract, or round | DomainRegistrarBidRules.t.sol; DomainRegistrar.ts | Contract checks passed |
| R06 | Exact deadline boundaries | DomainRegistrarRounds.t.sol; DomainRegistrarSettlement.t.sol | Contract checks passed |
| R07 | Incorrect deposit or duplicate operation | DomainRegistrarCommit.t.sol; DomainRegistrarAccounting.t.sol | Contract checks passed |
| R08 | Invalid name or out-of-range bid | DomainRegistrarBidRules.t.sol | Contract checks passed |
| R09 | Winner, loser, and missing reveal | DomainRegistrarSettlement.t.sol; DomainRegistrarAccounting.t.sol | Contract checks passed |
| R10 | No valid reveals | DomainRegistrarAccounting.t.sol | Contract checks passed |
| R11 | New round while an older domain is unfinished | DomainRegistrarAuctionRecords.t.sol; local smoke; browser rounds #3/#4 | Contract and browser checks passed |
| R12 | Later round targets an older reserved name | DomainRegistrarAuctionRecords.t.sol | Contract checks passed |
| R13 | Multiple bidders reveal in the reserved round | DomainRegistrarAuction.t.sol; DomainRegistrarAuctionRecords.t.sol | Contract checks passed |
| R14 | Older domain finalizes after a new round starts | DomainRegistrarAuctionRecords.t.sol; local smoke; browser rounds #3/#4 | Contract and browser checks passed |
| R15 | Earlier settlements and withdrawals after later rounds start | DomainRegistrarAccounting.ts; local smoke; browser rounds #3/#4 | Earlier credits remained claimable |
| R16 | Recipient rejects ETH or attempts reentrancy | DomainRegistrarWithdrawal.t.sol; DomainRegistrarPayments.t.sol | Contract checks passed |
| R17 | Commit transaction inspection | DomainRegistrarBidRules.ts; parsed local #7/#8 transactions/events | No label, amount or salt in two observed commits |
| R18 | Frontend/contract commitment conformance | DomainRegistrar.ts; current handler test; browser reveals #2–#9 | Same encoding exercised across browser and contract |
| R19 | Unauthorized or invalid address update | DomainRegistrarResolution.t.sol; local browser | Nonowner UI disabled, zero/self targets rejected; direct unauthorized call covered by contract tests |
| R20 | Backup round trip using `30000000000000001` wei | Local browser #7 export/import and settlement | Exact bid and `69999999999999999` wei refund observed |
| R21 | Modified backup fields or mismatched stored commitment | Browser negative imports; digest and on-chain checks; final code backup retest | Modified bid/salt/chain/contract/wallet rejected; final code restored settled #1 and original timestamp from backup while older records remained |
| R22 | Refresh, wallet/network switching, and new rounds | Browser rounds #1–#7; scoped storage; network guard; final code browser run | Final code prepared bid and pending transaction survived refresh; wallet-scoped export and chain reconciliation passed. Wrong-chain page showed visible 11155111/31337 warning and blocked reads/writes |
| R23 | Name recipient changes after preview | DomainRegistrarPayments.ts; current FrontendCurrentFlow.ts; local browser | Old preview rejected after resolution changed in a second tab; new review displayed the changed recipient and the UI reported a 0.001 ETH payment |
| R24 | Recipient matches preview | DomainRegistrarPayments.ts; current handler test; browser 0.001 ETH payment | New preview showed full recipient/chain/amount; successful revised UI send observed |
| R25 | Payment receiver rejects ETH | DomainRegistrarPayments.t.sol | Contract checks passed |
| R26 | Zero payment, unknown name, or reserved name | DomainRegistrarPayments.t.sol; local browser | Zero payment disabled and unknown name rejected in UI; contract tests cover reserved names |
| R27 | Successful payment alongside locked auction funds | DomainRegistrarPayments.ts; local smoke; browser RPC balances | Recipient +0.01 ETH; prior escrow remained 0.061 ETH |
| R28 | Different settlement and withdrawal orders | DomainRegistrarAccounting.t.sol | Contract checks passed |
| R29 | Fresh installation and deployment | Earlier clean clone; final code revision `e63143b`: 182 tests, build/lint/typecheck, fresh Windows installs, local deploy/verify and Vite browser | Final code local setup matched chain 31337, registrar address and ABI; Sepolia browser run outside this check |

## Course deliverables

| Requirement | Current state |
| --- | --- |
| Domain registrar, commit/reveal, ownership and forward resolution | Contract tests and multiple local browser registration/payment flows exercised, including competing bids and refunds. |
| Search, bid/reveal UI and ETH payments by name | Current frontend implements the main screens; handler tests and local browser checks verified the key flows. Findings are recorded in `FRONTEND_FINDINGS.md`. |
| Short test phases and non-reveal policy | 120/120 seconds and 0.001 ETH penalty implemented and exercised. |
| Specification and validation tooling | Specification and validation workflow documented; available AI workflow evidence is described in the audit report. |
| Eight-section AI Audit Report and major-issue evidence | Report and evidence updated through 5 November; code PR #12 and documentation PR #13 merged into main as `cc7e309` and `4006260`, respectively. |
| Complete reproducible code ZIP and README | Clean local command-line setup passed on final code revision; assemble the final code package for submission. |
| Demo video at most 10 minutes, architecture and deployed demonstration | Not recorded in this workflow. |
| Individual peer evaluation | Each member must complete the course process. |
| Reverse resolution | Optional bonus; not treated as a missing baseline feature. |

This checklist covers the supplied brief and specification. Check later course
announcements and any code changes made after the recorded validation runs.
