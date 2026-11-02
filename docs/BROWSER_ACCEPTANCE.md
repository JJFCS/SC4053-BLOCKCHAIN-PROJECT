# Browser acceptance checks

Manual walkthrough: 29 October–1 November 2026 on a persistent local Hardhat
chain (31337), registrar `0x5FbDB2315678afecb367f032d93F642f64180aa3`.
The app combined frontend-wallet `b753e49` with registrar-validation
`67f8874`; later corrections were incorporated on the validation branch.
Browser output was reported directly
by the tester. Full screenshots and transaction receipts are not attached.
This does not establish Sepolia browser behaviour.

Follow-up on 2 November used a fresh local Hardhat chain and the app on port
5174. In round #1, a MetaMask commit approval was rejected: the downloaded
backup and **Prepared, not submitted** record survived a page refresh. In round
#2, a commit was submitted with automining paused. The page was refreshed while
the transaction was pending and retained the bid as **Submitted, checking
chain** with no commitment ID. After mining, MetaMask reported the transaction
failed; the original UI remained on Submitted. With the receipt-reconciliation
correction applied locally, a further refresh displayed **Commit failed**.
The reason the transaction reverted was not established from the available
browser output. A later successful pending-receipt recovery is recorded below.
In round #3, a 0.02 ETH bid was confirmed as commitment #1 and remained
Committed with its ID after refresh. The page then displayed Reveal with
7m54s remaining despite a 120-second reveal configuration. A reveal attempt
returned `Bids can only be revealed during the reveal phase`; a later refresh
showed Ended and no valid reveal or reservation. The unrevealed deposit was
settled and withdrawn. The countdown mismatch occurred after local RPC time
advances; it has not been reproduced on Sepolia. A chain-timestamp countdown
and expired-action guard were prepared but need a browser retest.
In the next fresh local round, the corrected Commit countdown began at 2m
and continued decreasing after Refresh. After more than four minutes elapsed,
the page showed Reveal at 0s even after one `evm_mine` and Refresh. A direct
RPC read then reported round #4 in Reveal (`phase: 2`), latest block timestamp
`1793576034`, reveal deadline `1793576039`, and computer time `1793575786`:
the chain still had five seconds. The browser's extrapolated time had reached
zero before a block confirmed the deadline. A follow-up correction keeps the
contract-reported phase available, shows that it is awaiting a chain block,
and refreshes while the estimate has elapsed. With that correction applied,
the page displayed **Awaiting chain block**. After `evm_increaseTime` by six
seconds and `evm_mine`, Refresh displayed **Round ended**. This round had no
bid; the observation checks the phase display and transition.

In a later fresh-chain round #6, `receipt-pass-06.ntu` committed 0.02 ETH
against a 0.1 ETH deposit. With automining paused, the browser retained
**Submitted, checking chain** and no commitment ID after refresh. A manual
block at `commitEnd - 1` confirmed on-chain commitment #2; the browser then
showed Committed with ID #2. After a reveal-phase block, the page showed
**Awaiting chain block** when its time estimate elapsed. Searching the name
and mining another block inside the reveal window enabled Reveal. The reveal
transaction remained pending until it was mined at `revealEnd - 1`:
transaction status was 1 and on-chain `revealed` was true. The name was then
finalized to the bidder; direct reads showed round phase Ended, owner
`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, winning commitment #2,
`finalized: true`, reservation cleared and automining restored. Settlement
set `settled: true` and credited 0.08 ETH; after Withdraw the credit was
0 ETH with no pending transaction. MetaMask displayed transaction-failed
notifications during this sequence, including after the withdrawal. The
latest Failed entry in its Activity was an earlier round #5 `commitBid`:
`0xa7adb21b29c5c4de40a169c77bac0c0b95c5723d834f69eef75c2b8c9fef7188`
(block 22, receipt status 0, 0.1 ETH). The round #6 commit
`0x85164ee8367293a094014ed61018e06f598124928e719ddeda5954f26a2b11ea`
was confirmed in block 25 with receipt status 1. The direct chain reads
confirm the later successful reveal, finalization, settlement and withdrawal;
the repeated notification's trigger was not independently identified.

| Check | Observed result | Remaining limit |
| --- | --- | --- |
| Build and load | Integrated Vite app rendered; Windows contract suite reported 180 passing tests and frontend production build passed. | Final committed revision has not been rerun by another teammate. |
| Wallet/network | Two local wallets connected and switched. The earlier frontend produced `BAD_DATA` and a misleading Sepolia navbar on the wrong chain. After correction, local navbar showed Hardhat Local. With the site wallet switched to Sepolia (11155111) while `.env.local` remained on 31337, the page visibly warned `Wrong network: wallet chain 11155111, registrar chain 31337`, Search repeated that error, and start, bid, reveal, settlement and payment actions showed connection prompts or were unavailable. Stored local records remained visible. No transaction was requested. | After a separate page refresh, Connect Wallet was required again while stored records remained visible. The wrong-chain screen was tested against a local configuration; Sepolia browser operation was not tested. |
| Rounds and names | Fresh deployment showed no round; rounds #1–#7 progressed. Short and edge-hyphen names were rejected; a 32-character name searched. After correction `bad_name` remained in the field and validation rejected it. A later fresh local round #3 exposed a 7m54s Reveal countdown for a 120-second phase after RPC time advances; the contract rejected the late reveal, and the bid settled as unrevealed. Round #4's Commit countdown started at 2m and decreased across Refresh. After Reveal displayed 0s while the latest block still had five seconds, the follow-up showed Awaiting chain block and then Round ended after advancing and mining. | The follow-up was observed on the local chain without a bid; exact UI boundary timing and other case/suffix/overlong name variants were not manually recorded. |
| Commitment privacy | #7/#8 commit transactions had two arguments, 68 calldata bytes, a fixed 0.1 ETH deposit, and events containing only ID, round, bidder and digest. | Wallet, deposit and timing are necessarily public. |
| Pre-commit recovery | For round #7 `prepared-check-01.ntu`, the backup was downloaded, webpage confirmation canceled before MetaMask, and after page refresh the entry remained **Prepared, not submitted** with no commitment ID. Older bids remained listed. Round #6 #9 survived reload as Revealed and was later finalized/settled. Automated current-handler test observed a preapproval record and rejected wallet request without an on-chain commitment. The 2 November follow-up observed a rejected MetaMask approval and a pending transaction preserved across refresh, then a failed receipt correctly shown after the local correction. A separate round #6 pending commit survived reload and, after controlled mining, reconciled to commitment #2. | The successful delayed receipt used manually controlled local blocks. The prepared entry is also listed under Your commitments as Unrevealed; no on-chain commitment was made. |
| Backup integrity | Import repair restored #1/#2 IDs and commit times. #7's `0.030000000000000001` ETH amount, ID and settled status survived export/import. Modified bid, malformed salt, wrong chain/contract/wallet variants were rejected; valid records remained. | A different registrar deployment was not exercised end to end. |
| Competing bids and tie | Round #3: #4 bid 0.06 ETH beat #3 bid 0.04. Round #4: equal 0.05 ETH bids revealed in reverse order; earlier commitment #5 won over #6. | Contract tests generalize these observed examples. |
| Reservations and history | Round #4 began while round #3 name was unfinished; unrelated round #4 bidding worked and the older name finalized later. | Later-round reveal against an old reserved name was tested at contract level, not manually in browser. |
| Finalization/settlement | Round #3 finalized from a wallet other than the winner; round #5 finalized two independent names. Unrevealed #1 refunded 0.099 ETH, winners #2/#4 refunded 0.04, loser #3 refunded 0.1, round #4 winner #5 refunded 0.05 and loser #6 refunded 0.1. Round #5 #7 refunded exactly 69999999999999999 wei; max-bid winner #8 refunded zero. The earlier round #6 #9 was reported settled. In a separate fresh-chain round #6, `receipt-pass-06.ntu` finalized to the bidder; commitment #2 settled for 0.08 ETH credit, then withdrawal reduced the credit to zero. Earlier nonzero credits were withdrawn. | The earlier round #6 #9 refund amount and a duplicate settlement browser transaction were not separately recorded. Contract tests cover duplicates. |
| Resolution | An owner updated resolution without changing ownership. Nonowner update control was disabled; zero and registrar-self targets were rejected by UI. | Forced unauthorized update was covered by contract tests, not manual UI submission. |
| Payments | Earlier 0.01 ETH payment by name reached its recipient; RPC balance rose by 0.01 ETH without retaining payment value in escrow. The revised UI showed full recipient, 0.001 ETH and Hardhat Local chain 31337 before wallet approval. One request was canceled cleanly; a later 0.001 ETH payment to `local-test-2.ntu` succeeded (UI transaction `0x529b07…7eefbe`). In a second local browser run, a first tab previewed `receipt-pass-06.ntu` at `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`; its owner changed resolution to `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` in another tab (UI transaction `0xe5cce5…9c1cac`). Confirming the old preview displayed `The domain's resolution address changed before the payment was confirmed. Please review the new recipient before trying again.` A fresh preview showed the new address, and the UI reported a 0.001 ETH payment to it (`0xfdb826…d55e5f`). | The stale-recipient rejection and renewed confirmation were observed in the browser on Hardhat Local. Full transaction receipts and recipient balance for this later payment were not separately captured; Sepolia browser operation remains untested. |
| Error recovery | Declined payment left UI usable; round #6 displayed a live Reveal countdown after polling correction. The round #2 follow-up exposed a stale Submitted label after a failed receipt; the correction displayed Commit failed and disabled reveal. Round #3 showed a successful commit retained after refresh but a late reveal was rejected and could be settled. Round #4 showed Awaiting chain block followed by Round ended after a new block. A later paused-mining round #6 confirmed successful pending-receipt recovery after reload and a reveal mined one second before its deadline. | The latest Failed Activity entry was an earlier round #5 commit with receipt status 0; round #6 commit and subsequent contract state checks succeeded. The trigger of repeated alerts was not independently identified. |
| Fresh setup | Separate clean local clone plus patches installed both lockfiles offline, passed 180 tests and frontend build, deployed/verified locally, ran smoke scenario and served Vite with matching `.env.local`. | No independent teammate browser walkthrough from final commit. |

An earlier local RPC check after the 0.01 ETH payment showed recipient
`10000.01 ETH` and registrar `0.061 ETH` (winning price 0.06 plus 0.001 penalty).
The local chain must remain running to inspect these historical records. Do not
commit wallet credentials or live reveal preimages as public evidence.
