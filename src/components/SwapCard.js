import { Component, h } from '@monygroupcorp/microact';
import { ethers } from 'ethers';

class SwapCard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      fromToken: 'ETH',
      toToken: 'CAMEL',
      fromAmount: '',
      toAmount: '',
      swapping: false,
      error: null,
      success: null
    };
  }

  toggleDirection() {
    this.setState(prev => ({
      fromToken: prev.toToken,
      toToken: prev.fromToken,
      fromAmount: prev.toAmount,
      toAmount: prev.fromAmount
    }));
  }

  updateFromAmount(value) {
    // Simple rate calculation for demo (in production, use Quoter contract)
    const rate = this.state.fromToken === 'ETH' ? 1000000 : 0.000001;
    const toAmount = value ? (parseFloat(value) * rate).toString() : '';
    this.setState({ fromAmount: value, toAmount });
  }

  async handleSwap() {
    const { walletService, contractsInfo, onSwapSuccess } = this.props;

    if (!walletService?.isConnected()) {
      this.setState({ error: 'Please connect your wallet first' });
      return;
    }

    if (!this.state.fromAmount || parseFloat(this.state.fromAmount) <= 0) {
      this.setState({ error: 'Please enter an amount' });
      return;
    }

    this.setState({ swapping: true, error: null, success: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();

      // Get Cypher Protocol swap router
      const swapRouterAddress = contractsInfo.cypherProtocol.SWAP_ROUTER;
      const swapRouterAbi = [
        'function exactInputSingle((address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) external payable returns (uint256 amountOut)'
      ];

      const swapRouter = new ethers.Contract(swapRouterAddress, swapRouterAbi, signer);

      const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

      if (this.state.fromToken === 'ETH') {
        // ETH -> CAMEL
        const amountIn = ethers.utils.parseEther(this.state.fromAmount);

        const params = {
          tokenIn: contractsInfo.cypherProtocol.WETH,
          tokenOut: contractsInfo.contracts.camel.address,
          recipient: walletService.connectedAddress,
          deadline,
          amountIn,
          amountOutMinimum: 0, // In production, calculate slippage
          limitSqrtPrice: 0
        };

        const tx = await swapRouter.exactInputSingle(params, { value: amountIn });
        await tx.wait();
      } else {
        // CAMEL -> ETH
        const camel = new ethers.Contract(
          contractsInfo.contracts.camel.address,
          contractsInfo.contracts.camel.abi,
          signer
        );

        const amountIn = ethers.utils.parseUnits(this.state.fromAmount, 18);

        // Approve router to spend CAMEL
        const allowance = await camel.allowance(walletService.connectedAddress, swapRouterAddress);
        if (allowance.lt(amountIn)) {
          const approveTx = await camel.approve(swapRouterAddress, ethers.constants.MaxUint256);
          await approveTx.wait();
        }

        const params = {
          tokenIn: contractsInfo.contracts.camel.address,
          tokenOut: contractsInfo.cypherProtocol.WETH,
          recipient: walletService.connectedAddress,
          deadline,
          amountIn,
          amountOutMinimum: 0,
          limitSqrtPrice: 0
        };

        const tx = await swapRouter.exactInputSingle(params);
        await tx.wait();
      }

      this.setState({
        success: 'Swap successful!',
        swapping: false,
        fromAmount: '',
        toAmount: ''
      });

      if (onSwapSuccess) onSwapSuccess();
    } catch (error) {
      console.error('Swap error:', error);
      this.setState({
        error: error.reason || error.message || 'Swap failed',
        swapping: false
      });
    }
  }

  render() {
    const { fromToken, toToken, fromAmount, toAmount, swapping, error, success } = this.state;
    const { tokenBalance } = this.props;

    return h('div', { className: 'card animate-fade-in-up delay-4' },
      h('h2', { className: 'card-title' }, 'Trade'),
      h('p', { className: 'card-subtitle' }, 'Gas-efficient swaps via Cypher DEX'),

      h('div', { className: 'swap-container' },
        // From Input
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, `From (${fromToken})`),
          h('input', {
            type: 'number',
            className: 'form-input',
            placeholder: '0.0',
            value: fromAmount,
            onChange: (e) => this.updateFromAmount(e.target.value)
          }),
          fromToken === 'CAMEL' && h('p', { className: 'form-hint' },
            `Balance: ${parseFloat(tokenBalance).toLocaleString()} CAMEL`
          )
        ),

        // Direction Toggle
        h('div', { className: 'swap-direction' },
          h('button', {
            className: 'swap-direction-btn',
            onClick: this.bind(this.toggleDirection)
          },
            h('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'currentColor' },
              h('path', { d: 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z' }),
              h('path', { d: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z' })
            )
          )
        ),

        // To Input
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, `To (${toToken})`),
          h('input', {
            type: 'number',
            className: 'form-input',
            placeholder: '0.0',
            value: toAmount,
            readOnly: true
          })
        ),

        // Rate Display
        h('div', { className: 'swap-rate' },
          h('div', { className: 'swap-rate-label' }, 'Estimated Rate'),
          h('div', { className: 'swap-rate-value' },
            fromToken === 'ETH'
              ? '1 ETH = ~1,000,000 CAMEL'
              : '1,000,000 CAMEL = ~1 ETH'
          )
        )
      ),

      error && h('div', { className: 'status-message status-error', style: { marginTop: '1rem' } }, error),
      success && h('div', { className: 'status-message status-success', style: { marginTop: '1rem' } }, success),

      h('button', {
        className: 'btn btn-primary btn-block',
        style: { marginTop: '1.5rem' },
        disabled: swapping || !fromAmount,
        onClick: this.bind(this.handleSwap)
      },
        swapping ? h('span', { className: 'loading' }) : 'Swap'
      )
    );
  }
}

export default SwapCard;
