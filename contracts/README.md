# .ntu registrar contracts

This Hardhat 3 project contains `DomainRegistrar.sol`, Solidity and Mocha
tests, ABI export, deployment verification and a local transaction scenario.
The root [README](../README.md) is the complete installation, wallet and
deployment guide; [`CONTRACT_INTERFACE.md`](../docs/CONTRACT_INTERFACE.md)
describes the registrar methods and events.

## Build and validate

Use Node.js 26 as specified by the repository's `.nvmrc`. From this directory:

```sh
npm ci
npm run validate
```

`validate` builds, exports `abi/DomainRegistrar.json`, typechecks, and runs
the contract and TypeScript tests. `npm run check:frontend` runs the focused
test against the current frontend handler. `npm run smoke:local` exercises a
deployed registrar on the running localhost chain.

## Deploy locally

In separate terminals, with dependencies installed:

```sh
npx hardhat node
```

```sh
npm run deploy:local
npm run verify:local
npm run smoke:local
```

The deployment script records the public chain/address information and
updates `../frontend/.env.local`. Restarting the local node clears its chain;
deploy again before using the frontend. For Sepolia configuration and the
deployment commands, follow the root README. Do not commit private keys or
reveal backups.
