# Requirements coverage

This maps all 29 checks in specification section 11 to evidence and remaining
work. Passing contract checks do not substitute for browser/wallet acceptance.
Source versions and every captured branch head are recorded in SOURCE_REVISIONS.md.

| ID | Specification check | Evidence | Current scope/status |
| --- | --- | --- | --- |
| R01 | Different wallets bid for one domain | DomainRegistrarAuction.t.sol | Contract checks passed |
| R02 | Different domains share a round | DomainRegistrarAuctionRecords.t.sol | Contract checks passed |
| R03 | Equal bids reveal in reverse order | DomainRegistrarAuction.t.sol | Contract checks passed |
| R04 | Wrong label, bid, salt, or caller | DomainRegistrarReveal.t.sol; DomainRegistrarBidRules.t.sol | Contract checks passed |
| R05 | Copied commitment or wrong chain, contract, or round | DomainRegistrarBidRules.t.sol; DomainRegistrar.ts | Contract checks passed |
| R06 | Exact deadline boundaries | DomainRegistrarRounds.t.sol; DomainRegistrarSettlement.t.sol | Contract checks passed |
| R07 | Incorrect deposit or duplicate operation | DomainRegistrarCommit.t.sol; DomainRegistrarAccounting.t.sol | Contract checks passed |
| R08 | Invalid name or out-of-range bid | DomainRegistrarBidRules.t.sol | Contract checks passed |
| R09 | Winner, loser, and missing reveal | DomainRegistrarSettlement.t.sol; DomainRegistrarAccounting.t.sol | Contract checks passed |
| R10 | No valid reveals | DomainRegistrarAccounting.t.sol | Contract checks passed |
| R11 | New round while an older domain is unfinished | DomainRegistrarAuctionRecords.t.sol; local smoke | Contract checks passed |
| R12 | Later round targets an older reserved name | DomainRegistrarAuctionRecords.t.sol | Contract checks passed |
| R13 | Multiple bidders reveal in the reserved round | DomainRegistrarAuction.t.sol; DomainRegistrarAuctionRecords.t.sol | Contract checks passed |
| R14 | Older domain finalizes after a new round starts | DomainRegistrarAuctionRecords.t.sol; local smoke | Contract checks passed |
| R15 | Earlier settlements and withdrawals after later rounds start | DomainRegistrarAccounting.ts; local smoke | Contract checks passed |
| R16 | Recipient rejects ETH or attempts reentrancy | DomainRegistrarWithdrawal.t.sol; DomainRegistrarPayments.t.sol | Contract checks passed |
| R17 | Commit transaction inspection | DomainRegistrarBidRules.ts | Contract checks passed; browser inspection pending |
| R18 | Frontend/contract commitment conformance | DomainRegistrar.ts; current frontend handler commit/reveal | Encoding verified; browser flow pending |
| R19 | Unauthorized or invalid address update | DomainRegistrarResolution.t.sol | Contract checks passed; browser controls pending |
| R20 | Backup round trip using `30000000000000001` wei | Contract exact-wei checks exist; browser backup schema/import incomplete | Open: FE-07 |
| R21 | Modified backup fields or mismatched stored commitment | NtuApp import lacks recomputation/on-chain comparison | Open: FE-07 |
| R22 | Refresh, wallet/network switching, and new rounds | Global storage key lacks chain/contract context; network guard absent | Open: FE-07 / FE-09 |
| R23 | Name recipient changes after preview | DomainRegistrarPayments.ts; current handler race check | Atomic call verified; preview confirmation pending |
| R24 | Recipient matches preview | DomainRegistrarPayments.ts; current handler check; local smoke | Protocol checked; browser confirmation pending |
| R25 | Payment receiver rejects ETH | DomainRegistrarPayments.t.sol | Contract checks passed |
| R26 | Zero payment, unknown name, or reserved name | DomainRegistrarPayments.t.sol | Contract checks passed; browser flow pending |
| R27 | Successful payment alongside locked auction funds | DomainRegistrarPayments.ts; local smoke | Contract checks passed |
| R28 | Different settlement and withdrawal orders | DomainRegistrarAccounting.t.sol | Contract checks passed |
| R29 | Fresh installation and deployment | Fresh contract install/validation and local deployment; frontend build repair | Contract/deployment verified; complete browser setup pending |

## Course deliverables

| Requirement | Current state |
| --- | --- |
| Domain registrar, commit/reveal, ownership and forward resolution | Contract implemented and tested; integrated browser acceptance pending. |
| Search, bid/reveal UI and ETH payments by name | Current frontend implements the main screens; latest handler checks verified; remaining findings recorded. |
| Short test phases and non-reveal policy | 120/120 seconds and 0.001 ETH penalty implemented and exercised. |
| Specification/tooling and representative prompt records | Included; actual A/B tool/prompt history still needed for the final group account. |
| Eight-section AI Audit Report and major-issue evidence | Working report/evidence included; unresolved items remain visible. |
| Complete reproducible code ZIP and README | Integration changes supplied; final fresh browser setup and submission packaging pending. |
| Demo video at most 10 minutes, architecture and deployed demonstration | Not recorded in this workflow. |
| Individual peer evaluation | Each member must complete the course process. |
| Reverse resolution | Optional bonus; not treated as a missing baseline feature. |

This checklist covers the supplied brief and specification. It does not replace
checking later course announcements or capture commits made after this bundle.
