import { Component, h } from '@monygroupcorp/microact';
import { ethers } from 'ethers';

function formatNumber(num) {
  const n = parseFloat(num);
  if (isNaN(n)) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(4);
}

class StakingCard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      stakeAmount: '',
      unstakeAmount: '',
      pending: false,
      error: null,
      success: null
    };
  }

  async handleStake() {
    const { walletService, contractsInfo, onStakeSuccess } = this.props;

    if (!walletService?.isConnected()) {
      this.setState({ error: 'Please connect your wallet first' });
      return;
    }

    if (!this.state.stakeAmount || parseFloat(this.state.stakeAmount) <= 0) {
      this.setState({ error: 'Please enter an amount to stake' });
      return;
    }

    this.setState({ pending: true, error: null, success: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();

      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        signer
      );

      const amount = ethers.utils.parseUnits(this.state.stakeAmount, 18);
      const tx = await camel.stake(amount);
      await tx.wait();

      this.setState({
        success: 'Successfully staked!',
        pending: false,
        stakeAmount: ''
      });

      if (onStakeSuccess) onStakeSuccess();
    } catch (error) {
      console.error('Stake error:', error);
      this.setState({
        error: error.reason || error.message || 'Stake failed',
        pending: false
      });
    }
  }

  async handleUnstake() {
    const { walletService, contractsInfo, onStakeSuccess } = this.props;

    if (!walletService?.isConnected()) {
      this.setState({ error: 'Please connect your wallet first' });
      return;
    }

    if (!this.state.unstakeAmount || parseFloat(this.state.unstakeAmount) <= 0) {
      this.setState({ error: 'Please enter an amount to unstake' });
      return;
    }

    this.setState({ pending: true, error: null, success: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();

      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        signer
      );

      const amount = ethers.utils.parseUnits(this.state.unstakeAmount, 18);
      const tx = await camel.unstake(amount);
      await tx.wait();

      this.setState({
        success: 'Successfully unstaked!',
        pending: false,
        unstakeAmount: ''
      });

      if (onStakeSuccess) onStakeSuccess();
    } catch (error) {
      console.error('Unstake error:', error);
      this.setState({
        error: error.reason || error.message || 'Unstake failed',
        pending: false
      });
    }
  }

  async handleClaimRewards() {
    const { walletService, contractsInfo, onStakeSuccess } = this.props;

    if (!walletService?.isConnected()) {
      this.setState({ error: 'Please connect your wallet first' });
      return;
    }

    this.setState({ pending: true, error: null, success: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();

      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        signer
      );

      const tx = await camel.claimRewards();
      await tx.wait();

      this.setState({
        success: 'Rewards claimed!',
        pending: false
      });

      if (onStakeSuccess) onStakeSuccess();
    } catch (error) {
      console.error('Claim error:', error);
      this.setState({
        error: error.reason || error.message || 'Claim failed',
        pending: false
      });
    }
  }

  render() {
    const { stakingEnabled, userStaked, totalStaked, claimableRewards, tokenBalance } = this.props;
    const { stakeAmount, unstakeAmount, pending, error, success } = this.state;

    return h('div', { className: 'card animate-fade-in-up delay-5' },
      h('h2', { className: 'card-title' }, 'Staking'),
      h('p', { className: 'card-subtitle' }, 'Earn rewards from protocol fees'),

      !stakingEnabled && h('div', { className: 'status-message status-warning' },
        'Staking is not yet enabled'
      ),

      // Staking Stats
      h('div', { className: 'staking-stats' },
        h('div', { className: 'staking-stat' },
          h('div', { className: 'staking-stat-value' }, formatNumber(userStaked)),
          h('div', { className: 'staking-stat-label' }, 'Your Staked')
        ),
        h('div', { className: 'staking-stat' },
          h('div', { className: 'staking-stat-value' }, formatNumber(totalStaked)),
          h('div', { className: 'staking-stat-label' }, 'Total Staked')
        ),
        h('div', { className: 'staking-stat' },
          h('div', { className: 'staking-stat-value' }, `${formatNumber(claimableRewards)} ETH`),
          h('div', { className: 'staking-stat-label' }, 'Claimable')
        ),
        h('div', { className: 'staking-stat' },
          h('div', { className: 'staking-stat-value' }, formatNumber(tokenBalance)),
          h('div', { className: 'staking-stat-label' }, 'Available')
        )
      ),

      // Stake Input
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Stake Amount'),
        h('input', {
          type: 'number',
          className: 'form-input',
          placeholder: '0.0',
          value: stakeAmount,
          onChange: (e) => this.setState({ stakeAmount: e.target.value }),
          disabled: !stakingEnabled
        })
      ),

      // Unstake Input
      h('div', { className: 'form-group' },
        h('label', { className: 'form-label' }, 'Unstake Amount'),
        h('input', {
          type: 'number',
          className: 'form-input',
          placeholder: '0.0',
          value: unstakeAmount,
          onChange: (e) => this.setState({ unstakeAmount: e.target.value }),
          disabled: !stakingEnabled
        })
      ),

      error && h('div', { className: 'status-message status-error' }, error),
      success && h('div', { className: 'status-message status-success' }, success),

      // Action Buttons
      h('div', { className: 'staking-actions' },
        h('button', {
          className: 'btn btn-primary',
          disabled: pending || !stakingEnabled || !stakeAmount,
          onClick: this.bind(this.handleStake)
        },
          pending ? h('span', { className: 'loading' }) : 'Stake'
        ),
        h('button', {
          className: 'btn btn-secondary',
          disabled: pending || !stakingEnabled || !unstakeAmount,
          onClick: this.bind(this.handleUnstake)
        },
          'Unstake'
        )
      ),

      // Claim Button
      h('button', {
        className: 'btn btn-ghost btn-block',
        style: { marginTop: '1rem' },
        disabled: pending || !stakingEnabled || parseFloat(claimableRewards) <= 0,
        onClick: this.bind(this.handleClaimRewards)
      },
        'Claim Rewards'
      )
    );
  }
}

export default StakingCard;
