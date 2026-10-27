# Source revisions and branch coverage

Snapshot: the uploaded complete Git bundle, captured on 27 October 2026.
The supplied Git status was clean. The bundle contains committed files/history;
it does not contain future pushes, external chat histories, or uncommitted work.

| Branch | Revision | Included in main |
| --- | --- | --- |
| `origin/feature/frontend-wallet` | `16decbd` | No |
| `origin/main` | `cb1f3c4` | Yes |
| `origin/onncera/registra-accounting` | `43fd443` | Yes |
| `origin/onncera/registra-auction-records` | `f0a746d` | Yes |
| `origin/onncera/registra-bid-rules` | `473ac59` | Yes |
| `origin/onncera/registra-commitments` | `69c2e5e` | Yes |
| `origin/onncera/registra-foundation` | `79e3c95` | Yes |
| `origin/onncera/registra-ownership` | `f5f8178` | Yes |
| `origin/onncera/registra-payments` | `70177ec` | Yes |
| `origin/onncera/registra-resolution` | `badd105` | Yes |
| `origin/onncera/registra-reveal` | `ecfbbd1` | Yes |
| `origin/onncera/registra-rounds` | `1ca74bd` | Yes |
| `origin/onncera/registra-settlement` | `14a35ea` | Yes |

All eleven contract feature tips are ancestors of main. The frontend branch is
the one unmerged feature tip in this snapshot; it contains main as its second
merge parent and has identical contract files. Its additional frontend work is
commit `66b12a2` followed by merge `16decbd`.

The integration patch is based on `16decbd` so the frontend history is retained.
Contract logic still comes from `cb1f3c4`; the deployment/validation additions do
not alter the original Solidity files.

The older `7217ac7` review is retained as historical evidence. Current findings
and handler checks use `16decbd`. See `REQUIREMENTS_COVERAGE.md` for all 29
specification checks and the remaining course deliverables. This inventory
accounts for the captured revisions; it is not a guarantee of zero defects.
