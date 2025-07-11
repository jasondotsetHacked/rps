# Rock Paper Scissors

This repo contains a simple Rock Paper Scissors smart contract with a minimal front-end.

## Requirements

- Node.js
- Hardhat

## Running locally

1. Install dependencies:

```bash
npm install
```

2. Start a local Hardhat node in one terminal:

```bash
npm run node
```

3. In another terminal deploy the contract to the local node:

```bash
npm run deploy
```

The deployment script writes the contract address to `frontend/deployed.json`.

4. Serve the front-end:

```bash
npm start
```

Open your browser at `http://localhost:8080` and connect with a wallet (e.g. Coinbase Wallet extension) that is configured to use the local Hardhat network (http://127.0.0.1:8545).

## Front-end

The front-end is located in the `frontend/` folder and uses plain HTML, CSS and JavaScript with `ethers.js`.
