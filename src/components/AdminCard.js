import { Component, h } from '@monygroupcorp/microact';
import { ethers } from 'ethers';
import { getMerkleRoot } from '../utils/merkle.js';

class AdminCard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      error: null,
      success: null,
      // Form inputs
      merkleRoot: getMerkleRoot(),
      poolAddress: '',
      exemptAddress: '',
      exemptStatus: true,
      baseURI: '',
      unrevealedURI: '',
      whitelistMintAmount: '1000000',
      // Contract state
      contractState: null
    };
  }

  didMount() {
    this.loadContractState();
    this.subscribe('wallet:connected', () => this.loadContractState());
  }

  async loadContractState() {
    const { walletService, contractsInfo } = this.props;
    if (!walletService?.isConnected() || !contractsInfo?.contracts?.camel) return;

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        provider
      );

      const [
        owner,
        metadataLocked,
        stakingEnabled,
        hidden
      ] = await Promise.all([
        camel.owner(),
        camel.metadataLocked(),
        camel.stakingEnabled(),
        camel.hidden().catch(() => null)
      ]);

      this.setState({
        contractState: {
          owner,
          metadataLocked,
          stakingEnabled,
          hidden,
          isOwner: owner.toLowerCase() === walletService.connectedAddress.toLowerCase()
        }
      });
    } catch (e) {
      console.error('Failed to load contract state:', e);
    }
  }

  async execute(method, args = [], successMsg) {
    const { walletService, contractsInfo } = this.props;

    if (!walletService?.isConnected()) {
      this.setState({ error: 'Connect wallet first' });
      return;
    }

    this.setState({ loading: true, error: null, success: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();
      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        signer
      );

      const tx = await camel[method](...args);
      await tx.wait();

      this.setState({ loading: false, success: successMsg || `${method} successful` });
      this.loadContractState();
    } catch (e) {
      console.error(`${method} error:`, e);
      this.setState({ loading: false, error: e.reason || e.message });
    }
  }

  renderSection(title, children) {
    return h('div', { className: 'admin-section' },
      h('h3', { className: 'admin-section-title' }, title),
      children
    );
  }

  renderInput(label, stateKey, placeholder = '') {
    return h('div', { className: 'form-group' },
      h('label', { className: 'form-label' }, label),
      h('input', {
        type: 'text',
        className: 'form-input',
        placeholder,
        value: this.state[stateKey],
        onChange: (e) => this.setState({ [stateKey]: e.target.value })
      })
    );
  }

  renderButton(label, onClick, disabled = false) {
    const { loading } = this.state;
    return h('button', {
      className: 'btn btn-primary',
      disabled: loading || disabled,
      onClick
    }, loading ? h('span', { className: 'loading' }) : label);
  }

  render() {
    const { walletService, contractsInfo } = this.props;
    const { error, success, contractState, merkleRoot, poolAddress, exemptAddress, exemptStatus, baseURI, unrevealedURI, whitelistMintAmount } = this.state;

    const connected = walletService?.isConnected();
    const camelAddress = contractsInfo?.contracts?.camel?.address;

    return h('div', { className: 'admin-page' },
      h('div', { className: 'container' },
        h('h1', { className: 'admin-title' }, 'Admin Panel'),

        !connected && h('div', { className: 'status-message status-warning' },
          'Connect wallet to access admin functions'
        ),

        contractState && !contractState.isOwner && h('div', { className: 'status-message status-error' },
          'Connected wallet is not the contract owner'
        ),

        error && h('div', { className: 'status-message status-error' }, error),
        success && h('div', { className: 'status-message status-success' }, success),

        // Contract Info
        h('div', { className: 'card admin-card' },
          this.renderSection('Contract Info',
            h('div', { className: 'admin-info' },
              h('div', null, `Address: ${camelAddress || 'Not deployed'}`),
              contractState && h('div', null, `Owner: ${contractState.owner}`),
              contractState && h('div', null, `Metadata Locked: ${contractState.metadataLocked}`),
              contractState && h('div', null, `Staking Enabled: ${contractState.stakingEnabled}`),
              contractState && contractState.hidden !== null && h('div', null, `Hidden (Unrevealed): ${contractState.hidden}`)
            )
          )
        ),

        // Whitelist / Merkle
        h('div', { className: 'card admin-card' },
          this.renderSection('Whitelist',
            h('div', null,
              this.renderInput('Merkle Root', 'merkleRoot', '0x...'),
              h('p', { className: 'form-hint' }, 'Current root from whitelist.js shown above'),
              this.renderButton('Set Merkle Root', () =>
                this.execute('setMerkleRoot', [merkleRoot], 'Merkle root set')
              ),
              h('div', { style: { marginTop: '1rem' } },
                this.renderButton('Enable Whitelist Mint', () =>
                  this.execute('setWhitelistMintEnabled', [true], 'Whitelist mint enabled')
                ),
                h('span', { style: { margin: '0 0.5rem' } }),
                this.renderButton('Disable Whitelist Mint', () =>
                  this.execute('setWhitelistMintEnabled', [false], 'Whitelist mint disabled')
                )
              ),
              h('div', { style: { marginTop: '1rem' } },
                this.renderInput('Mint Amount (tokens)', 'whitelistMintAmount', '1000000'),
                this.renderButton('Set Mint Amount', () =>
                  this.execute('setWhitelistMintAmount', [ethers.utils.parseUnits(whitelistMintAmount, 18)], 'Mint amount set')
                )
              )
            )
          )
        ),

        // Sniper Tax / Pool
        h('div', { className: 'card admin-card' },
          this.renderSection('Sniper Tax',
            h('div', null,
              this.renderInput('Pool Address', 'poolAddress', '0x...'),
              this.renderButton('Set Pool (Starts Tax Timer)', () =>
                this.execute('setPool', [poolAddress], 'Pool set, sniper tax countdown started')
              ),
              h('div', { style: { marginTop: '1rem' } },
                this.renderInput('Exempt Address', 'exemptAddress', '0x...'),
                h('div', { style: { marginTop: '0.5rem' } },
                  this.renderButton('Add Exempt', () =>
                    this.execute('setExempt', [exemptAddress, true], 'Address exempted')
                  ),
                  h('span', { style: { margin: '0 0.5rem' } }),
                  this.renderButton('Remove Exempt', () =>
                    this.execute('setExempt', [exemptAddress, false], 'Exemption removed')
                  )
                )
              )
            )
          )
        ),

        // Metadata / Reveal
        h('div', { className: 'card admin-card' },
          this.renderSection('Metadata',
            h('div', null,
              this.renderInput('Base URI', 'baseURI', 'ipfs://Qm.../'),
              this.renderButton('Set Base URI', () =>
                this.execute('setBaseURI', [baseURI], 'Base URI set')
              ),
              h('div', { style: { marginTop: '1rem' } },
                this.renderInput('Unrevealed URI', 'unrevealedURI', 'ipfs://Qm.../unrevealed.json'),
                this.renderButton('Set Unrevealed URI', () =>
                  this.execute('setUnrevealedURI', [unrevealedURI], 'Unrevealed URI set')
                )
              ),
              h('div', { style: { marginTop: '1rem' } },
                this.renderButton('Reveal', () =>
                  this.execute('reveal', [], 'NFTs revealed!')
                ),
                h('span', { style: { margin: '0 0.5rem' } }),
                this.renderButton('Lock Metadata', () =>
                  this.execute('lockMetadata', [], 'Metadata locked permanently')
                )
              )
            )
          )
        ),

        // Staking
        h('div', { className: 'card admin-card' },
          this.renderSection('Staking',
            h('div', null,
              this.renderButton('Enable Staking', () =>
                this.execute('enableStaking', [], 'Staking enabled')
              )
            )
          )
        ),

        // Back link
        h('div', { style: { marginTop: '2rem', textAlign: 'center' } },
          h('a', { href: '#', className: 'btn btn-ghost' }, 'Back to App')
        )
      )
    );
  }
}

export default AdminCard;
