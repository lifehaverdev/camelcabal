# Micro Web3 + Anvil Starter

This template wires Microact, Micro Web3, and a simple Foundry project so you can build dApps against a forked mainnet without leaving your laptop.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`foundryup` + `anvil` + `forge`)
- Node.js 18+
- A browser wallet capable of connecting to a custom RPC (Rabby, MetaMask, etc.)

## Workflow

1. Copy `.env.example` to `.env.local` and set `USER_ADDRESS` to your wallet (optional but recommended).
2. Run the setup helper once to install Foundry stdlib dependencies:
   ```bash
   npm run setup
   ```
3. Start the local chain, deploy Counter.sol, and fund your wallet. You can customize the port/RPC, or send Anvil to the background with `--background`:
   ```bash
   npm run chain:start
   npm run chain:start -- --port 8550        # example overriding the RPC port
   npm run chain:start -- --rpc-url http://127.0.0.1:9000
   npm run chain:start -- --port 8551 --background
   npm run chain:stop                        # cleanly shuts down the tracked Anvil instance
   ```
   This launches `anvil --fork-url $FORK_RPC_URL`, waits for the JSON-RPC endpoint, runs `forge build`, deploys `Counter.sol` via ethers, and funds `USER_ADDRESS` with fork ETH.
4. In another terminal, run the front-end:
   ```bash
   npm run dev
   ```
5. Point your wallet at `http://127.0.0.1:8545` (Chain ID 31337), connect through the floating wallet button, and interact with the Counter component.

Restart `npm run chain:start` any time you want a fresh fork. The deployment script always writes the current ABI/address to `src/generated/contract.json`, so Vite can import it during builds and deploys to static hosts like GitHub Pages.
