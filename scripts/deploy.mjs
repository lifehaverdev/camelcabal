#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { ethers } from 'ethers';
import { validateConfig } from './validate-config.mjs';
import pkg from 'merkletreejs';
const { MerkleTree } = pkg;

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(__filename, '..', '..');
const contractsDir = path.join(projectRoot, 'contracts');
const generatedDir = path.join(projectRoot, 'src', 'generated');

// Contract artifact paths
const camelArtifactPath = path.join(contractsDir, 'out', 'CAMEL.sol', 'Camel404.json');
const liquidityManagerArtifactPath = path.join(contractsDir, 'out', 'LiquidityManager.sol', 'LiquidityManager.json');

// Load launch-config.json — single source of truth for all deployment constants
const launchConfigPath = path.join(projectRoot, 'launch-config.json');
const launchConfig = JSON.parse(fsSync.readFileSync(launchConfigPath, 'utf8'));

loadEnvFiles();

defaultEnv('RPC_URL', 'http://127.0.0.1:8545');
defaultEnv('CHAIN_ID', '31337');

// Protocol addresses from config
const CYPHER_CONTRACTS = {
  WETH: launchConfig.protocol.weth,
  ALGEBRA_FACTORY: launchConfig.protocol.algebraFactory,
  POSITION_MANAGER: launchConfig.protocol.positionManager,
  SWAP_ROUTER: launchConfig.protocol.swapRouter,
  // These are not in launch-config.json (anvil-only / not needed for production deploy)
  QUOTER: '0x02f22D58d161d1C291ABfe88764d84120f20F723',
  AGGREGATOR: '0x37CA43556BB981ca6827b4A92369a28Eb61995E3'
};

// Minimal ABIs for Cypher Protocol contracts
const WETH_ABI = [
  'function deposit() payable',
  'function withdraw(uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 value) returns (bool)'
];

const ALGEBRA_FACTORY_ABI = [
  'function createPool(address tokenA, address tokenB, bytes) returns (address pool)',
  'function poolByPair(address tokenA, address tokenB) view returns (address pool)'
];

const ALGEBRA_POOL_ABI = [
  'function initialize(uint160 initialPrice)',
  'function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)',
  'function tickSpacing() view returns (int24)',
  'function liquidity() view returns (uint128)'
];

const POSITION_MANAGER_ABI = [
  'function mint(tuple(address token0, address token1, address deployer, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline) params) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
];

const SWAP_ROUTER_ABI = [
  'function exactInputSingle(tuple(address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) params) payable returns (uint256 amountOut)',
  'function exactInputSingleSupportingFeeOnTransferTokens(tuple(address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) params) payable returns (uint256 amountOut)',
  'function multicall(bytes[] calldata data) payable returns (bytes[] memory results)',
  'function refundNativeToken() payable'
];

// Anvil default test accounts (accounts 1-4; account 0 is the deployer)
const TEST_ACCOUNTS = [
  { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', key: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' },
  { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', key: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' },
  { address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', key: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' },
  { address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', key: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a' }
];

const STAGES = ['pre-launch', 'mints', 'trading', 'full'];

const DEFAULT_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function loadEnvFiles() {
  const files = ['.env', '.env.local'];
  for (const file of files) {
    const full = path.join(projectRoot, file);
    if (!fsSync.existsSync(full)) continue;
    const content = fsSync.readFileSync(full, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
      const [rawKey, ...rest] = line.split('=');
      const key = rawKey.trim();
      const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

function defaultEnv(key, value) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const cliArgs = parseArgs();
if (cliArgs['rpc-url']) {
  process.env.RPC_URL = cliArgs['rpc-url'];
}

async function runForgeBuild() {
  await new Promise((resolve, reject) => {
    const forge = spawn('forge', ['build'], { cwd: contractsDir, stdio: 'inherit' });
    forge.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('forge build failed. Is Foundry installed?'));
      }
    });
  });
}

function loadArtifactBytes(artifact) {
  if (artifact.bytecode?.object) {
    return artifact.bytecode.object;
  }
  if (artifact.bytecode) {
    return artifact.bytecode;
  }
  throw new Error('Unable to find bytecode inside artifact.');
}

export async function deployCamel({ silent = false, stage = 'pre-launch' } = {}) {
  // Validate config before any chain interaction
  const configErrors = validateConfig(launchConfig, { silent });
  if (configErrors > 0) {
    throw new Error(`Config validation failed with ${configErrors} error(s). Fix launch-config.json before deploying.`);
  }

  if (!silent) {
    console.log('\n[deploy] Building contracts with Foundry...');
  }
  await runForgeBuild();

  // Load artifacts
  const camelArtifactRaw = await fs.readFile(camelArtifactPath, 'utf8');
  const camelArtifact = JSON.parse(camelArtifactRaw);

  const lmArtifactRaw = await fs.readFile(liquidityManagerArtifactPath, 'utf8');
  const lmArtifact = JSON.parse(lmArtifactRaw);

  const rpcUrl = process.env.RPC_URL;
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;
  const wallet = new ethers.Wallet(privateKey, provider);
  const deployerAddress = await wallet.getAddress();

  if (!silent) {
    console.log(`[deploy] Deploying CAMEL404 system from ${deployerAddress} to chain ${network.chainId}`);
    console.log(`[deploy] Using Cypher Protocol Algebra V4 contracts:`);
    console.log(`         WETH: ${CYPHER_CONTRACTS.WETH}`);
    console.log(`         PositionManager: ${CYPHER_CONTRACTS.POSITION_MANAGER}`);
    console.log(`         SwapRouter: ${CYPHER_CONTRACTS.SWAP_ROUTER}`);
    console.log(`         AlgebraFactory: ${CYPHER_CONTRACTS.ALGEBRA_FACTORY}`);
  }

  // Deploy CAMEL token
  if (!silent) {
    console.log('\n[deploy] Deploying Camel404 token...');
  }

  const camelFactory = new ethers.ContractFactory(
    camelArtifact.abi,
    loadArtifactBytes(camelArtifact),
    wallet
  );

  const camelContract = await camelFactory.deploy(
    launchConfig.token.name,
    launchConfig.token.symbol,
    ethers.BigNumber.from(launchConfig.token.maxSupply),
    launchConfig.token.liquidityReservePercent,
    launchConfig.token.projectReservePercent,
    CYPHER_CONTRACTS.WETH,
    deployerAddress, // owner
    CYPHER_CONTRACTS.POSITION_MANAGER,
    launchConfig.token.unrevealedURI,
    launchConfig.token.sniperTaxDuration
  );
  await camelContract.deployed();

  if (!silent) {
    console.log(`[deploy] Camel404 deployed at ${camelContract.address}`);
  }

  // Set test metadata URI if configured (local testing only)
  const testBaseURI = process.env.TEST_BASE_URI;
  if (testBaseURI) {
    const setUriTx = await camelContract.setBaseURI(testBaseURI);
    await setUriTx.wait();
    const revealTx = await camelContract.reveal();
    await revealTx.wait();
    if (!silent) console.log(`[deploy] Test metadata set: ${testBaseURI} (revealed)`);
  }

  // Deploy LiquidityManager
  if (!silent) {
    console.log('\n[deploy] Deploying LiquidityManager...');
  }

  // Use config team addresses, with deployer fallback for local testing
  const artistAddress = (launchConfig.team.artist !== '0x0000000000000000000000000000000000000000')
    ? launchConfig.team.artist
    : (process.env.ARTIST_ADDRESS || deployerAddress);
  const devAddress = (launchConfig.team.dev !== '0x0000000000000000000000000000000000000000')
    ? launchConfig.team.dev
    : (process.env.DEV_ADDRESS || deployerAddress);

  const lmFactory = new ethers.ContractFactory(
    lmArtifact.abi,
    loadArtifactBytes(lmArtifact),
    wallet
  );

  const liquidityManager = await lmFactory.deploy(
    camelContract.address,
    CYPHER_CONTRACTS.POSITION_MANAGER,
    CYPHER_CONTRACTS.SWAP_ROUTER,
    CYPHER_CONTRACTS.ALGEBRA_FACTORY,
    CYPHER_CONTRACTS.WETH,
    artistAddress,
    devAddress
  );
  await liquidityManager.deployed();

  if (!silent) {
    console.log(`[deploy] LiquidityManager deployed at ${liquidityManager.address}`);
  }

  // Connect LiquidityManager to CAMEL
  if (!silent) {
    console.log('\n[deploy] Connecting LiquidityManager to Camel404...');
  }

  const setLmTx = await camelContract.setLiquidityManager(liquidityManager.address);
  await setLmTx.wait();

  if (!silent) {
    console.log('[deploy] LiquidityManager connected successfully.');
  }

  // Build deployment payload
  await fs.mkdir(generatedDir, { recursive: true });
  const outputPath = path.join(generatedDir, 'contracts.json');

  const payload = {
    chainId: network.chainId,
    rpcUrl,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    contracts: {
      camel: {
        address: camelContract.address,
        abi: camelArtifact.abi
      },
      liquidityManager: {
        address: liquidityManager.address,
        abi: lmArtifact.abi
      }
    },
    cypherProtocol: CYPHER_CONTRACTS,
    config: {
      name: launchConfig.token.name,
      symbol: launchConfig.token.symbol,
      maxSupply: launchConfig.token.maxSupply,
      liquidityReservePercent: launchConfig.token.liquidityReservePercent
    },
    stage,
    stageData: {},
    testAccounts: {
      user1: TEST_ACCOUNTS[0].address,
      user2: TEST_ACCOUNTS[1].address,
      trader: TEST_ACCOUNTS[2].address,
      trader2: TEST_ACCOUNTS[3].address
    }
  };

  // Execute stages progressively
  if (!STAGES.includes(stage)) {
    throw new Error(`Invalid stage '${stage}'. Must be one of: ${STAGES.join(', ')}`);
  }
  const stageIndex = STAGES.indexOf(stage);
  const ctx = { provider, wallet, camelContract, liquidityManager, silent };

  try {
    if (stageIndex >= 1) await stageMints(ctx, payload);
    if (stageIndex >= 2) await stageTrading(ctx, payload);
    if (stageIndex >= 3) await stageFull(ctx, payload);
  } catch (err) {
    payload.stageError = { message: err.message, failedStage: stage };
    if (!silent) console.error(`[deploy] Stage error:`, err.message);
  }

  // Write deployment output
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));

  if (!silent) {
    console.log(`\n[deploy] Wrote ${path.relative(projectRoot, outputPath)}`);
    console.log('\n[deploy] Deployment Summary:');
    console.log(`         Camel404: ${camelContract.address}`);
    console.log(`         LiquidityManager: ${liquidityManager.address}`);
    console.log(`         Stage: ${stage}`);
  }

  // Fund user address if configured
  const userAddress = process.env.USER_ADDRESS;
  if (userAddress) {
    const amount = process.env.USER_FUNDING_ETH || '10.0';
    if (!silent) {
      console.log(`\n[deploy] Funding ${userAddress} with ${amount} ETH on the fork...`);
    }
    const tx = await wallet.sendTransaction({
      to: userAddress,
      value: ethers.utils.parseEther(amount)
    });
    await tx.wait();
    if (!silent) {
      console.log('[deploy] Funding complete.');
    }
  }

  return payload;
}

// ──────────────────────────────────────────────
// Anvil RPC helpers
// ──────────────────────────────────────────────

async function impersonateAccount(provider, address) {
  await provider.send('anvil_impersonateAccount', [address]);
}

async function stopImpersonating(provider, address) {
  await provider.send('anvil_stopImpersonatingAccount', [address]);
}

async function evmIncreaseTime(provider, seconds) {
  await provider.send('evm_increaseTime', [seconds]);
  await provider.send('evm_mine', []);
}

async function setAnvilBalance(provider, address, ethAmount) {
  await provider.send('anvil_setBalance', [
    address,
    ethers.utils.hexValue(ethers.utils.parseEther(ethAmount))
  ]);
}

async function getDeadline(provider) {
  const block = await provider.getBlock('latest');
  return block.timestamp + 3600;
}

function getTokenOrder(camelAddr, wethAddr) {
  const camelIsToken0 = camelAddr.toLowerCase() < wethAddr.toLowerCase();
  return {
    token0: camelIsToken0 ? camelAddr : wethAddr,
    token1: camelIsToken0 ? wethAddr : camelAddr,
    camelIsToken0
  };
}

function buildMerkleTree(addresses) {
  const leaves = addresses.map(addr =>
    ethers.utils.solidityKeccak256(['bytes20'], [addr])
  );
  const tree = new MerkleTree(leaves, ethers.utils.keccak256, { sortPairs: true });
  const root = tree.getHexRoot();
  const proofs = {};
  for (let i = 0; i < addresses.length; i++) {
    proofs[addresses[i]] = tree.getHexProof(leaves[i]);
  }
  return { root, proofs };
}

function extractMintedTokenId(receipt) {
  const iface = new ethers.utils.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
  ]);
  const transferLog = receipt.logs.find(log => {
    if (log.address.toLowerCase() !== CYPHER_CONTRACTS.POSITION_MANAGER.toLowerCase()) return false;
    try {
      const parsed = iface.parseLog(log);
      return parsed.args.from === ethers.constants.AddressZero;
    } catch { return false; }
  });
  if (!transferLog) throw new Error('Could not find NFT Transfer event in mint receipt');
  return iface.parseLog(transferLog).args.tokenId.toString();
}

// ──────────────────────────────────────────────
// TickMath helpers (ported from Uniswap V3 TickMath.sol)
// ──────────────────────────────────────────────

/**
 * Compute the sqrtPriceX96 for a given tick (exact, BigInt-based).
 * Returns an ethers BigNumber.
 */
function getSqrtRatioAtTick(tick) {
  const absTick = Math.abs(tick);
  if (absTick > 887272) throw new Error(`Tick ${tick} out of range`);

  let ratio = (absTick & 0x1) !== 0
    ? 0xfffcb933bd6fad37aa2d162d1a594001n
    : 0x100000000000000000000000000000000n;
  if (absTick & 0x2) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if (absTick & 0x4) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if (absTick & 0x8) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if (absTick & 0x10) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if (absTick & 0x20) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if (absTick & 0x40) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if (absTick & 0x80) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if (absTick & 0x100) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if (absTick & 0x200) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if (absTick & 0x400) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if (absTick & 0x800) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if (absTick & 0x1000) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if (absTick & 0x2000) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if (absTick & 0x4000) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if (absTick & 0x8000) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if (absTick & 0x10000) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if (absTick & 0x20000) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if (absTick & 0x40000) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if (absTick & 0x80000) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;

  if (tick > 0) {
    ratio = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn / ratio;
  }

  // Convert from Q128.128 to Q64.96 (shift right 32 bits, round up)
  const shifted = ratio >> 32n;
  const remainder = ratio % (1n << 32n);
  return ethers.BigNumber.from((shifted + (remainder > 0n ? 1n : 0n)).toString());
}

/**
 * Approximate tick from sqrtPriceX96 (float-based, sufficient for alignment).
 */
function sqrtPriceX96ToApproxTick(sqrtPriceX96BN) {
  const sqrtPriceFloat = parseFloat(sqrtPriceX96BN.toString()) / (2 ** 96);
  const price = sqrtPriceFloat * sqrtPriceFloat;
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

// ──────────────────────────────────────────────
// Stage: mints — Pool + Liquidity + Whitelist
// ──────────────────────────────────────────────

async function stageMints(ctx, payload) {
  const { provider, wallet, camelContract, liquidityManager, silent } = ctx;
  const camelAddr = camelContract.address;
  const wethAddr = CYPHER_CONTRACTS.WETH;

  if (!silent) console.log('\n[deploy] Stage: mints — Atomic launch with liquidity...');

  const { camelIsToken0 } = getTokenOrder(camelAddr, wethAddr);

  // 1. Derive initial token amounts
  const INITIAL_CAMEL = ethers.BigNumber.from(launchConfig.token.maxSupply)
    .mul(launchConfig.token.liquidityReservePercent)
    .div(100);
  const INITIAL_WETH = ethers.BigNumber.from(launchConfig.liquidity.initialWethAmount);

  if (!silent) console.log(`[deploy] Initial CAMEL for LP: ${ethers.utils.formatUnits(INITIAL_CAMEL, 18)} (${launchConfig.token.liquidityReservePercent}% of supply)`);
  if (!silent) console.log(`[deploy] Initial WETH for LP: ${ethers.utils.formatUnits(INITIAL_WETH, 18)}`);

  // 2. Compute pool initialization price
  let sqrtPriceX96 = camelIsToken0
    ? ethers.BigNumber.from(2).pow(192).div(ethers.BigNumber.from(launchConfig.liquidity.initialSqrtPriceX96))
    : ethers.BigNumber.from(launchConfig.liquidity.initialSqrtPriceX96);

  // 3. For single-sided LP (0 WETH), align the initialization price to a tick
  // spacing boundary so the position edge sits exactly at the current tick.
  // Use default Algebra tick spacing of 60 (pre-init pools have spacing 0).
  let effectiveTickLower = launchConfig.liquidity.tickLower;
  let effectiveTickUpper = launchConfig.liquidity.tickUpper;

  if (INITIAL_WETH.isZero()) {
    const approxTick = sqrtPriceX96ToApproxTick(sqrtPriceX96);
    const spacing = 60; // Algebra default tick spacing

    if (camelIsToken0) {
      // CAMEL is token0: position ABOVE current tick → 100% token0.
      let alignedTick = Math.ceil(approxTick / spacing) * spacing;
      if (alignedTick <= approxTick) alignedTick += spacing;
      effectiveTickLower = alignedTick;
      sqrtPriceX96 = getSqrtRatioAtTick(alignedTick - 1);
      if (!silent) console.log(`[deploy] Single-sided CAMEL (token0): tickLower=${effectiveTickLower}, tickUpper=${effectiveTickUpper}`);
    } else {
      // CAMEL is token1: position BELOW current tick → 100% token1.
      let alignedTick = Math.floor(approxTick / spacing) * spacing;
      if (alignedTick > approxTick) alignedTick -= spacing;
      effectiveTickUpper = alignedTick;
      sqrtPriceX96 = getSqrtRatioAtTick(alignedTick);
      if (!silent) console.log(`[deploy] Single-sided CAMEL (token1): tickLower=${effectiveTickLower}, tickUpper=${effectiveTickUpper}`);
    }
  }

  // 4. Pre-launch validation
  const contractBalance = await camelContract.balanceOf(camelContract.address);
  if (contractBalance.lt(INITIAL_CAMEL)) {
    throw new Error(`CAMEL contract balance (${ethers.utils.formatUnits(contractBalance, 18)}) < required (${ethers.utils.formatUnits(INITIAL_CAMEL, 18)})`);
  }
  if (effectiveTickLower >= effectiveTickUpper) {
    throw new Error(`Invalid tick range: ${effectiveTickLower} >= ${effectiveTickUpper}`);
  }
  if (!silent) console.log('[deploy] Pre-launch validation passed');

  // 5. Atomic launch: creates pool, initializes price, activates sniper tax,
  // wraps ETH to WETH, and mints LP position — all in one transaction.
  // Sniper tax is active BEFORE liquidity exists, closing the sniper window.
  const launchTx = await camelContract.launchWithLiquidity(
    CYPHER_CONTRACTS.ALGEBRA_FACTORY,
    sqrtPriceX96,
    effectiveTickLower,
    effectiveTickUpper,
    INITIAL_CAMEL,
    { value: INITIAL_WETH }
  );
  const launchReceipt = await launchTx.wait();

  // Parse LaunchedWithLiquidity event to get pool address and position token ID
  const launchIface = new ethers.utils.Interface([
    'event LaunchedWithLiquidity(address indexed pool, uint256 indexed positionTokenId, uint256 launchTimestamp)'
  ]);
  const launchLog = launchReceipt.logs.find(log => {
    if (log.address.toLowerCase() !== camelAddr.toLowerCase()) return false;
    try {
      launchIface.parseLog(log);
      return true;
    } catch { return false; }
  });
  if (!launchLog) throw new Error('Could not find LaunchedWithLiquidity event in receipt');
  const parsedLaunch = launchIface.parseLog(launchLog);
  const poolAddress = parsedLaunch.args.pool;
  const tokenId = parsedLaunch.args.positionTokenId.toString();

  if (!silent) {
    console.log(`[deploy] Atomic launch complete`);
    console.log(`[deploy] Pool: ${poolAddress}`);
    console.log(`[deploy] LP Position #${tokenId}`);
    console.log(`[deploy] Sniper tax is NOW ACTIVE`);
  }

  // 6. Verify pool has active liquidity
  const pool = new ethers.Contract(poolAddress, ALGEBRA_POOL_ABI, wallet);
  const poolLiq = await pool.liquidity();
  if (!silent) console.log(`[deploy] Pool active liquidity: ${poolLiq.toString()}`);
  if (poolLiq.isZero()) {
    throw new Error('Pool liquidity is 0 after launch. The LP position is out of range. Aborting.');
  }

  // 7. Verify sniper tax is active
  const [tax] = await camelContract.getSniperTaxAmount(poolAddress, wallet.address, ethers.utils.parseEther('1'));
  if (tax.isZero()) {
    throw new Error('Sniper tax not active after launch');
  }
  if (!silent) console.log(`[deploy] Sniper tax verified: ${ethers.utils.formatUnits(tax, 18)} on 1 CAMEL`);

  // 8. Register position with LiquidityManager
  const approvePosTx = await camelContract.approvePositionForLiquidityManager(tokenId);
  await approvePosTx.wait();
  const addPosTx = await liquidityManager.addPosition(tokenId);
  await addPosTx.wait();
  if (!silent) console.log('[deploy] Position added to LiquidityManager');

  // 9. Lock initial liquidity (rug protection)
  const lockTx = await liquidityManager.lockInitialLiquidity();
  await lockTx.wait();
  if (!silent) console.log('[deploy] Initial liquidity locked');

  // 10. Grant artist/dev roles
  const artistAddr = (launchConfig.team.artist !== '0x0000000000000000000000000000000000000000')
    ? launchConfig.team.artist
    : TEST_ACCOUNTS[0].address;
  const devAddr = (launchConfig.team.dev !== '0x0000000000000000000000000000000000000000')
    ? launchConfig.team.dev
    : TEST_ACCOUNTS[1].address;

  const grantArtistTx = await camelContract.grantRoles(artistAddr, launchConfig.roles.artistRole);
  await grantArtistTx.wait();
  const grantDevTx = await camelContract.grantRoles(devAddr, launchConfig.roles.devRole);
  await grantDevTx.wait();
  if (!silent) console.log('[deploy] Granted artist/dev roles');

  // 11. Build merkle tree and enable whitelist mints
  const whitelistAddresses = TEST_ACCOUNTS.map(a => a.address);
  const userAddress = process.env.USER_ADDRESS;
  if (userAddress && !whitelistAddresses.some(a => a.toLowerCase() === userAddress.toLowerCase())) {
    whitelistAddresses.push(ethers.utils.getAddress(userAddress));
  }
  const { root, proofs } = buildMerkleTree(whitelistAddresses);

  const setMerkleTx = await camelContract.setMerkleRoot(root);
  await setMerkleTx.wait();

  if (launchConfig.whitelist.enableAtLaunch) {
    const enableWlTx = await camelContract.setWhitelistMintEnabled(true);
    await enableWlTx.wait();
  }
  if (!silent) console.log(`[deploy] Whitelist enabled with ${whitelistAddresses.length} addresses`);

  payload.stageData.mints = {
    pool: poolAddress,
    positionTokenId: tokenId,
    merkleRoot: root,
    whitelistAddresses,
    whitelistProofs: proofs
  };
}

// ──────────────────────────────────────────────
// Stage: trading — Volume Generation
// ──────────────────────────────────────────────

async function stageTrading(ctx, payload) {
  const { provider, wallet, camelContract, silent } = ctx;
  const camelAddr = camelContract.address;
  const wethAddr = CYPHER_CONTRACTS.WETH;

  if (!silent) console.log('\n[deploy] Stage: trading — Warping past sniper tax and generating volume...');

  // 1. Warp past sniper tax duration
  await evmIncreaseTime(provider, launchConfig.token.sniperTaxDuration + 60);
  if (!silent) console.log('[deploy] Warped past sniper tax');

  // 2. Disable whitelist mints
  const disableWlTx = await camelContract.setWhitelistMintEnabled(false);
  await disableWlTx.wait();
  if (!silent) console.log('[deploy] Whitelist minting disabled');

  // 3. Execute buy/sell swaps from test accounts
  const weth = new ethers.Contract(wethAddr, WETH_ABI, provider);
  const swapRouter = new ethers.Contract(CYPHER_CONTRACTS.SWAP_ROUTER, SWAP_ROUTER_ABI, provider);
  const TRADE_ETH = ethers.utils.parseEther('1');
  let tradeCount = 0;

  for (const account of TEST_ACCOUNTS.slice(0, 3)) {
    try {
      const trader = new ethers.Wallet(account.key, provider);
      const traderWeth = weth.connect(trader);
      const traderRouter = swapRouter.connect(trader);
      const traderCamel = camelContract.connect(trader);

      // Get a fresh deadline for each trader (avoids stale timestamps between blocks)
      const deadline = await getDeadline(provider);

      // Buy CAMEL with native ETH via multicall (matches frontend pattern)
      const buyParams = {
        tokenIn: wethAddr,
        tokenOut: camelAddr,
        deployer: ethers.constants.AddressZero,
        recipient: trader.address,
        deadline,
        amountIn: TRADE_ETH,
        amountOutMinimum: 0,
        limitSqrtPrice: 0
      };

      // Encode exactInputSingle + refundNativeToken for atomic multicall
      const swapData = swapRouter.interface.encodeFunctionData('exactInputSingle', [buyParams]);
      const refundData = swapRouter.interface.encodeFunctionData('refundNativeToken', []);

      // Simulate first to get a clear error if it would revert
      try {
        await traderRouter.callStatic.multicall([swapData, refundData], { value: TRADE_ETH });
      } catch (simErr) {
        if (!silent) console.warn(`[deploy] Swap simulation failed for ${account.address.slice(0, 10)}...: ${simErr.reason || simErr.message}`);
        continue;
      }

      // Execute atomic multicall with native ETH (router wraps internally)
      const buyTx = await traderRouter.multicall([swapData, refundData], {
        value: TRADE_ETH,
        gasLimit: 500000
      });
      await buyTx.wait();
      tradeCount++;

      // Sell half CAMEL back
      const camelBalance = await camelContract.balanceOf(trader.address);
      const sellAmount = camelBalance.div(2);

      if (sellAmount.gt(0)) {
        const approveCamelTx = await traderCamel.approve(CYPHER_CONTRACTS.SWAP_ROUTER, sellAmount);
        await approveCamelTx.wait();

        const sellParams = {
          tokenIn: camelAddr,
          tokenOut: wethAddr,
          deployer: ethers.constants.AddressZero,
          recipient: trader.address,
          deadline,
          amountIn: sellAmount,
          amountOutMinimum: 0,
          limitSqrtPrice: 0
        };

        try {
          await traderRouter.callStatic.exactInputSingleSupportingFeeOnTransferTokens(sellParams);
        } catch (simErr) {
          if (!silent) console.warn(`[deploy] Sell simulation failed for ${account.address.slice(0, 10)}...: ${simErr.reason || simErr.message}`);
          tradeCount++; // count the buy at least
          continue;
        }

        const sellTx = await traderRouter.exactInputSingleSupportingFeeOnTransferTokens(sellParams, { gasLimit: 500000 });
        await sellTx.wait();
        tradeCount++;
      }

      if (!silent) console.log(`[deploy] Trader ${account.address.slice(0, 10)}... executed buy/sell`);
    } catch (err) {
      if (!silent) console.warn(`[deploy] Trader ${account.address.slice(0, 10)}... failed: ${err.reason || err.message}`);
    }
  }

  if (!silent) console.log(`[deploy] Completed ${tradeCount} trades`);

  payload.stageData.trading = {
    sniperTaxWarped: true,
    tradeCount
  };
}

// ──────────────────────────────────────────────
// Stage: full — Staking + Positions + Fees
// ──────────────────────────────────────────────

async function stageFull(ctx, payload) {
  const { provider, wallet, camelContract, liquidityManager, silent } = ctx;
  const camelAddr = camelContract.address;
  const wethAddr = CYPHER_CONTRACTS.WETH;

  if (!silent) console.log('\n[deploy] Stage: full — Staking, positions, and fees...');

  const weth = new ethers.Contract(wethAddr, WETH_ABI, wallet);
  const positionManager = new ethers.Contract(CYPHER_CONTRACTS.POSITION_MANAGER, POSITION_MANAGER_ABI, wallet);
  const { token0, token1, camelIsToken0 } = getTokenOrder(camelAddr, wethAddr);

  // 1. Enable staking
  const enableStakingTx = await camelContract.enableStaking();
  await enableStakingTx.wait();
  if (!silent) console.log('[deploy] Staking enabled');

  // 2. Mint 2 additional LP positions at narrower tick ranges
  const NARROW_CAMEL = ethers.utils.parseUnits('5000', 18);
  const NARROW_WETH = ethers.utils.parseEther('5');
  const narrowRanges = [
    { lower: -60000, upper: 60000 },
    { lower: -6000, upper: 6000 }
  ];

  // Transfer more CAMEL from contract for additional positions
  const totalCamelNeeded = NARROW_CAMEL.mul(narrowRanges.length);
  await impersonateAccount(provider, camelAddr);
  await setAnvilBalance(provider, camelAddr, '1');
  const impersonatedSigner = provider.getSigner(camelAddr);
  const camelAsContract = camelContract.connect(impersonatedSigner);
  const transferTx = await camelAsContract.transfer(wallet.address, totalCamelNeeded);
  await transferTx.wait();
  await stopImpersonating(provider, camelAddr);

  // Wrap ETH for WETH
  const depositTx = await weth.deposit({ value: NARROW_WETH.mul(narrowRanges.length) });
  await depositTx.wait();

  const positionIds = [];
  if (payload.stageData.mints?.positionTokenId) {
    positionIds.push(payload.stageData.mints.positionTokenId);
  }

  const narrowDeadline = await getDeadline(provider);

  for (const range of narrowRanges) {
    const approveCamelTx = await camelContract.approve(CYPHER_CONTRACTS.POSITION_MANAGER, NARROW_CAMEL);
    await approveCamelTx.wait();
    const approveWethTx = await weth.approve(CYPHER_CONTRACTS.POSITION_MANAGER, NARROW_WETH);
    await approveWethTx.wait();

    const mintTx = await positionManager.mint({
      token0,
      token1,
      deployer: ethers.constants.AddressZero,
      tickLower: range.lower,
      tickUpper: range.upper,
      amount0Desired: camelIsToken0 ? NARROW_CAMEL : NARROW_WETH,
      amount1Desired: camelIsToken0 ? NARROW_WETH : NARROW_CAMEL,
      amount0Min: 0,
      amount1Min: 0,
      recipient: camelAddr,
      deadline: narrowDeadline
    });
    const receipt = await mintTx.wait();
    const tokenId = extractMintedTokenId(receipt);

    const approvePosTx = await camelContract.approvePositionForLiquidityManager(tokenId);
    await approvePosTx.wait();
    const addPosTx = await liquidityManager.addPosition(tokenId);
    await addPosTx.wait();

    positionIds.push(tokenId);
    if (!silent) console.log(`[deploy] Added narrow position #${tokenId} (${range.lower}/${range.upper})`);
  }

  // 3. Test users stake half their CAMEL balance
  const stakers = [];
  for (const account of TEST_ACCOUNTS.slice(0, 2)) {
    const userWallet = new ethers.Wallet(account.key, provider);
    const userCamel = camelContract.connect(userWallet);
    const balance = await camelContract.balanceOf(account.address);
    if (balance.gt(0)) {
      const stakeAmount = balance.div(2);
      const stakeTx = await userCamel.stake(stakeAmount);
      await stakeTx.wait();
      stakers.push({ address: account.address, amount: stakeAmount.toString() });
      if (!silent) console.log(`[deploy] ${account.address.slice(0, 10)}... staked ${ethers.utils.formatUnits(stakeAmount, 18)} CAMEL`);
    }
  }

  // 4. Warp past fee collection cooldown (1+ hour)
  await evmIncreaseTime(provider, 3601);

  // 5. Collect fees
  const collectTx = await liquidityManager.collectFees();
  await collectTx.wait();
  if (!silent) console.log('[deploy] Fees collected');

  // 6. Set investment schedule across all active positions
  const activeIds = await liquidityManager.getActivePositionIds();
  if (activeIds.length > 0) {
    const bpsPerPosition = Math.floor(10000 / activeIds.length);
    const allocations = activeIds.map((id, i) => ({
      positionId: id,
      bps: i === activeIds.length - 1
        ? 10000 - bpsPerPosition * (activeIds.length - 1)
        : bpsPerPosition
    }));
    const scheduleTx = await liquidityManager.setInvestmentSchedule(allocations);
    await scheduleTx.wait();
    if (!silent) console.log(`[deploy] Investment schedule set for ${activeIds.length} positions`);
  }

  payload.stageData.full = {
    stakingEnabled: true,
    positionIds,
    stakers
  };
}

// Legacy export for backward compatibility
export const deployCounter = deployCamel;

if (import.meta.url === `file://${process.argv[1]}`) {
  deployCamel().catch((error) => {
    console.error('[deploy] Failed to deploy CAMEL404:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.replace(/^--/, '');
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
    } else {
      result[key] = next;
      i++;
    }
  }
  return result;
}
