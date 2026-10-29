# .ntu Domain Registrar

A Solidity registrar and React web app for sealed-bid `.ntu` names. Users commit
and reveal bids, finalize a winning name, manage its resolution address, and send
test ETH to a registered name. The contract controls auctions, ownership,
refunds, and payments; the browser connects through MetaMask.

## Requirements

- Node.js 26 (see `.nvmrc`), npm, and MetaMask.
- For local testing, three terminals and a browser. Local Hardhat ETH is test
  currency; no public network or faucet is needed.

Run commands from the indicated directories. Dependencies are installed
separately for `contracts` and `frontend`.

## Build and test

```sh
cd contracts
npm ci
npm run validate
```

`validate` builds the contract, exports its ABI, typechecks the scripts, and runs
the Solidity and TypeScript tests. For a shorter rerun, use `npm test` from
`contracts`. To check the web build, run `npm ci` and `npm run build` from
`frontend`.

## Run locally

1. In terminal 1, from `contracts`, start a persistent chain:

   ```sh
   npx hardhat node
   ```

2. In terminal 2, from `contracts`, deploy and verify:

   ```sh
   npm run deploy:local
   npm run verify:local
   ```

   Deployment writes the current address and chain ID to `frontend/.env.local`
   and creates a public deployment record under `contracts/deployments/`.
   Restarting the Hardhat node clears contract state. Deploy again, even if the
   new deployment receives the same address.

3. In terminal 3, from `frontend`, install and start the web app:

   ```sh
   npm ci
   npm run dev
   ```

   Open the URL printed by Vite, normally `http://localhost:5173/`. Restart Vite
   after changing `.env.local` if it does not reload the new configuration.

4. Add a MetaMask test network with RPC URL `http://127.0.0.1:8545`, chain ID
   `31337`, and currency symbol `ETH`. Import a funded *local Hardhat test
   account* from the node's terminal output and connect that account to the
   page. Check the wallet's selected network for the site before using it.

Local Hardhat usually mines when a transaction arrives. For a live auction
countdown without extra transactions, enable a block every five seconds from
`contracts` in terminal 2:

```sh
node --input-type=module -e "import {JsonRpcProvider} from 'ethers'; const rpc=new JsonRpcProvider('http://127.0.0.1:8545'); console.log(await rpc.send('evm_setIntervalMining',[5000]));"
```

The contract does not start an auction automatically. Connect the wallet and
choose **Start round** in the app. Each round has a 120-second commit phase and
a 120-second reveal phase. The fixed commitment deposit is 0.1 ETH, the maximum
bid is 0.1 ETH, and a commitment not validly revealed incurs a 0.001 ETH
penalty. Download the bid backup after committing; its salt is needed to reveal.
After the reveal deadline, finalize the domain, settle the deposit, and withdraw
any credited refund. The domain owner can change its resolution address. The
payment form sends ETH to the address resolved by the contract.

## Sepolia deployment

The `sepolia` network needs `SEPOLIA_RPC_URL`, `SEPOLIA_PRIVATE_KEY`, and a
nonzero `TREASURY_ADDRESS`. Store credentials outside the repository; Hardhat's
keystore can hold configuration secrets. From `contracts`, use:

```sh
npx hardhat run scripts/deploy-registrar.ts --network sepolia
npx hardhat run scripts/verify-deployment.ts --network sepolia
```

The deployment script also updates `frontend/.env.local` for that chain. To use
an existing deployment, set `VITE_REGISTRAR_ADDRESS` and `VITE_CHAIN_ID` in
`frontend/.env.local`; `frontend/.env.example` shows the variable names. Use
the ABI exported in `contracts/abi/DomainRegistrar.json` for matching contract
interfaces. `contracts/deployments/` holds generated deployment records.

## Project documents

- `docs/SPEC.md`: behaviour and acceptance criteria.
- `docs/CONTRACT_INTERFACE.md`: contract methods and events.
- `docs/VALIDATION.md`, `docs/BROWSER_ACCEPTANCE.md`, and
  `docs/REQUIREMENTS_COVERAGE.md`: observed checks and remaining coverage.
- `docs/FRONTEND_FINDINGS.md`: known frontend integration limitations.
- `docs/AI_AUDIT_REPORT.md`: development and audit account.

Browser checks and outstanding issues are tracked in those documents. A passing
contract suite does not by itself establish that every wallet and UI path works.
