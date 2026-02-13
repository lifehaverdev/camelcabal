# EIP-6963 Support Spec for micro-web3

Spec for upgrading `@monygroupcorp/micro-web3` WalletService to support EIP-6963 (Multi Injected Provider Discovery).

## Problem

The current WalletService relies entirely on `window.ethereum` for wallet detection:

- `providerMap` uses hardcoded flag checks (`window.ethereum.isRabby`, `.isRainbow`, etc.)
- `_detectWalletType()` checks the same flags
- `initialize()`, `tryAutoConnect()`, `getAvailableWallets()` all go straight to `window.ethereum`
- `connect()` falls back to `window.ethereum` for every wallet type

This means:
1. Only whichever wallet "wins" `window.ethereum` is detected
2. Wallets that don't inject `window.ethereum` (newer Coinbase Wallet, etc.) are invisible
3. Users with multiple wallets installed can't choose between them
4. The flag-based detection (`isRabby`, `isMetaMask`) is fragile and breaks when wallets override each other

## EIP-6963 Overview

EIP-6963 replaces `window.ethereum` with an event-based discovery protocol:

```js
// Wallets announce themselves
window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
  detail: {
    info: {
      uuid: 'unique-id',
      name: 'Rabby Wallet',
      icon: 'data:image/svg+xml,...',
      rdns: 'io.rabby'          // reverse domain name identifier
    },
    provider: <EIP-1193 provider>  // the actual provider object
  }
}));

// DApps request announcements
window.dispatchEvent(new Event('eip6963:requestProvider'));
```

All installed wallets that support EIP-6963 respond with their own `announceProvider` event. The dApp collects them and presents a list. Each provider is independent — no more `window.ethereum` conflicts.

## Required Changes to WalletService

### 1. Add EIP-6963 Discovery

New internal state:

```js
constructor(eventBus) {
  // ... existing state ...
  this.eip6963Providers = new Map();  // uuid -> { info, provider }
}
```

New discovery method, called during `initialize()`:

```js
_startEIP6963Discovery() {
  window.addEventListener('eip6963:announceProvider', (event) => {
    const { info, provider } = event.detail;
    this.eip6963Providers.set(info.uuid, { info, provider });
    this.eventBus.emit('wallet:providerdiscovered', { info, provider });
  });

  // Request all wallets to announce
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}
```

### 2. Update `initialize()`

Start EIP-6963 discovery early, then fall back to `window.ethereum` for legacy wallets:

```js
async initialize(options = {}) {
  // Start EIP-6963 discovery first
  this._startEIP6963Discovery();

  // Give wallets a moment to announce (they respond async)
  await new Promise(resolve => setTimeout(resolve, 50));

  // If EIP-6963 providers found, prefer them
  if (this.eip6963Providers.size > 0) {
    // Auto-reconnect using last wallet's rdns from localStorage
    // ...
  }

  // Fall back to legacy window.ethereum detection
  // ... (existing logic, unchanged)
}
```

### 3. Update `getAvailableWallets()`

Merge EIP-6963 providers with legacy detection. EIP-6963 takes priority:

```js
getAvailableWallets() {
  const available = {};

  // EIP-6963 providers first (these are authoritative)
  for (const [uuid, { info, provider }] of this.eip6963Providers) {
    const key = info.rdns || info.name.toLowerCase().replace(/\s/g, '');
    available[key] = {
      name: info.name,
      icon: info.icon,           // EIP-6963 provides wallet icons
      provider: provider,
      rdns: info.rdns,
      uuid: uuid,
      source: 'eip6963'
    };
  }

  // Legacy fallback: only add window.ethereum wallets not already discovered
  if (Object.keys(available).length === 0) {
    // ... existing providerMap logic ...
  }

  return available;
}
```

### 4. Update `selectWallet()` and `connect()`

Accept either a legacy wallet type string OR an EIP-6963 rdns/uuid:

```js
async selectWallet(walletType) {
  // Check EIP-6963 providers first (by rdns or uuid)
  for (const [uuid, { info, provider }] of this.eip6963Providers) {
    if (info.rdns === walletType || uuid === walletType ||
        info.name.toLowerCase().includes(walletType)) {
      this.selectedWallet = info.rdns || walletType;
      this.provider = provider;
      this.setupEventListeners();
      // ...
      return;
    }
  }

  // Fall back to legacy providerMap
  // ... existing logic ...
}
```

### 5. Update `_detectWalletType()`

Use EIP-6963 info when available:

```js
_detectWalletType() {
  // If we have a selected EIP-6963 provider, use its rdns
  if (this.selectedWallet && this.eip6963Providers.size > 0) {
    for (const [, { info }] of this.eip6963Providers) {
      if (info.rdns === this.selectedWallet) return info.rdns;
    }
  }

  // Legacy fallback
  // ... existing flag-based detection ...
}
```

### 6. Update `walletIcons`

EIP-6963 providers include their own icons. The icon from `info.icon` should take priority over the hardcoded `walletIcons` map. The existing `walletIcons` property becomes a fallback for legacy-only wallets.

### 7. Update localStorage Key

Store the rdns identifier instead of the legacy wallet type:

```js
// Instead of: localStorage.setItem('ms2fun_lastWallet', 'rabby')
// Store:      localStorage.setItem('ms2fun_lastWallet', 'io.rabby')
```

Keep backward compat by checking both formats during auto-reconnect.

## Backward Compatibility

- The `providerMap` and flag-based detection must remain as a fallback for wallets that don't support EIP-6963 yet
- `connect('metamask')` / `connect('rabby')` must still work (map legacy names to rdns)
- The `wallet:connected` event payload stays the same
- `setConnectedState()` is unaffected

## Common RDNS Values

| Wallet | RDNS |
|--------|------|
| MetaMask | `io.metamask` |
| Rabby | `io.rabby` |
| Rainbow | `me.rainbow` |
| Coinbase | `com.coinbase.wallet` |
| Phantom | `app.phantom` |
| Trust Wallet | `com.trustwallet.app` |
| OKX | `com.okex.wallet` |

## Events

New eventBus events:

| Event | Payload | When |
|-------|---------|------|
| `wallet:providerdiscovered` | `{ info, provider }` | Each time an EIP-6963 wallet announces |
| `wallet:providerlistready` | `{ providers: Map }` | After initial discovery window closes |

## Testing

- Test with 2+ wallets installed (e.g., MetaMask + Rabby)
- Verify both appear in `getAvailableWallets()`
- Verify connecting to each uses the correct provider
- Verify auto-reconnect picks the right provider
- Test with a wallet that ONLY supports EIP-6963 (no `window.ethereum`)
- Test with a wallet that ONLY supports legacy (no EIP-6963)
- Test the Phantom special case (uses `window.phantom.ethereum`)
