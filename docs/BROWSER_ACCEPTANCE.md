# Browser acceptance checks

Manual walkthrough: 29–30 October 2026, local Hardhat chain 31337, registrar
`0x5FbDB2315678afecb367f032d93F642f64180aa3`. The frontend combined
registrar-validation `c2f8bcc` and frontend-wallet `b753e49`; the backup-import
repair was applied locally afterward. These results come from the browser and
command output of that walkthrough. They do not establish behaviour on Sepolia
or a fresh checkout. No full browser receipts or screenshots are attached here.

| Check | Steps and expected outcome | Result |
| --- | --- | --- |
| Build and load | Fresh install/build succeeds; correct application renders. | Production build passed and local Vite page rendered. Fresh checkout pending. |
| Wallet/network | Connect funded test wallet; reject unsupported chain; refresh state after wallet/chain changes. | Local test wallet connected. On Sepolia, local contract reads failed with `BAD_DATA` instead of a network warning; navbar still said Sepolia on chain 31337. Network guard remains open. |
| First round | Fresh deployment is shown with no round; starting a round gives full 120-second windows. | No round shown after local deployment; round #1 started. Exact UI duration boundaries not checked. |
| Name handling | Case/suffix/outer whitespace normalize; 1–2, 33+, invalid ASCII and edge-hyphen names are rejected. | Two valid local labels searched; invalid-input cases pending. |
| Commitment privacy | Browser computes the digest; commit transaction contains no label, bid or salt. | Pending |
| Pre-commit recovery | Backup exists before wallet approval; rejection, reload during submission, and delayed receipts preserve recoverable state. | Pending; backup was downloaded after a successful commit. |
| Backup integrity | Export/import exact wei; reject tampered, malformed, wrong-chain/contract/wallet records without replacing valid data. | Partial: same-wallet import of two settled records succeeded after the local import repair, restoring on-chain IDs #1/#2, status, and original commit times. Exact-wei and rejection cases pending. |
| Competing bids | Two wallets commit/reveal one name; highest bid wins and earlier commit wins equal bids. | Pending |
| Reservations/history | Unfinalized old name remains reserved while a later round can accept an unrelated name. | Pending |
| Finalization | Anyone can finalize after the deadline; registered owner and recipient are shown separately. | Round #2 domain finalized and displayed its owner and resolution address. Finalization by a different wallet pending. |
| Settlement/withdrawal | Winner D−B, loser D, missing reveal D−P; each settles once; withdrawals use credits and a zero-refund winner is handled. | Partial: unrevealed round #1 returned 0.099 ETH; winning bid of 0.06 ETH in round #2 returned 0.04 ETH; both credits withdrawn to zero. Loser, duplicate, and zero-refund browser cases pending. |
| Address management | Only owner updates resolution; ownership stays fixed; zero/self targets fail. | Owner updated the round #2 domain to another address; ownership stayed with the bidder. Unauthorized/invalid targets pending. |
| Payments | Full recipient/network/value preview; canonical checked call; stale recipient fails and needs fresh confirmation. | Partial: 0.01 ETH payment by name succeeded and recipient balance rose by 0.01 ETH. Full pre-transaction recipient confirmation and stale-recipient browser case remain open. |
| Error recovery | Rejected wallet approvals and reverted transactions leave the UI usable and preserve bid data. | At countdown zero, Refresh appeared to stall; reloading recovered the ended round. Other rejection cases pending. |
| Fresh setup | Another teammate follows README, deploys and runs the integrated app with matching address/ABI. | Pending |

The local RPC balance check after the successful payment reported recipient
`10000.01 ETH` and registrar `0.061 ETH`. The registrar amount matches the
`0.06 ETH` winning price plus the `0.001 ETH` non-reveal penalty, with the
separate `0.01 ETH` payment forwarded. The local chain must remain running for
these historical records to be queried again.

Capture representative receipts/screenshots for the final audit. Do not place
wallet credentials or live bid preimages in shared evidence.
