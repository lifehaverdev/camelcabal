import { Component, h } from '@monygroupcorp/microact';

function formatNumber(num) {
  const n = parseFloat(num);
  if (isNaN(n)) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}

class StatsBar extends Component {
  render() {
    const { totalSupply, totalStaked, tokenBalance, connected, stakingEnabled } = this.props;

    // Calculate NFT equivalents (1M tokens = 1 NFT)
    const nftEquivalent = Math.floor(parseFloat(totalSupply) / 1000000);
    const stakedPercent = parseFloat(totalSupply) > 0
      ? ((parseFloat(totalStaked) / parseFloat(totalSupply)) * 100).toFixed(1)
      : '0';

    return h('div', { className: 'container' },
      h('div', { className: 'stats-bar animate-fade-in delay-2' },
        h('div', { className: 'stat-item' },
          h('div', { className: 'stat-label' }, 'Total Supply'),
          h('div', { className: 'stat-value' }, formatNumber(totalSupply))
        ),
        h('div', { className: 'stat-item' },
          h('div', { className: 'stat-label' }, 'NFT Equivalent'),
          h('div', { className: 'stat-value' }, nftEquivalent.toLocaleString())
        ),
        // Only show staking stats when staking is enabled
        stakingEnabled && h('div', { className: 'stat-item' },
          h('div', { className: 'stat-label' }, 'Total Staked'),
          h('div', { className: 'stat-value' }, `${formatNumber(totalStaked)} (${stakedPercent}%)`)
        ),
        connected && h('div', { className: 'stat-item' },
          h('div', { className: 'stat-label' }, 'Your Balance'),
          h('div', { className: 'stat-value' }, formatNumber(tokenBalance))
        )
      )
    );
  }
}

export default StatsBar;
