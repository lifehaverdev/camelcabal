#!/usr/bin/env node
/**
 * Standalone launch-config.json validator.
 *
 * Run before `forge script` or `deploy.mjs` to catch bad config values
 * (placeholder URIs, un-checksummed addresses, impossible tick ranges,
 * BigInt parse failures) before any chain interaction.
 *
 * Usage:
 *   node scripts/validate-config.mjs                  # validates ./launch-config.json
 *   node scripts/validate-config.mjs path/to/cfg.json # validates a specific file
 *
 * Exit code: 0 if no FAILs, 1 if any FAIL.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fsSync from 'node:fs';
import { ethers } from 'ethers';

// ─── Constants ──────────────────────────────────────────────────────────────

const MIN_SQRT_RATIO = 4295128739n;
const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;
const MIN_TICK = -887272;
const MAX_TICK = 887272;
const TICK_SPACING = 60;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

// ─── Schema definition ─────────────────────────────────────────────────────

const SCHEMA = {
  token: {
    name: 'string',
    symbol: 'string',
    maxSupply: 'string',
    liquidityReservePercent: 'number',
    projectReservePercent: 'number',
    sniperTaxDuration: 'number',
    unrevealedURI: 'string',
  },
  protocol: {
    weth: 'string',
    algebraFactory: 'string',
    positionManager: 'string',
    swapRouter: 'string',
  },
  team: {
    artist: 'string',
    dev: 'string',
  },
  liquidity: {
    initialWethAmount: 'string',
    initialSqrtPriceX96: 'string',
    tickLower: 'number',
    tickUpper: 'number',
  },
  whitelist: {
    merkleRoot: 'string',
    mintAmount: 'string',
    enableAtLaunch: 'boolean',
  },
  roles: {
    artistRole: 'number',
    devRole: 'number',
    liquidityRole: 'number',
    metadataRole: 'number',
  },
};

// ─── Reporter ───────────────────────────────────────────────────────────────

function createReporter(silent) {
  let fails = 0;
  let warns = 0;
  let passes = 0;

  return {
    pass(msg) {
      passes++;
      if (!silent) console.log(`  [PASS] ${msg}`);
    },
    warn(msg) {
      warns++;
      if (!silent) console.log(`  [WARN] ${msg}`);
    },
    fail(msg) {
      fails++;
      if (!silent) console.log(`  [FAIL] ${msg}`);
    },
    section(title) {
      if (!silent) console.log(`\n── ${title} ──`);
    },
    get fails() { return fails; },
    get warns() { return warns; },
    get passes() { return passes; },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isValidAddress(value) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isChecksummed(value) {
  try {
    return ethers.utils.getAddress(value) === value;
  } catch {
    return false;
  }
}

function isZeroAddress(value) {
  return value === ZERO_ADDRESS;
}

function tryParseBigInt(value) {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function isPowerOf2(n) {
  return n > 0 && (n & (n - 1)) === 0;
}

// ─── Check implementations ─────────────────────────────────────────────────

function checkSchema(config, r) {
  r.section('1. Schema / Structure');

  const topKeys = Object.keys(SCHEMA);
  const configTopKeys = Object.keys(config);

  // Check required top-level keys
  for (const key of topKeys) {
    if (!(key in config)) {
      r.fail(`Missing required top-level key: "${key}"`);
      continue;
    }
    if (typeof config[key] !== 'object' || config[key] === null || Array.isArray(config[key])) {
      r.fail(`"${key}" must be an object`);
      continue;
    }

    // Check nested keys
    const nestedSchema = SCHEMA[key];
    for (const subKey of Object.keys(nestedSchema)) {
      if (!(subKey in config[key])) {
        r.fail(`Missing required field: "${key}.${subKey}"`);
      } else if (typeof config[key][subKey] !== nestedSchema[subKey]) {
        r.fail(`"${key}.${subKey}" should be ${nestedSchema[subKey]}, got ${typeof config[key][subKey]}`);
      }
    }

    // Warn on unexpected nested keys
    for (const subKey of Object.keys(config[key])) {
      if (!(subKey in nestedSchema)) {
        r.warn(`Unexpected field: "${key}.${subKey}" (ignored)`);
      }
    }
  }

  // Warn on unexpected top-level keys
  for (const key of configTopKeys) {
    if (!topKeys.includes(key)) {
      r.warn(`Unexpected top-level key: "${key}" (ignored)`);
    }
  }

  r.pass('Schema structure checked');
}

function checkToken(config, r) {
  r.section('2. Token Fields');
  const t = config.token;
  if (!t) return;

  // name / symbol
  if (typeof t.name === 'string' && t.name.length > 0) {
    r.pass(`name: "${t.name}"`);
  } else {
    r.fail('token.name must be a non-empty string');
  }

  if (typeof t.symbol === 'string' && t.symbol.length > 0) {
    r.pass(`symbol: "${t.symbol}"`);
  } else {
    r.fail('token.symbol must be a non-empty string');
  }

  // maxSupply
  const maxSupply = tryParseBigInt(t.maxSupply);
  if (maxSupply === null) {
    r.fail(`token.maxSupply cannot be parsed as BigInt: "${t.maxSupply}"`);
  } else if (maxSupply <= 0n) {
    r.fail('token.maxSupply must be > 0');
  } else {
    r.pass(`maxSupply: ${maxSupply}`);
    if (maxSupply > 10n ** 30n) {
      r.warn('token.maxSupply is very large (> 10^30)');
    }
    if (maxSupply < 10n ** 18n) {
      r.warn('token.maxSupply is very small (< 10^18, less than 1 token with 18 decimals)');
    }
  }

  // liquidityReservePercent
  if (!Number.isInteger(t.liquidityReservePercent) || t.liquidityReservePercent < 1 || t.liquidityReservePercent > 99) {
    r.fail(`token.liquidityReservePercent must be integer in [1, 99], got ${t.liquidityReservePercent}`);
  } else {
    r.pass(`liquidityReservePercent: ${t.liquidityReservePercent}%`);
  }

  // projectReservePercent
  if (!Number.isInteger(t.projectReservePercent) || t.projectReservePercent < 0 || t.projectReservePercent > 99) {
    r.fail(`token.projectReservePercent must be integer in [0, 99], got ${t.projectReservePercent}`);
  } else {
    r.pass(`projectReservePercent: ${t.projectReservePercent}%`);
  }

  // Sum < 100
  if (Number.isInteger(t.liquidityReservePercent) && Number.isInteger(t.projectReservePercent)) {
    const sum = t.liquidityReservePercent + t.projectReservePercent;
    if (sum >= 100) {
      r.fail(`liquidityReservePercent + projectReservePercent = ${sum} (must be < 100)`);
    } else {
      r.pass(`Reserve percent sum: ${sum}% (< 100)`);
    }
  }

  // sniperTaxDuration
  if (typeof t.sniperTaxDuration !== 'number' || t.sniperTaxDuration <= 0) {
    r.fail(`token.sniperTaxDuration must be > 0, got ${t.sniperTaxDuration}`);
  } else {
    r.pass(`sniperTaxDuration: ${t.sniperTaxDuration}s (${(t.sniperTaxDuration / 3600).toFixed(1)}h)`);
    if (t.sniperTaxDuration < 60) {
      r.warn('sniperTaxDuration < 60s — very short tax window');
    }
    if (t.sniperTaxDuration > 86400) {
      r.warn('sniperTaxDuration > 86400s (1 day) — very long tax window');
    }
  }

  // unrevealedURI
  if (typeof t.unrevealedURI !== 'string' || t.unrevealedURI.length === 0) {
    r.fail('token.unrevealedURI must be a non-empty string');
  } else {
    r.pass(`unrevealedURI: ${t.unrevealedURI}`);
    if (t.unrevealedURI.includes('YOUR_CID')) {
      r.warn('token.unrevealedURI still contains placeholder "YOUR_CID"');
    }
  }
}

function checkProtocolAddresses(config, r) {
  r.section('3. Protocol Addresses');
  const p = config.protocol;
  if (!p) return;

  for (const [key, value] of Object.entries(p)) {
    if (!isValidAddress(value)) {
      r.fail(`protocol.${key}: invalid address format "${value}"`);
      continue;
    }
    if (isZeroAddress(value)) {
      r.fail(`protocol.${key}: must not be zero address`);
      continue;
    }
    if (!isChecksummed(value)) {
      r.fail(`protocol.${key}: not EIP-55 checksummed. Expected: ${ethers.utils.getAddress(value)}`);
      continue;
    }
    r.pass(`protocol.${key}: ${value}`);
  }
}

function checkTeamAddresses(config, r) {
  r.section('4. Team Addresses');
  const t = config.team;
  if (!t) return;

  for (const [key, value] of Object.entries(t)) {
    if (isZeroAddress(value)) {
      r.warn(`team.${key}: zero address — will fall back to deployer`);
      continue;
    }
    if (!isValidAddress(value)) {
      r.fail(`team.${key}: invalid address format "${value}"`);
      continue;
    }
    if (!isChecksummed(value)) {
      r.fail(`team.${key}: not EIP-55 checksummed. Expected: ${ethers.utils.getAddress(value)}`);
      continue;
    }
    r.pass(`team.${key}: ${value}`);
  }
}

function checkLiquidity(config, r) {
  r.section('5. Liquidity');
  const l = config.liquidity;
  if (!l) return;

  // initialWethAmount
  const wethAmount = tryParseBigInt(l.initialWethAmount);
  if (wethAmount === null) {
    r.fail(`liquidity.initialWethAmount cannot be parsed as BigInt: "${l.initialWethAmount}"`);
  } else if (wethAmount < 0n) {
    r.fail('liquidity.initialWethAmount must be >= 0');
  } else {
    r.pass(`initialWethAmount: ${wethAmount} (${ethers.utils.formatEther(wethAmount.toString())} ETH)`);
  }

  // initialSqrtPriceX96
  const sqrtPrice = tryParseBigInt(l.initialSqrtPriceX96);
  if (sqrtPrice === null) {
    r.fail(`liquidity.initialSqrtPriceX96 cannot be parsed as BigInt: "${l.initialSqrtPriceX96}"`);
  } else if (sqrtPrice < MIN_SQRT_RATIO) {
    r.fail(`liquidity.initialSqrtPriceX96 below TickMath minimum (${MIN_SQRT_RATIO})`);
  } else if (sqrtPrice >= MAX_SQRT_RATIO) {
    r.fail(`liquidity.initialSqrtPriceX96 above TickMath maximum`);
  } else {
    r.pass(`initialSqrtPriceX96: ${sqrtPrice}`);
  }

  // tickLower / tickUpper
  const { tickLower, tickUpper } = l;

  if (!Number.isInteger(tickLower) || tickLower < MIN_TICK || tickLower > MAX_TICK) {
    r.fail(`liquidity.tickLower must be integer in [${MIN_TICK}, ${MAX_TICK}], got ${tickLower}`);
  } else {
    r.pass(`tickLower: ${tickLower}`);
  }

  if (!Number.isInteger(tickUpper) || tickUpper < MIN_TICK || tickUpper > MAX_TICK) {
    r.fail(`liquidity.tickUpper must be integer in [${MIN_TICK}, ${MAX_TICK}], got ${tickUpper}`);
  } else {
    r.pass(`tickUpper: ${tickUpper}`);
  }

  if (Number.isInteger(tickLower) && Number.isInteger(tickUpper)) {
    if (tickLower >= tickUpper) {
      r.fail(`tickLower (${tickLower}) must be < tickUpper (${tickUpper})`);
    } else {
      r.pass(`Tick ordering: ${tickLower} < ${tickUpper}`);
    }

    // Divisibility by tick spacing
    if (tickLower % TICK_SPACING !== 0) {
      r.fail(`tickLower (${tickLower}) is not divisible by tick spacing (${TICK_SPACING})`);
    }
    if (tickUpper % TICK_SPACING !== 0) {
      r.fail(`tickUpper (${tickUpper}) is not divisible by tick spacing (${TICK_SPACING})`);
    }

    // Full range warning
    if (tickLower <= MIN_TICK + TICK_SPACING && tickUpper >= MAX_TICK - TICK_SPACING) {
      r.warn('Tick range covers nearly the full range — may indicate unconsidered config');
    }
  }
}

function checkWhitelist(config, r) {
  r.section('6. Whitelist');
  const w = config.whitelist;
  if (!w) return;

  // merkleRoot — valid bytes32 hex
  if (typeof w.merkleRoot !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(w.merkleRoot)) {
    r.fail(`whitelist.merkleRoot must be a valid bytes32 hex (66 chars with 0x prefix), got "${w.merkleRoot}"`);
  } else {
    r.pass(`merkleRoot: ${w.merkleRoot}`);
  }

  // mintAmount
  const mintAmount = tryParseBigInt(w.mintAmount);
  if (mintAmount === null) {
    r.fail(`whitelist.mintAmount cannot be parsed as BigInt: "${w.mintAmount}"`);
  } else if (mintAmount <= 0n) {
    r.fail('whitelist.mintAmount must be > 0');
  } else {
    r.pass(`mintAmount: ${mintAmount}`);
  }

  // enableAtLaunch
  if (typeof w.enableAtLaunch !== 'boolean') {
    r.fail(`whitelist.enableAtLaunch must be boolean, got ${typeof w.enableAtLaunch}`);
  } else {
    r.pass(`enableAtLaunch: ${w.enableAtLaunch}`);
  }

  // Cross-check: enableAtLaunch + zero merkleRoot
  if (w.enableAtLaunch === true && w.merkleRoot === ZERO_BYTES32) {
    r.warn('enableAtLaunch is true but merkleRoot is zero — whitelist mints will fail');
  }
}

function checkRoles(config, r) {
  r.section('7. Roles');
  const roles = config.roles;
  if (!roles) return;

  const values = [];

  for (const [key, value] of Object.entries(roles)) {
    if (!Number.isInteger(value) || value < 1 || value > 255) {
      r.fail(`roles.${key} must be integer in [1, 255], got ${value}`);
      continue;
    }

    if (!isPowerOf2(value)) {
      r.fail(`roles.${key} (${value}) is not a power of 2 — invalid Solady role bit`);
      continue;
    }

    if (values.includes(value)) {
      r.fail(`roles.${key} (${value}) duplicates another role bit value`);
    } else {
      values.push(value);
      r.pass(`roles.${key}: ${value} (bit ${Math.log2(value)})`);
    }
  }
}

function checkCrossField(config, r) {
  r.section('8. Cross-Field');
  const t = config.token;
  const l = config.liquidity;
  if (!t || !l) return;

  const maxSupply = tryParseBigInt(t.maxSupply);
  if (maxSupply !== null && Number.isInteger(t.liquidityReservePercent)) {
    const initialCamelAmount = maxSupply * BigInt(t.liquidityReservePercent) / 100n;
    if (initialCamelAmount <= 0n) {
      r.fail('Derived initialCamelAmount (maxSupply * liquidityReservePercent / 100) is 0');
    } else {
      r.pass(`Derived initialCamelAmount: ${initialCamelAmount}`);
    }
  }

  const wethAmount = tryParseBigInt(l.initialWethAmount);
  if (wethAmount !== null && wethAmount === 0n) {
    r.pass('initialWethAmount is 0 — single-sided LP mode will be used');
  }

  if (maxSupply !== null && maxSupply % 100n !== 0n) {
    r.warn('maxSupply is not evenly divisible by 100 — percent calculations will truncate');
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Validate a launch-config object.
 *
 * @param {object} config  Parsed launch-config.json contents
 * @param {object} [opts]
 * @param {boolean} [opts.silent]  Suppress stdout output
 * @returns {number} Number of FAIL results (0 = all good)
 */
export function validateConfig(config, { silent = false } = {}) {
  const r = createReporter(silent);

  if (!silent) {
    console.log('\n=== LAUNCH CONFIG VALIDATION ===');
  }

  checkSchema(config, r);
  checkToken(config, r);
  checkProtocolAddresses(config, r);
  checkTeamAddresses(config, r);
  checkLiquidity(config, r);
  checkWhitelist(config, r);
  checkRoles(config, r);
  checkCrossField(config, r);

  if (!silent) {
    console.log('\n── Summary ──');
    console.log(`  ${r.passes} passed, ${r.warns} warnings, ${r.fails} failures`);
    if (r.fails > 0) {
      console.log('  Result: FAILED — fix errors before deploying\n');
    } else if (r.warns > 0) {
      console.log('  Result: PASSED with warnings — review before deploying\n');
    } else {
      console.log('  Result: PASSED\n');
    }
  }

  return r.fails;
}

// ─── CLI entry point ────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);

if (import.meta.url === `file://${process.argv[1]}`) {
  const projectRoot = path.resolve(__filename, '..', '..');
  const configPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(projectRoot, 'launch-config.json');

  if (!fsSync.existsSync(configPath)) {
    console.error(`[FAIL] Config file not found: ${configPath}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fsSync.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`[FAIL] Failed to parse ${configPath}: ${err.message}`);
    process.exit(1);
  }

  const fails = validateConfig(config);
  process.exit(fails > 0 ? 1 : 0);
}
