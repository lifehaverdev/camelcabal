import { Component, h } from '@monygroupcorp/microact';
import { ethers } from 'ethers';

class TraitsCard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      nfts: [],
      selectedNft: null,
      loading: false,
      error: null
    };
  }

  didMount() {
    this.loadNFTs();
  }

  async loadNFTs() {
    const { walletService, contractsInfo } = this.props;

    if (!walletService?.isConnected() || !contractsInfo) {
      return;
    }

    this.setState({ loading: true, error: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        provider
      );

      // Get user's NFT balance (ERC721 balance)
      const nftBalance = await camel.erc721BalanceOf(walletService.connectedAddress);
      const nfts = [];

      // Fetch owned token IDs
      for (let i = 0; i < Math.min(nftBalance.toNumber(), 20); i++) {
        try {
          const tokenId = await camel.owned(walletService.connectedAddress, i);
          const traits = await this.fetchTraits(camel, tokenId);
          nfts.push({ tokenId: tokenId.toString(), traits });
        } catch (e) {
          console.warn('Failed to fetch NFT at index', i, e);
        }
      }

      this.setState({ nfts, loading: false });
    } catch (error) {
      console.error('Failed to load NFTs:', error);
      this.setState({ error: 'Failed to load NFTs', loading: false });
    }
  }

  async fetchTraits(contract, tokenId) {
    try {
      // Try to get tokenURI and parse traits
      const tokenURI = await contract.tokenURI(tokenId);

      // Handle base64 encoded JSON
      if (tokenURI.startsWith('data:application/json;base64,')) {
        const json = atob(tokenURI.split(',')[1]);
        const metadata = JSON.parse(json);
        return metadata.attributes || [];
      }

      // Handle direct JSON
      if (tokenURI.startsWith('data:application/json,')) {
        const json = decodeURIComponent(tokenURI.split(',')[1]);
        const metadata = JSON.parse(json);
        return metadata.attributes || [];
      }

      return [];
    } catch (e) {
      console.warn('Failed to fetch traits for token', tokenId.toString(), e);
      return [];
    }
  }

  selectNft(nft) {
    this.setState({ selectedNft: nft });
  }

  clearSelectedNft() {
    this.setState({ selectedNft: null });
  }

  renderTraitValue(trait) {
    if (typeof trait.value === 'number') {
      return trait.value.toString();
    }
    return trait.value || 'Unknown';
  }

  render() {
    const { walletService } = this.props;
    const { nfts, selectedNft, loading, error } = this.state;

    if (!walletService?.isConnected()) {
      return h('div', { className: 'card animate-fade-in-up delay-6' },
        h('h2', { className: 'card-title' }, 'Collection'),
        h('p', { className: 'card-subtitle' }, 'Your commemorative camels'),
        h('div', { className: 'status-message status-warning' },
          'Connect wallet to view your NFTs'
        )
      );
    }

    return h('div', { className: 'card animate-fade-in-up delay-6' },
      h('h2', { className: 'card-title' }, 'Collection'),
      h('p', { className: 'card-subtitle' }, 'Your commemorative camels'),

      loading && h('div', { className: 'traits-loading' },
        h('span', { className: 'loading' }),
        h('span', null, 'Loading your camels...')
      ),

      error && h('div', { className: 'status-message status-error' }, error),

      !loading && nfts.length === 0 && h('div', { className: 'traits-empty' },
        h('div', { className: 'traits-empty-icon' }, '🐪'),
        h('p', null, 'No NFTs found'),
        h('p', { className: 'traits-empty-hint' },
          'Hold at least 1,000,000 CAMEL tokens to receive an NFT'
        )
      ),

      // NFT Grid
      !loading && nfts.length > 0 && h('div', { className: 'nft-grid' },
        nfts.map(nft =>
          h('div', {
            key: nft.tokenId,
            className: `nft-card ${selectedNft?.tokenId === nft.tokenId ? 'nft-card-selected' : ''}`,
            onClick: () => this.selectNft(nft)
          },
            h('div', { className: 'nft-card-id' }, `#${nft.tokenId}`),
            h('div', { className: 'nft-card-icon' }, '🐫')
          )
        )
      ),

      // Selected NFT Traits
      selectedNft && h('div', { className: 'traits-panel' },
        h('div', { className: 'traits-header' },
          h('h3', null, `Camel #${selectedNft.tokenId}`),
          h('button', {
            className: 'traits-close',
            onClick: this.bind(this.clearSelectedNft)
          }, '×')
        ),

        selectedNft.traits.length === 0
          ? h('p', { className: 'traits-none' }, 'No traits available')
          : h('div', { className: 'traits-list' },
              selectedNft.traits.map((trait, idx) =>
                h('div', { key: idx, className: 'trait-item' },
                  h('div', { className: 'trait-type' }, trait.trait_type || 'Trait'),
                  h('div', { className: 'trait-value' }, this.renderTraitValue(trait))
                )
              )
            )
      ),

      // Refresh button
      !loading && h('button', {
        className: 'btn btn-ghost btn-block',
        style: { marginTop: '1rem' },
        onClick: this.bind(this.loadNFTs)
      }, 'Refresh Collection')
    );
  }
}

export default TraitsCard;
