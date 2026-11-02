# Browser acceptance checks

Manual checks were performed from 29 October to 2 November 2026 on local
Hardhat chain 31337, registrar
`0x5FbDB2315678afecb367f032d93F642f64180aa3`. The app combined
frontend-wallet `b753e49` with changes on `feature/registrar-validation`.
The results below come from reported browser and terminal output. Detailed
defect analysis and transaction checks are in `FRONTEND_FINDINGS.md` and
`VALIDATION.md`. Sepolia browser behaviour is outside this local run.

| Check | Observed result |
| --- | --- |
| Build and load | The integrated Vite app rendered and the frontend production build passed. A separate clean local clone of an earlier integrated revision installed both lockfiles offline, passed 180 tests, built the frontend, deployed and verified locally, ran smoke checks and served Vite with matching chain/address settings. |
| Wallet and network | Two local wallets connected and switched. After the network correction, the navbar displayed Hardhat Local on chain 31337. Switching the site's wallet to Sepolia while the app targeted 31337 produced a visible chain-mismatch warning; Search and write actions were blocked, and saved records remained visible. |
| Rounds and names | A fresh deployment showed no round; local rounds #1–#7 progressed through commit, reveal and end. Short and edge-hyphen names were rejected; a 32-character label searched. After input correction, `bad_name` remained visible and Search rejected it. A chain-clock correction replaced a misleading late Reveal countdown with **Awaiting chain block**, followed by **Round ended** after a new block. |
| Commitment privacy | Parsed #7/#8 commit transactions had two arguments, 68 calldata bytes and a fixed 0.1 ETH deposit. Their events contained commitment ID, round, bidder and digest, with no label, bid or salt in calldata or events. |
| Bid preparation and recovery | Canceling webpage confirmation and rejecting MetaMask approval left recoverable **Prepared, not submitted** records after reload. With mining paused, a pending round #2 commit survived reload and a failed receipt later appeared as **Commit failed** after the UI correction. In a separate fresh-chain round #6, a pending 0.02 ETH commit survived reload and reconciled to on-chain commitment #2 after mining. Its reveal transaction succeeded in a block one second before the deadline. |
| Backup integrity | Re-import restored original IDs and commit times for #1/#2. Bid #7 retained exactly `30000000000000001` wei and its settled state. Modified bid, malformed salt, wrong chain, registrar and wallet imports were rejected while existing records remained available. |
| Competing bids and ties | Round #3 commitment #4 won with 0.06 ETH against #3's 0.04 ETH. Round #4 equal 0.05 ETH bids were revealed in reverse order, and earlier commitment #5 won over #6. |
| Reservations and history | Round #4 accepted an unrelated name while a round #3 name was unfinished; the older name was finalized later. The contract suite separately tests attempts against an older reserved name. |
| Finalization, settlement and withdrawal | Round #3 was finalized by a wallet other than the winner. Browser runs covered a 0.099 ETH missing-reveal refund, 0.1 ETH loser refund, 0.04 ETH winner refunds, a zero-refund winner, and exact `69999999999999999` wei credit. A later fresh-chain winning bid credited 0.08 ETH and withdrawal reduced its credit to zero. Settled records showed no **Settle bid** action; contract tests reject duplicate settlement. |
| Resolution | An owner changed the resolution address without transferring ownership. A nonowner saw the update control disabled; zero and registrar-self targets were rejected. Contract tests cover unauthorized calls that bypass the UI. |
| Payments | A 0.01 ETH payment by name increased the recipient's RPC balance by 0.01 ETH while the registrar retained auction proceeds and penalty. The revised UI previewed the full recipient, amount and Hardhat Local chain before approval. For `receipt-pass-06.ntu`, the owner changed resolution in a second tab after the first tab previewed `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. Confirming the old preview displayed the recipient-changed error. Fresh review showed `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`, and the UI reported a 0.001 ETH payment (`0xfdb826…d55e5f`). |
| Error recovery | A canceled payment left the form usable. A rejected bid retained its backup. A failed pending commit was shown as failed after receipt reconciliation, while a successful pending commit recovered its on-chain ID. A late reveal was rejected by the contract and its unrevealed deposit was settled and withdrawn. |

The first local payment balance check reported recipient `10000.01 ETH` and
registrar `0.061 ETH` (0.06 ETH winning price plus 0.001 ETH non-reveal
penalty). The later 0.001 ETH payment is recorded from the UI result. The
local chain must remain running to query those historical records again.
