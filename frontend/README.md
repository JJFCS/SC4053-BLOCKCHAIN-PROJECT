# .ntu web app

This React/Vite app connects a MetaMask wallet to the `DomainRegistrar`
contract. It supports name search, sealed bids and reveals, finalization,
settlement, resolution updates and ETH payments by name.

## Run and build

Use Node.js 26 as specified by the repository's `.nvmrc`. From this directory:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. To check the production build, run
`npm run build`. The root [README](../README.md) gives the complete local
Hardhat, deployment, MetaMask and Sepolia setup.

The registrar deployment script writes `VITE_REGISTRAR_ADDRESS` and
`VITE_CHAIN_ID` to `.env.local`; `.env.example` lists the required variable
names. Select that same chain for this site in MetaMask. The frontend keeps
the contract signatures it calls in `src/components/ntu/handlers.ts`; compare
them with `../contracts/abi/DomainRegistrar.json` when contract code changes.

Keep downloaded reveal backups safe until their bids have been revealed. They
contain the bid and salt; do not commit them, wallet credentials or `.env.local`
to Git. Browser results and known findings are recorded in
[`BROWSER_ACCEPTANCE.md`](../docs/BROWSER_ACCEPTANCE.md) and
[`FRONTEND_FINDINGS.md`](../docs/FRONTEND_FINDINGS.md).
