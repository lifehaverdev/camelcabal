# CAMEL Pre-Launch Checklist

Working checklist for final days before launch. Items ordered by dependency and priority.

---

## 1. Contract Hardening

- [x] **Fix ownership TODO in CAMEL.sol** — resolved: `pullOwner()` doesn't fire during construction (no runtime code for self-staticcall). Added post-deploy `pullOwner()` step to LAUNCH_RUNBOOK.md, documented in CAMEL.sol, added 4 tests to TestDeployment.t.sol
- [ ] **Finalize `launch-config.json`** values:
  - [ ] `team.artist` — currently `0x000...000` (placeholder)
  - [x] `liquidity.initialWethAmount` — confirmed `0` (single-sided LP)
  - [x] `whitelist.merkleRoot` — set to `0x8ed508...` from camel.json (17,904 addresses)
  - [ ] `token.unrevealedURI` — currently `ipfs://YOUR_CID/unrevealed.json`
- [x] **Run full test suite** — 367 tests passed, 0 failed, 3 skipped (fork tests need RPC)
- [x] **Review Slither high finding** — arbitrary `from` in `transferFrom` (LiquidityManager pulling from Camel contract). Acceptable: `camel` is immutable, approval is explicit via `setLiquidityManager()`, caller is role-gated (`LIQUIDITY_ROLE` + `nonReentrant`). Standard treasury management pattern.

---

## 2. Assets & Metadata

- [ ] **Receive final NFT artwork from artist**
- [ ] **Upload unrevealed metadata to IPFS** — pin it, get the CID
- [ ] **Update `token.unrevealedURI`** in `launch-config.json` with real CID
- [ ] **Prepare revealed metadata** — JSON + images for post-reveal (can be done post-launch)

---

## 3. Whitelist

- [x] **Finalize whitelist addresses** — 17,904 addresses (sxCYPH, Remilio, Milady, CULT) in `src/data/camel.json`
- [x] **Generate merkle tree** — root in camel.json, proofs generated client-side via merkle.js
- [x] **Update `whitelist.merkleRoot`** in `launch-config.json`
- [x] **Set up proof serving** — merkle.js builds tree from camel.json, generates proofs on-demand. TabbedCard.js updated to use merkle.js in production (stageData fallback for dev)

---

## 4. Frontend Polish

- [x] **Add EIP-6963 support** — micro-web3 1.4.2 + microact 0.2.2 (icon trim fix, `static get styles()` injection). Spec in `docs/EIP6963_SPEC.md`. SVG imports use `?raw` for inline markup.
- [ ] **Test wallet connection flows** — connect, disconnect, wrong chain, switch chain
- [ ] **Test error states** — RPC down, tx revert, insufficient balance, slippage failure
- [ ] **Mobile testing** — all tabs functional on phone browsers
- [x] **Update chain ID for mainnet** — set to chain ID 1, public RPC (eth.llamarpc.com), stage: "prelaunch"
- [x] **Portfolio tab** — ships with "coming soon" placeholder pre-launch (Trade tab too)
- [ ] **Whitepaper page** — content drafted and linked

---

## 5. Deploy Website to Custom Domain

### DNS Setup
- [ ] **Purchase/configure domain** (if not already owned)
- [ ] **Add DNS records** pointing to GitHub Pages:
  - For apex domain (`example.com`): A records pointing to GitHub's IPs
    ```
    185.199.108.153
    185.199.109.153
    185.199.110.153
    185.199.111.153
    ```
  - For `www` subdomain: CNAME record to `<username>.github.io`

### Repository Setup
- [x] **Fix vite base path** — change from `/camel404/` to `/` for custom domain:
  ```js
  // vite.config.js
  base: command === 'build' ? '/' : '/',
  ```
- [x] **Add CNAME file** to `public/` directory with `camelcabal.fun` (persists through builds)
- [ ] **Configure GitHub Pages** — go to repo Settings > Pages, set custom domain
- [ ] **Enable HTTPS** — check "Enforce HTTPS" in GitHub Pages settings (wait for cert provisioning)

### Verify
- [ ] **Push to main** and confirm GitHub Actions deploys successfully
- [ ] **Test domain** — site loads on custom domain with HTTPS
- [ ] **Test deep links** — hash routes (`#admin`, `#whitepaper`) work correctly

---

## 6. Deployment Dry Run

- [ ] **Run full fork deployment** — `npm run chain:start:full` end-to-end
- [ ] **Test atomic launch** — verify `launchWithLiquidity()` on fork:
  - Pool creates correctly
  - Sniper tax is active (99%)
  - LP position minted and held by contract
  - Token ordering (CAMEL vs WETH) is correct
- [ ] **Test whitelist mint** on fork — claim with a test address, verify proof
- [ ] **Test frontend against fork** — connect wallet, mint, swap, check balances
- [ ] **Walk through LAUNCH_RUNBOOK.md** step by step — confirm nothing is outdated

---

## 7. Mainnet Deployment

_Only after all above items are checked._

- [ ] **Fund deployer wallet** — enough ETH for gas + initial WETH for liquidity
- [ ] **Deploy contracts** — follow LAUNCH_RUNBOOK.md Stage 1
- [ ] **Verify on Etherscan** — both Camel404 and LiquidityManager
- [ ] **Update frontend** with deployed addresses (`src/generated/`)
- [ ] **Push frontend update** — GitHub Actions auto-deploys to domain
- [ ] **Submit to aggregators** — 1inch, 0x, Paraswap (Stage 2 of runbook)

---

## 8. Launch

- [ ] **Final pre-launch checklist** from LAUNCH_RUNBOOK.md Stage 2
- [ ] **Execute `launchWithLiquidity()`** — the big red button (Stage 3)
- [ ] **Post-launch verification** — pool exists, tax active, LP locked
- [ ] **Monitor** — watch for issues in first hours during tax decay period

---

## Notes

- The LAUNCH_RUNBOOK.md has the detailed technical steps for deployment stages
- Contract tests and audit prep docs are in `contracts/test/` and `AUDIT_PREP/`
- Emergency procedures are documented in the runbook
- **Pre-launch site** deployed to `camelcabal.fun` — Trade/Portfolio show "coming soon" placeholders, Claim tab runs whitelist check but hides mint button ("Minting opens at launch"), Chart/Stake tabs unchanged. Contracts object is empty so all `contractsInfo?.contracts?.camel` guards naturally short-circuit.
