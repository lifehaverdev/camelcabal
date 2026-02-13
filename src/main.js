import './style/main.css';
import { h, render, eventBus } from '@monygroupcorp/microact';
import { WalletService } from '@monygroupcorp/micro-web3';
import App from './components/App.js';
import rabbyIcon from './public/wallets/rabby.svg?raw';
import rainbowIcon from './public/wallets/rainbow.svg?raw';
import phantomIcon from './public/wallets/phantom.svg?raw';
import metamaskIcon from './public/wallets/metamask.svg?raw';

const WALLET_ICONS = {
  rabby: rabbyIcon,
  rainbow: rainbowIcon,
  phantom: phantomIcon,
  metamask: metamaskIcon,
};

async function main() {
  // 1. Initialize services
  const walletService = new WalletService(eventBus);

  try {
    await walletService.initialize();
    walletService.walletIcons = WALLET_ICONS;
  } catch (error) {
    console.error('Failed to initialize WalletService:', error);
    // Optionally render an error message to the user
  }

  // 2. Render the main App component
  const appRoot = document.getElementById('app');
  if (appRoot) {
    render(h(App, { walletService }), appRoot);
  } else {
    console.error('Root element #app not found');
  }

  // 3. (Optional) Global error handling for wallet events
  eventBus.on('wallet:error', (error) => {
    console.error('A wallet error occurred:', error);
    // Here you could show a global error message to the user
  });
}

main().catch(console.error);
