# Browser acceptance checks

Status: not performed in the automated validation. Run these against the actual
integrated frontend and deployed registrar. Add real results, revision, network,
and evidence references after execution; the expected column is not an observed result.

| Check | Steps and expected outcome | Result |
| --- | --- | --- |
| Build and load | Fresh install/build succeeds; correct application renders. | Pending |
| Wallet/network | Connect funded test wallet; reject unsupported chain; refresh state after wallet/chain changes. | Pending |
| First round | Fresh deployment is shown with no round; starting a round gives full 120-second windows. | Pending |
| Name handling | Case/suffix/outer whitespace normalize; 1–2, 33+, invalid ASCII and edge-hyphen names are rejected. | Pending |
| Commitment privacy | Browser computes the digest; commit transaction contains no label, bid or salt. | Pending |
| Pre-commit recovery | Backup exists before wallet approval; rejection, reload during submission, and delayed receipts preserve recoverable state. | Pending |
| Backup integrity | Export/import exact wei; reject tampered, malformed, wrong-chain/contract/wallet records without replacing valid data. | Pending |
| Competing bids | Two wallets commit/reveal one name; highest bid wins and earlier commit wins equal bids. | Pending |
| Reservations/history | Unfinalized old name remains reserved while a later round can accept an unrelated name. | Pending |
| Finalization | Anyone can finalize after the deadline; registered owner and recipient are shown separately. | Pending |
| Settlement/withdrawal | Winner D−B, loser D, missing reveal D−P; each settles once; withdrawals use credits and a zero-refund winner is handled. | Pending |
| Address management | Only owner updates resolution; ownership stays fixed; zero/self targets fail. | Pending |
| Payments | Full recipient/network/value preview; canonical checked call; stale recipient fails and needs fresh confirmation. | Pending |
| Error recovery | Rejected wallet approvals and reverted transactions leave the UI usable and preserve bid data. | Pending |
| Fresh setup | Another teammate follows README, deploys and runs the integrated app with matching address/ABI. | Pending |

Capture representative receipts/screenshots and failed-then-passing checks for
fixed issues. Keep seed phrases, private keys and live bid preimages out of shared evidence.
