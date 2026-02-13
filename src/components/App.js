import { Component, h } from '@monygroupcorp/microact';
import { WalletButton } from '@monygroupcorp/micro-web3';
import { ethers } from 'ethers';
import TabbedCard from './TabbedCard.js';
import StakingCard from './StakingCard.js';
import StatsBar from './StatsBar.js';
import DesertScene from './DesertScene.js';
import AdminCard from './AdminCard.js';
import WhitepaperPage from './WhitepaperPage.js';

class App extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tokenBalance: '0',
      totalSupply: '0',
      totalStaked: '0',
      stakingEnabled: false,
      userStaked: '0',
      claimableRewards: '0',
      connected: false,
      userAddress: null,
      contractsInfo: null,
      contractsLoaded: false,
      isAdmin: window.location.hash === '#admin',
      isWhitepaper: window.location.hash === '#whitepaper'
    };
  }

  didMount() {
    // Listen for hash changes (admin page toggle)
    window.addEventListener('hashchange', () => {
      this.setState({
        isAdmin: window.location.hash === '#admin',
        isWhitepaper: window.location.hash === '#whitepaper'
      });
    });

    // Load contracts config first
    this.loadContracts();

    // Listen for wallet connection changes
    this.subscribe('wallet:connected', async () => {
      const { walletService } = this.props;
      this.setState({ connected: true, userAddress: walletService.connectedAddress });
      await this.ensureCorrectChain();
      this.loadUserData();
    });
    this.subscribe('wallet:disconnected', () => {
      this.setState({ connected: false, userAddress: null });
    });
    this.subscribe('wallet:accountsChanged', () => {
      const { walletService } = this.props;
      this.setState({ userAddress: walletService.connectedAddress });
      this.loadUserData();
    });

    // Check if already connected
    const { walletService } = this.props;
    if (walletService && walletService.isConnected()) {
      this.setState({ connected: true, userAddress: walletService.connectedAddress });
      this.ensureCorrectChain();
      this.loadUserData();
    }

    // Auto-refresh data every 15 seconds
    this.setInterval(() => this.loadContractData(), 15000);
  }

  async loadContracts() {
    try {
      const module = await import('../generated/contracts.json');
      const contractsInfo = module.default || module;
      this.setState({ contractsInfo, contractsLoaded: true });
      this.loadContractData();
      // If wallet was already connected before contracts loaded, fetch user data now
      const { walletService } = this.props;
      if (walletService?.isConnected()) {
        this.loadUserData();
      }
    } catch (e) {
      console.warn('contracts.json not found, using defaults');
      this.setState({ contractsLoaded: true });
    }
  }

  async ensureCorrectChain() {
    const { walletService } = this.props;
    const { contractsInfo } = this.state;
    if (!walletService?.isConnected() || !contractsInfo) return;

    const targetChainId = contractsInfo.chainId;
    const targetHex = '0x' + targetChainId.toString(16);

    try {
      const currentHex = await walletService.provider.request({ method: 'eth_chainId' });
      if (parseInt(currentHex, 16) === targetChainId) return;

      await walletService.provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetHex }]
      });
    } catch (err) {
      // 4902 = chain not added to wallet
      if (err.code === 4902) {
        try {
          await walletService.provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: targetHex,
              chainName: 'Ethereum',
              rpcUrls: [contractsInfo.rpcUrl],
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
            }]
          });
        } catch (addErr) {
          console.error('Failed to add chain:', addErr);
        }
      } else {
        console.error('Failed to switch chain:', err);
      }
    }
  }

  getProvider() {
    const { contractsInfo } = this.state;
    const rpcUrl = contractsInfo?.rpcUrl || 'http://127.0.0.1:8545';
    return new ethers.providers.JsonRpcProvider(rpcUrl);
  }

  getCamelContract(signerOrProvider) {
    const { contractsInfo } = this.state;
    if (!contractsInfo?.contracts?.camel) return null;
    return new ethers.Contract(
      contractsInfo.contracts.camel.address,
      contractsInfo.contracts.camel.abi,
      signerOrProvider
    );
  }

  async loadContractData() {
    try {
      const provider = this.getProvider();
      const camel = this.getCamelContract(provider);
      if (!camel) return;

      const [totalSupply, totalStaked, stakingEnabled] = await Promise.all([
        camel.totalSupply(),
        camel.totalStaked(),
        camel.stakingEnabled()
      ]);

      this.setState({
        totalSupply: ethers.utils.formatUnits(totalSupply, 18),
        totalStaked: ethers.utils.formatUnits(totalStaked, 18),
        stakingEnabled
      });
    } catch (error) {
      console.error('Failed to load contract data:', error);
    }
  }

  async loadUserData() {
    const { walletService } = this.props;
    const { contractsInfo } = this.state;
    if (!walletService?.isConnected() || !contractsInfo?.contracts?.camel) return;

    try {
      const provider = this.getProvider();
      const camel = this.getCamelContract(provider);
      const userAddress = walletService.connectedAddress;

      const [balance, stakingInfo, claimable] = await Promise.all([
        camel.balanceOf(userAddress),
        camel.getStakingInfo(userAddress),
        camel.getClaimableRewards(userAddress).catch(() => ethers.BigNumber.from(0))
      ]);

      this.setState({
        tokenBalance: ethers.utils.formatUnits(balance, 18),
        userStaked: ethers.utils.formatUnits(stakingInfo.stakedAmount, 18),
        claimableRewards: ethers.utils.formatEther(claimable)
      });
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }

  render() {
    const { walletService } = this.props;
    const { contractsInfo, isAdmin, isWhitepaper } = this.state;
    const rpcUrl = contractsInfo?.rpcUrl || 'http://127.0.0.1:8545';
    const chainId = contractsInfo?.chainId || 31337;
    const camelAddress = contractsInfo?.contracts?.camel?.address || 'Not deployed';

    // Whitepaper page
    if (isWhitepaper) {
      return h('div', { className: 'app' },
        h(DesertScene),
        h(WhitepaperPage)
      );
    }

    // Admin page
    if (isAdmin) {
      return h('div', { className: 'app admin-mode' },
        h(AdminCard, {
          walletService,
          contractsInfo: this.state.contractsInfo
        }),
        h(WalletButton, { walletService })
      );
    }

    return h('div', { className: 'app' },
      // Desert background scene
      h(DesertScene),

      // Hero Section
      h('header', { className: 'hero' },
        h('div', { className: 'container' },
          h('div', { className: 'hero-content animate-fade-in-up' },
            // Camel Brand Mark SVG
            h('div', { className: 'brand-mark' },
              h('svg', { viewBox: '0 0 100 80', xmlns: 'http://www.w3.org/2000/svg' },
                h('path', { d: 'M85 55 C85 45 80 35 70 30 C65 28 60 28 55 30 L50 20 C48 16 44 14 40 14 C36 14 33 16 32 20 L28 30 C20 28 12 35 10 45 C8 55 10 60 15 65 L15 75 L25 75 L25 65 L75 65 L75 75 L85 75 L85 65 C90 60 92 55 85 55 Z M35 35 C37 35 39 37 39 40 C39 43 37 45 35 45 C33 45 31 43 31 40 C31 37 33 35 35 35 Z' })
              )
            ),
            h('h1', { className: 'hero-title' }, 'CAMEL'),
            h('p', { className: 'hero-subtitle' }, 'A Cypher Protocol Collectible'),
            h('p', { className: 'hero-tagline' },
              'Commemorating the launch of Ethereum\'s community-owned capital markets infrastructure. A dual-nature ERC404 where every 1,000,000 tokens transforms into a unique NFT.'
            ),
            h('div', { className: 'art-deco-divider' },
              h('div', { className: 'ornament' })
            ),
            h('p', { className: 'hero-alignment' },
              'No VCs. No private investors. Built for Ethereum. Owned by the community.'
            )
          )
        )
      ),

      // Stats Bar
      h(StatsBar, {
        totalSupply: this.state.totalSupply,
        totalStaked: this.state.totalStaked,
        tokenBalance: this.state.tokenBalance,
        connected: this.state.connected,
        stakingEnabled: this.state.stakingEnabled
      }),

      // Main Content
      h('main', { className: 'main' },
        h('div', { className: 'container' },
          h('div', { className: 'single-card-layout' },
            // Tabbed Card (Claim, Trade, Collection)
            h(TabbedCard, {
              walletService,
              contractsInfo: this.state.contractsInfo,
              tokenBalance: this.state.tokenBalance,
              onSuccess: () => this.loadUserData()
            }),

            // Staking Card - only shown when staking is enabled
            this.state.stakingEnabled && h(StakingCard, {
              walletService,
              contractsInfo: this.state.contractsInfo,
              stakingEnabled: this.state.stakingEnabled,
              userStaked: this.state.userStaked,
              totalStaked: this.state.totalStaked,
              claimableRewards: this.state.claimableRewards,
              tokenBalance: this.state.tokenBalance,
              onStakeSuccess: () => {
                this.loadContractData();
                this.loadUserData();
              }
            })
          )
        )
      ),

      // Footer
      h('footer', { className: 'footer' },
        h('div', { className: 'container' },
          h('div', { className: 'footer-brand' }, 'CAMEL'),
          h('p', { className: 'footer-tagline' },
            'A commemorative collectible celebrating the launch of Cypher Protocol'
          ),
          h('div', { className: 'footer-links' },
            h('a', { className: 'footer-link', href: 'https://app.cyphereth.com/', target: '_blank', rel: 'noopener' }, 'Cypher'),
            h('a', { className: 'footer-link', href: '#whitepaper', rel: 'noopener' }, 'Whitepaper'),
            h('a', { className: 'footer-link', href: 'https://x.com/cypher_ethereum', target: '_blank', rel: 'noopener' }, 'X')
          ),
          h('p', { className: 'footer-copy' },
            'Built for Ethereum. Owned by the community.'
          )
        )
      ),

      // Wallet Button
      h(WalletButton, { walletService })
    );
  }
}

export default App;
