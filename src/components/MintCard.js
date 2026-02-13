import { Component, h } from '@monygroupcorp/microact';
import { ethers } from 'ethers';

class MintCard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      minting: false,
      error: null,
      success: null,
      mintAmount: 1
    };
  }

  async handleMint() {
    const { walletService, contractsInfo, onMintSuccess } = this.props;

    if (!walletService?.isConnected()) {
      this.setState({ error: 'Please connect your wallet first' });
      return;
    }

    this.setState({ minting: true, error: null, success: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();

      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        signer
      );

      // For demo: we'll do a balanceMint if user has tokens
      // In production, this would call a free mint function
      const balance = await camel.balanceOf(walletService.connectedAddress);
      const unit = ethers.utils.parseUnits('1000000', 18); // 1M tokens = 1 NFT

      if (balance.lt(unit)) {
        this.setState({
          error: 'You need at least 1,000,000 CAMEL tokens to mint an NFT',
          minting: false
        });
        return;
      }

      const tx = await camel.balanceMint(this.state.mintAmount);
      await tx.wait();

      this.setState({
        success: `Successfully minted ${this.state.mintAmount} NFT(s)!`,
        minting: false
      });

      if (onMintSuccess) onMintSuccess();
    } catch (error) {
      console.error('Mint error:', error);
      this.setState({
        error: error.reason || error.message || 'Mint failed',
        minting: false
      });
    }
  }

  render() {
    const { minting, error, success } = this.state;

    return h('div', { className: 'card animate-fade-in-up delay-3' },
      h('h2', { className: 'card-title' }, 'Claim NFT'),
      h('p', { className: 'card-subtitle' }, 'Dual-nature token transformation'),

      h('div', { className: 'mint-info' },
        h('div', { className: 'mint-available' }, '1M'),
        h('div', { className: 'mint-label' }, 'Tokens per NFT')
      ),

      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Amount to Mint'),
        h('input', {
          type: 'number',
          className: 'form-input',
          min: 1,
          max: 10,
          value: this.state.mintAmount,
          onChange: (e) => this.setState({ mintAmount: parseInt(e.target.value) || 1 })
        }),
        h('p', { className: 'form-hint' },
          `Requires ${(this.state.mintAmount * 1000000).toLocaleString()} CAMEL tokens`
        )
      ),

      error && h('div', { className: 'status-message status-error' }, error),
      success && h('div', { className: 'status-message status-success' }, success),

      h('button', {
        className: 'btn btn-primary btn-block',
        disabled: minting,
        onClick: this.bind(this.handleMint)
      },
        minting ? h('span', { className: 'loading' }) : 'Mint NFT'
      )
    );
  }
}

export default MintCard;
