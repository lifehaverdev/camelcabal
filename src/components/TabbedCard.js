import { Component, h } from '@monygroupcorp/microact';
import { ethers } from 'ethers';
import { IpfsImage, IpfsService } from '@monygroupcorp/micro-web3';
import { isWhitelisted, getMerkleProof } from '../utils/merkle.js';

class TabbedCard extends Component {
  constructor(props) {
    super(props);
    this.state = {
      activeTab: 'claim',
      // Claim (whitelist) state
      whitelistChecked: false,
      onWhitelist: false,
      hasClaimed: false,
      whitelistMinting: false,
      freeMintsRemaining: null,
      // Swap state
      fromToken: 'ETH',
      toToken: 'CAMEL',
      fromAmount: '',
      toAmount: '',
      swapping: false,
      quoting: false,
      sniperTaxPercent: null,
      slippage: 1,
      customSlippage: '',
      showSlippageSettings: false,
      ethBalance: null,
      // Portfolio state
      nfts: [],
      loadingNfts: false,
      // Detail modal
      detailNft: null,
      fullscreenImage: false,
      sendAddress: '',
      sendConfirming: false,
      sending: false,
      // Reroll
      rerollMode: false,
      shieldedIds: new Set(),
      rerolling: false,
      // Mint
      mintableCount: 0,
      minting: false,
      rawBalance: null,
      // Advanced
      advancedOpen: false,
      skipNftStatus: null,
      skipNftToggling: false,
      skipNftGap: 0,
      skipNftConfirming: false,
      // Address detection
      addressHasCode: false,
      // Liquidity / Stake tab
      liquidityLoading: false,
      liquidityData: null,
      // Shared
      error: null,
      success: null
    };
  }

  didMount() {
    this.subscribe('wallet:connected', () => {
      this.loadNFTs();
      this.checkWhitelist();
      this.loadPortfolioData();
      this.checkAddressCode();
    });

    const { walletService } = this.props;
    if (walletService?.isConnected()) {
      this.loadNFTs();
      this.checkWhitelist();
      this.loadPortfolioData();
      this.checkAddressCode();
    }
  }

  didUpdate() {
    const { walletService, contractsInfo } = this.props;
    if (walletService?.isConnected() && contractsInfo && !this.state.whitelistChecked && !this._checkingWhitelist) {
      this._checkingWhitelist = true;
      this.loadNFTs();
      this.checkWhitelist();
      this.loadPortfolioData();
    }
  }

  async checkAddressCode() {
    const { walletService } = this.props;
    if (!walletService?.isConnected()) return;

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const address = walletService.connectedAddress;
      const code = await provider.getCode(address);
      this.setState({ addressHasCode: code !== '0x' });
    } catch (e) {
      console.warn('[address] Failed to check code:', e);
    }
  }

  async checkWhitelist() {
    const { walletService, contractsInfo } = this.props;
    if (!walletService?.isConnected()) return;

    const address = walletService.connectedAddress;
    if (!address) return;

    // Wait for contracts config to load (but not necessarily deployed contracts)
    if (!contractsInfo) return;

    // Use stageData in dev, merkle.js (from camel.json) in production
    const wlAddresses = contractsInfo.stageData?.mints?.whitelistAddresses;
    const onWhitelist = wlAddresses
      ? wlAddresses.some(a => a.toLowerCase() === address.toLowerCase())
      : isWhitelisted(address);

    let hasClaimed = false;
    let freeMintsRemaining = null;

    if (contractsInfo?.contracts?.camel) {
      try {
        const provider = new ethers.providers.Web3Provider(walletService.provider);
        const camel = new ethers.Contract(
          contractsInfo.contracts.camel.address,
          contractsInfo.contracts.camel.abi,
          provider
        );

        const [claimed, contractBalance] = await Promise.all([
          onWhitelist ? camel.hasClaimed(address) : Promise.resolve(false),
          camel.balanceOf(contractsInfo.contracts.camel.address)
        ]);

        hasClaimed = claimed;
        const unit = ethers.utils.parseUnits('1000000', 18);
        freeMintsRemaining = contractBalance.div(unit).toNumber();
      } catch (e) {
        console.warn('Failed to check claim status:', e);
      }
    }

    this.setState({ whitelistChecked: true, onWhitelist, hasClaimed, freeMintsRemaining });
  }

  async handleWhitelistMint() {
    const { walletService, contractsInfo, onSuccess } = this.props;

    if (!walletService?.isConnected()) {
      this.setState({ error: 'Please connect your wallet first' });
      return;
    }

    this.setState({ whitelistMinting: true, error: null, success: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();

      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        signer
      );

      // Use stageData proofs in dev, generate from merkle tree in production
      const addr = walletService.connectedAddress;
      const wlProofs = contractsInfo.stageData?.mints?.whitelistProofs;
      const proof = wlProofs
        ? (wlProofs[addr] || wlProofs[ethers.utils.getAddress(addr)] || [])
        : getMerkleProof(addr);
      const tx = await camel.whitelistMint(proof);
      await tx.wait();

      this.setState({
        success: 'Claimed successfully!',
        whitelistMinting: false,
        hasClaimed: true,
        freeMintsRemaining: this.state.freeMintsRemaining > 0 ? this.state.freeMintsRemaining - 1 : 0
      });

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Whitelist mint error:', error);
      const reason = error.reason || error.message || '';
      let msg = 'Claim failed';
      if (reason.includes('not enabled')) msg = 'Whitelist minting is not currently enabled';
      else if (reason.includes('Already claimed')) msg = 'You have already claimed';
      else if (reason.includes('Invalid proof')) msg = 'Your wallet is not on the whitelist';
      else if (reason) msg = reason;
      this.setState({
        error: msg,
        whitelistMinting: false
      });
    }
  }

  setTab(tab) {
    this.setState({
      activeTab: tab,
      error: null,
      success: null,
      rerollMode: false,
      shieldedIds: new Set(),
      detailNft: null,
      fullscreenImage: false,
      sendAddress: '',
      sendConfirming: false
    });
    if (tab === 'portfolio') {
      this.loadNFTs();
      this.loadPortfolioData();
    }
    if (tab === 'trade') {
      this.checkSniperTax();
      this.fetchEthBalance();
    }
    if (tab === 'stake') {
      this.loadLiquidityData();
    }
  }

  // ========== LIQUIDITY METHODS ==========

  // Compute token amounts for a V3 position given liquidity, tick range, and current price
  static positionAmounts(liquidity, tickLower, tickUpper, currentTick, sqrtPriceX96) {
    // Convert sqrtPriceX96 to float with precision (split to avoid Number overflow)
    const bi = BigInt(sqrtPriceX96.toString());
    const sqrtPrice = Number(bi / (2n ** 48n)) / (2 ** 48);
    const sqrtA = Math.sqrt(1.0001 ** tickLower);
    const sqrtB = Math.sqrt(1.0001 ** tickUpper);
    const liq = Number(liquidity.toString());

    let a0 = 0, a1 = 0;
    if (currentTick < tickLower) {
      a0 = liq * (1 / sqrtA - 1 / sqrtB);
    } else if (currentTick >= tickUpper) {
      a1 = liq * (sqrtB - sqrtA);
    } else {
      a0 = liq * (1 / sqrtPrice - 1 / sqrtB);
      a1 = liq * (sqrtPrice - sqrtA);
    }
    return { amount0: a0 / 1e18, amount1: a1 / 1e18 };
  }

  async loadLiquidityData() {
    const { contractsInfo } = this.props;
    if (!contractsInfo?.contracts?.liquidityManager) return;

    this.setState({ liquidityLoading: true });

    try {
      const rpcUrl = contractsInfo.rpcUrl || 'http://127.0.0.1:8545';
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const wethAddr = contractsInfo.cypherProtocol.WETH;

      const lm = new ethers.Contract(
        contractsInfo.contracts.liquidityManager.address,
        contractsInfo.contracts.liquidityManager.abi,
        provider
      );

      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        provider
      );

      // Algebra V3 PositionManager ABI (12 return values, deployer at index 4)
      const pm = new ethers.Contract(
        contractsInfo.cypherProtocol.POSITION_MANAGER,
        ['function positions(uint256) view returns (uint96, address, address, address, address, int24, int24, uint128, uint256, uint256, uint128, uint128)'],
        provider
      );

      const [activeIds, totalLiq, initialLiq, schedule, stakingEnabled] = await Promise.all([
        lm.getActivePositionIds(),
        lm.getTotalLiquidity(),
        lm.initialLiquidity(),
        lm.getInvestmentSchedule(),
        camel.stakingEnabled()
      ]);

      // For each position: get tick range + liquidity from PM, pool address from LM
      let totalCamel = 0;
      let totalWeth = 0;
      let poolAddress = null;
      const allocations = schedule.map(a => ({
        positionId: a.positionId.toString(),
        bps: a.bps.toNumber()
      }));

      for (const id of activeIds) {
        const posInfo = await lm.getPosition(id);
        const pmData = await pm.positions(id);
        // pmData: [nonce, operator, token0, token1, deployer, tickLower, tickUpper, liquidity, ...]
        const tickLower = pmData[5];
        const tickUpper = pmData[6];
        const liquidity = pmData[7];

        if (!poolAddress) poolAddress = posInfo.pool;

        // Get current pool price
        const pool = new ethers.Contract(
          posInfo.pool,
          ['function globalState() view returns (uint160 price, int24 tick, uint16, uint8, uint16, bool)'],
          provider
        );
        const state = await pool.globalState();
        const currentTick = state.tick;
        const sqrtPriceX96 = state.price;

        const { amount0, amount1 } = TabbedCard.positionAmounts(liquidity, tickLower, tickUpper, currentTick, sqrtPriceX96);

        // Determine which token is CAMEL vs WETH
        const token0IsWeth = posInfo.token0.toLowerCase() === wethAddr.toLowerCase();
        totalWeth += token0IsWeth ? amount0 : amount1;
        totalCamel += token0IsWeth ? amount1 : amount0;
      }

      // Growth: compare current total liquidity to initial locked liquidity
      const totalLiqNum = parseFloat(totalLiq.toString());
      const initialLiqNum = parseFloat(initialLiq.toString());
      const growthPct = initialLiqNum > 0 ? ((totalLiqNum - initialLiqNum) / initialLiqNum) * 100 : 0;

      this.setState({
        liquidityLoading: false,
        liquidityData: {
          stakingEnabled,
          totalCamel,
          totalWeth,
          growthPct,
          activePositions: activeIds.length,
          allocations
        }
      });
    } catch (e) {
      console.warn('[stake] Failed to load liquidity data:', e);
      this.setState({ liquidityLoading: false });
    }
  }

  // ========== SWAP METHODS ==========
  async fetchEthBalance() {
    const { walletService } = this.props;
    if (!walletService?.isConnected()) return;
    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();
      const balance = await signer.getBalance();
      this.setState({ ethBalance: ethers.utils.formatEther(balance) });
    } catch (e) {
      console.warn('Failed to fetch ETH balance:', e);
    }
  }

  async checkSniperTax() {
    const { contractsInfo } = this.props;
    if (!contractsInfo?.contracts?.camel || !contractsInfo?.cypherProtocol) return;

    try {
      const rpcUrl = contractsInfo.rpcUrl || 'http://127.0.0.1:8545';
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

      const factoryAbi = ['function poolByPair(address, address) view returns (address)'];
      const factory = new ethers.Contract(
        contractsInfo.cypherProtocol.ALGEBRA_FACTORY,
        factoryAbi,
        provider
      );

      const poolAddress = await factory.poolByPair(
        contractsInfo.cypherProtocol.WETH,
        contractsInfo.contracts.camel.address
      );

      if (!poolAddress || poolAddress === ethers.constants.AddressZero) {
        this.setState({ sniperTaxPercent: 0 });
        return;
      }

      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        provider
      );

      // Simulate a buy (pool → dummy address) with a test amount
      const testAmount = ethers.utils.parseUnits('10000', 18);
      const dummyAddr = '0x0000000000000000000000000000000000000001';
      const [taxAmount] = await camel.getSniperTaxAmount(poolAddress, dummyAddr, testAmount);

      const taxBps = taxAmount.mul(10000).div(testAmount).toNumber();
      const taxPct = taxBps / 100;
      // Auto-set slippage to at least the sniper tax + 1% buffer
      const minSlippage = taxPct > 0 ? Math.ceil(taxPct + 1) : this.state.slippage;
      this.setState({
        sniperTaxPercent: taxPct,
        slippage: Math.max(this.state.slippage, minSlippage)
      });
    } catch (e) {
      console.warn('Failed to check sniper tax:', e);
      this.setState({ sniperTaxPercent: 0 });
    }
  }

  toggleDirection(e) {
    const btn = e.currentTarget;
    btn.classList.remove('spin');
    // Force reflow so re-adding the class restarts the animation
    void btn.offsetWidth;
    btn.classList.add('spin');
    btn.addEventListener('animationend', () => btn.classList.remove('spin'), { once: true });

    const { fromToken, toToken } = this.state;
    this.setState({
      fromToken: toToken,
      toToken: fromToken,
      fromAmount: '',
      toAmount: ''
    });
  }

  updateFromAmount(value) {
    this.setState({ fromAmount: value, toAmount: value ? '...' : '', quoting: !!value });
    if (!value || parseFloat(value) <= 0) {
      this.setState({ quoting: false });
      return;
    }
    this.quoteSwap(value);
  }

  setQuickFill(value) {
    const str = String(value);
    this.updateFromAmount(str);
  }

  async quoteSwap(value) {
    const { contractsInfo } = this.props;
    if (!contractsInfo?.cypherProtocol) return;

    try {
      const rpcUrl = contractsInfo.rpcUrl || 'http://127.0.0.1:8545';
      const rpcProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const swapRouterAddress = contractsInfo.cypherProtocol.SWAP_ROUTER;
      const swapRouterAbi = [
        'function exactInputSingle((address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) params) payable returns (uint256 amountOut)',
        'function exactInputSingleSupportingFeeOnTransferTokens((address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) params) payable returns (uint256 amountOut)',
        'function multicall(bytes[] calldata data) payable returns (bytes[] memory results)',
        'function refundNativeToken() payable'
      ];
      const router = new ethers.Contract(swapRouterAddress, swapRouterAbi, rpcProvider);
      const iface = router.interface;
      const deadline = Math.floor(Date.now() / 1000) + 1800;
      const dummyAddr = '0x0000000000000000000000000000000000000001';

      if (this.state.fromToken === 'ETH') {
        const amountIn = ethers.utils.parseEther(value);
        const quoteData = iface.encodeFunctionData('exactInputSingle', [{
          tokenIn: contractsInfo.cypherProtocol.WETH,
          tokenOut: contractsInfo.contracts.camel.address,
          deployer: ethers.constants.AddressZero,
          recipient: dummyAddr,
          deadline,
          amountIn,
          amountOutMinimum: 0,
          limitSqrtPrice: 0
        }]);
        const refundData = iface.encodeFunctionData('refundNativeToken');
        const result = await router.callStatic.multicall([quoteData, refundData], { value: amountIn, from: dummyAddr });
        const amountOut = ethers.BigNumber.from(ethers.utils.defaultAbiCoder.decode(['uint256'], result[0])[0]);
        // Account for sniper tax on the output estimate (router returns pool output before fee-on-transfer)
        const taxPct = this.state.sniperTaxPercent || 0;
        const afterTax = taxPct > 0
          ? amountOut.mul(Math.floor((100 - taxPct) * 100)).div(10000)
          : amountOut;
        const formatted = parseFloat(ethers.utils.formatUnits(afterTax, 18));
        if (this.state.fromAmount === value) {
          this.setState({ toAmount: formatted > 0 ? formatted.toFixed(2) : '0', quoting: false });
        }
      } else {
        // CAMEL→ETH: use the Quoter contract to simulate without actual token transfers.
        // callStatic on the router fails with STF because it tries a real transferFrom,
        // which reverts if the user hasn't approved or due to fee-on-transfer mechanics.
        const quoterAddress = contractsInfo.cypherProtocol.QUOTER;
        const quoterAbi = [
          'function quoteExactInputSingle(address tokenIn, address tokenOut, address deployer, uint256 amountIn, uint160 limitSqrtPrice) external returns (uint256 amountOut, uint16 fee)'
        ];
        const quoter = new ethers.Contract(quoterAddress, quoterAbi, rpcProvider);
        const amountIn = ethers.utils.parseUnits(value, 18);
        const result = await quoter.callStatic.quoteExactInputSingle(
          contractsInfo.contracts.camel.address,
          contractsInfo.cypherProtocol.WETH,
          ethers.constants.AddressZero,
          amountIn,
          0
        );
        const amountOut = result.amountOut;
        // Account for sniper tax on the output estimate
        const taxPct = this.state.sniperTaxPercent || 0;
        const afterTax = taxPct > 0
          ? amountOut.mul(Math.floor((100 - taxPct) * 100)).div(10000)
          : amountOut;
        const formatted = parseFloat(ethers.utils.formatEther(afterTax));
        if (this.state.fromAmount === value) {
          this.setState({ toAmount: formatted > 0 ? formatted.toFixed(6) : '0', quoting: false });
        }
      }
    } catch (e) {
      console.warn('[quote] failed:', e.reason || e.message);
      if (this.state.fromAmount === value) {
        this.setState({ toAmount: '–', quoting: false });
      }
    }
  }

  async handleSwap() {
    const { walletService, contractsInfo, onSuccess } = this.props;

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
      const userAddress = await signer.getAddress();

      const rpcUrl = contractsInfo.rpcUrl || 'http://127.0.0.1:8545';
      const rpcProvider = new ethers.providers.JsonRpcProvider(rpcUrl);

      const swapRouterAddress = contractsInfo.cypherProtocol.SWAP_ROUTER;
      const swapRouterAbi = [
        'function exactInputSingle((address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) params) payable returns (uint256 amountOut)',
        'function exactInputSingleSupportingFeeOnTransferTokens((address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice) params) payable returns (uint256 amountOut)',
        'function multicall(bytes[] calldata data) payable returns (bytes[] memory results)',
        'function refundNativeToken() payable'
      ];

      const swapRouter = new ethers.Contract(swapRouterAddress, swapRouterAbi, signer);
      const iface = swapRouter.interface;
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      // Calculate effective slippage (account for sniper tax)
      const slippagePct = this.state.slippage;
      const calcMinOut = (expectedOut) => {
        const factor = Math.max(0, 100 - slippagePct);
        return expectedOut.mul(Math.floor(factor * 100)).div(10000);
      };

      // Direct RPC router for quoting and simulation
      const rpcRouter = new ethers.Contract(swapRouterAddress, swapRouterAbi, rpcProvider);

      if (this.state.fromToken === 'ETH') {
        // Buy CAMEL with ETH — single tx via multicall.
        // Router wraps ETH → WETH internally via pay() callback.
        const amountIn = ethers.utils.parseEther(this.state.fromAmount);

        // Step 1: Quote — simulate with amountOutMinimum=0 to get actual pool output
        const quoteData = iface.encodeFunctionData('exactInputSingle', [{
          tokenIn: contractsInfo.cypherProtocol.WETH,
          tokenOut: contractsInfo.contracts.camel.address,
          deployer: ethers.constants.AddressZero,
          recipient: userAddress,
          deadline,
          amountIn,
          amountOutMinimum: 0,
          limitSqrtPrice: 0
        }]);
        const refundData = iface.encodeFunctionData('refundNativeToken');

        console.log('[swap] quoting via direct RPC...');
        let quotedOut;
        try {
          const quoteResult = await rpcRouter.callStatic.multicall([quoteData, refundData], { value: amountIn, from: userAddress });
          quotedOut = ethers.BigNumber.from(ethers.utils.defaultAbiCoder.decode(['uint256'], quoteResult[0])[0]);
          console.log('[swap] quoted output:', ethers.utils.formatUnits(quotedOut, 18), 'CAMEL');
        } catch (quoteErr) {
          console.error('[swap] quote failed:', quoteErr);
          throw new Error(quoteErr.reason || quoteErr.error?.message || quoteErr.message || 'Swap quote failed — pool may have insufficient liquidity');
        }

        // Step 2: Apply slippage to the real quoted output
        const minOut = calcMinOut(quotedOut);
        console.log('[swap] slippage:', slippagePct, '% → amountOutMinimum:', ethers.utils.formatUnits(minOut, 18), 'CAMEL');

        // Step 3: Encode final tx with real amountOutMinimum
        const swapData = iface.encodeFunctionData('exactInputSingle', [{
          tokenIn: contractsInfo.cypherProtocol.WETH,
          tokenOut: contractsInfo.contracts.camel.address,
          deployer: ethers.constants.AddressZero,
          recipient: userAddress,
          deadline,
          amountIn,
          amountOutMinimum: minOut,
          limitSqrtPrice: 0
        }]);

        console.log('[swap] sending tx to MetaMask...');
        const tx = await swapRouter.multicall([swapData, refundData], { value: amountIn, gasLimit: 500000 });
        console.log('[swap] tx hash:', tx.hash);
        const receipt = await tx.wait();
        console.log('[swap] confirmed in block:', receipt.blockNumber, '| status:', receipt.status);
      } else {
        // Sell CAMEL for WETH — approve once, then swap.
        // Uses fee-on-transfer variant since CAMEL may have sniper tax.
        const camel = new ethers.Contract(
          contractsInfo.contracts.camel.address,
          contractsInfo.contracts.camel.abi,
          signer
        );
        let amountIn = ethers.utils.parseUnits(this.state.fromAmount, 18);
        // Cap to actual on-chain balance to prevent parseFloat precision drift
        const actualBalance = await camel.balanceOf(userAddress);
        if (amountIn.gt(actualBalance)) {
          console.log('[swap] capping amountIn to actual balance (precision drift:', amountIn.sub(actualBalance).toString(), 'wei)');
          amountIn = actualBalance;
        }
        if (actualBalance.isZero()) {
          this.setState({ error: 'Insufficient CAMEL balance', swapping: false });
          if (onSuccess) onSuccess();
          return;
        }
        const allowance = await camel.allowance(userAddress, swapRouterAddress);
        if (allowance.lt(amountIn)) {
          console.log('[swap] approving...');
          const approveTx = await camel.approve(swapRouterAddress, ethers.constants.MaxUint256);
          await approveTx.wait();
        }

        // Quote the sell via Quoter (router callStatic fails with STF on fee-on-transfer tokens)
        console.log('[swap] quoting sell via Quoter...');
        let quotedOut;
        try {
          const quoterAddress = contractsInfo.cypherProtocol.QUOTER;
          const quoterAbi = [
            'function quoteExactInputSingle(address tokenIn, address tokenOut, address deployer, uint256 amountIn, uint160 limitSqrtPrice) external returns (uint256 amountOut, uint16 fee)'
          ];
          const quoter = new ethers.Contract(quoterAddress, quoterAbi, rpcProvider);
          const quoteResult = await quoter.callStatic.quoteExactInputSingle(
            contractsInfo.contracts.camel.address,
            contractsInfo.cypherProtocol.WETH,
            ethers.constants.AddressZero,
            amountIn,
            0
          );
          quotedOut = quoteResult.amountOut;
          console.log('[swap] quoted output:', ethers.utils.formatEther(quotedOut), 'ETH');
        } catch (quoteErr) {
          console.error('[swap] sell quote failed:', quoteErr);
          throw new Error(quoteErr.reason || quoteErr.error?.message || quoteErr.message || 'Sell quote failed');
        }

        // Quoter doesn't account for sniper tax — reduce expected output before applying slippage
        const taxPct = this.state.sniperTaxPercent || 0;
        const expectedOut = taxPct > 0
          ? quotedOut.mul(Math.floor((100 - taxPct) * 100)).div(10000)
          : quotedOut;
        const minOut = calcMinOut(expectedOut);
        console.log('[swap] tax:', taxPct, '% | expected:', ethers.utils.formatEther(expectedOut), 'ETH | slippage:', slippagePct, '% → min:', ethers.utils.formatEther(minOut), 'ETH');

        console.log('[swap] sending sell tx to MetaMask...');
        const tx = await swapRouter.exactInputSingleSupportingFeeOnTransferTokens({
          tokenIn: contractsInfo.contracts.camel.address,
          tokenOut: contractsInfo.cypherProtocol.WETH,
          deployer: ethers.constants.AddressZero,
          recipient: userAddress,
          deadline,
          amountIn,
          amountOutMinimum: minOut,
          limitSqrtPrice: 0
        }, { gasLimit: 500000 });
        console.log('[swap] tx hash:', tx.hash);
        const receipt = await tx.wait();
        console.log('[swap] confirmed in block:', receipt.blockNumber, '| status:', receipt.status);
      }

      this.setState({
        success: 'Swap successful!',
        swapping: false,
        fromAmount: '',
        toAmount: ''
      });

      this.fetchEthBalance();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Swap error:', error);
      this.setState({
        error: error.reason || error.message || 'Swap failed',
        swapping: false
      });
    }
  }

  // ========== COLLECTION METHODS ==========
  async loadNFTs() {
    const { walletService, contractsInfo } = this.props;

    if (!walletService?.isConnected() || !contractsInfo?.contracts?.camel) return;

    this.setState({ loadingNfts: true });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);

      // DN404: nftBalanceOf/getOwnedNFTs live on the main contract,
      // but tokenURI lives on the mirror ERC721 contract
      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        [
          'function nftBalanceOf(address) view returns (uint256)',
          'function getOwnedNFTs(address, uint256, uint256) view returns (uint256[])',
          'function mirrorERC721() view returns (address)',
        ],
        provider
      );

      const mirrorAddress = await camel.mirrorERC721();
      const mirror = new ethers.Contract(
        mirrorAddress,
        ['function tokenURI(uint256) view returns (string)'],
        provider
      );

      const userAddr = walletService.connectedAddress;
      const nftBalance = await camel.nftBalanceOf(userAddr);
      const count = Math.min(nftBalance.toNumber(), 20);
      const nfts = [];

      if (count > 0) {
        const tokenIds = await camel.getOwnedNFTs(userAddr, 0, count);
        for (const tokenId of tokenIds) {
          try {
            const meta = await this.fetchNftMetadata(mirror, tokenId);
            nfts.push({
              tokenId: tokenId.toString(),
              traits: meta.traits,
              image: meta.image,
              name: meta.name
            });
          } catch (e) {
            console.warn('[portfolio] Failed to fetch NFT', tokenId.toString(), e);
          }
        }
      }

      this.setState({ nfts, loadingNfts: false });
    } catch (error) {
      console.error('Failed to load NFTs:', error);
      this.setState({ loadingNfts: false });
    }
  }

  async fetchNftMetadata(contract, tokenId) {
    try {
      const tokenURI = await contract.tokenURI(tokenId);
      let metadata = null;

      if (tokenURI.startsWith('data:application/json;base64,')) {
        const json = atob(tokenURI.split(',')[1]);
        metadata = JSON.parse(json);
      } else if (tokenURI.startsWith('data:application/json,')) {
        const json = decodeURIComponent(tokenURI.split(',')[1]);
        metadata = JSON.parse(json);
      } else if (IpfsService.isIpfsUri(tokenURI) || tokenURI.startsWith('http')) {
        metadata = await IpfsService.fetchJsonWithIpfsSupport(tokenURI);
      }

      if (!metadata) return { traits: [], image: null };

      return {
        traits: metadata.attributes || [],
        image: metadata.image || null,
        name: metadata.name || null
      };
    } catch (e) {
      console.warn('[portfolio] Failed to fetch metadata for token', tokenId.toString(), e);
      return { traits: [], image: null };
    }
  }

  async loadPortfolioData() {
    const { walletService, contractsInfo } = this.props;
    if (!walletService?.isConnected() || !contractsInfo?.contracts?.camel) return;

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const userAddress = walletService.connectedAddress;

      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        provider
      );

      const [balance, nftBalance, skipNft] = await Promise.all([
        camel.balanceOf(userAddress),
        camel.nftBalanceOf(userAddress),
        camel.getSkipNFT(userAddress)
      ]);

      const unit = ethers.utils.parseUnits('1000000', 18);
      const maxNfts = balance.div(unit).toNumber();
      const currentNfts = nftBalance.toNumber();
      const mintableCount = Math.max(0, maxNfts - currentNfts);
      const skipNftGap = mintableCount;

      this.setState({ mintableCount, skipNftStatus: skipNft, skipNftGap, rawBalance: balance });
    } catch (e) {
      console.warn('[portfolio] Failed to load portfolio data:', e);
    }
  }

  async handleBalanceMint() {
    const { walletService, contractsInfo } = this.props;
    const { mintableCount } = this.state;

    if (!walletService?.isConnected() || mintableCount <= 0) return;

    this.setState({ minting: true, error: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();

      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        signer
      );

      const tx = await camel.balanceMint(mintableCount);
      await tx.wait();

      this.setState({
        minting: false,
        mintableCount: 0,
        success: `Minted ${mintableCount} new camel${mintableCount !== 1 ? 's' : ''}!`
      });

      this.loadNFTs();
      this.loadPortfolioData();
    } catch (error) {
      console.error('[portfolio] Balance mint error:', error);
      this.setState({
        minting: false,
        error: error.reason || error.message || 'Mint failed'
      });
    }
  }

  // ========== RENDER ==========
  renderTabs() {
    const { activeTab } = this.state;

    return h('div', { className: 'tabs' },
      h('button', {
        className: `tab ${activeTab === 'claim' ? 'tab-active' : ''}`,
        onClick: () => this.setTab('claim')
      }, 'Claim'),
      h('button', {
        className: `tab ${activeTab === 'trade' ? 'tab-active' : ''}`,
        onClick: () => this.setTab('trade')
      }, 'Trade'),
      h('button', {
        className: `tab ${activeTab === 'chart' ? 'tab-active' : ''}`,
        onClick: () => this.setTab('chart')
      }, 'Chart'),
      h('button', {
        className: `tab ${activeTab === 'portfolio' ? 'tab-active' : ''}`,
        onClick: () => this.setTab('portfolio')
      }, 'Portfolio'),
      h('button', {
        className: `tab ${activeTab === 'stake' ? 'tab-active' : ''}`,
        onClick: () => this.setTab('stake')
      }, 'Stake')
    );
  }

  renderClaimTab() {
    const { error, success, onWhitelist, hasClaimed, whitelistMinting, whitelistChecked, freeMintsRemaining } = this.state;
    const { walletService, contractsInfo } = this.props;
    const connected = walletService?.isConnected();
    const contractsDeployed = !!contractsInfo?.contracts?.camel;
    const mintsAvailable = freeMintsRemaining !== null && freeMintsRemaining > 0;

    return h('div', { className: 'tab-content' },
      h('p', { className: 'tab-description' }, 'Free mint for eligible community members'),

      // Address has code warning
      connected && contractsDeployed && this.state.addressHasCode && this.state.skipNftStatus !== false && this.renderCodeWarning('claim'),

      // Not connected
      !connected && h('div', { className: 'status-message status-warning' },
        'Connect your wallet to check eligibility'
      ),

      // Loading state
      connected && !whitelistChecked && h('div', { className: 'traits-loading' },
        h('span', { className: 'loading' }),
        h('span', null, 'Checking eligibility...')
      ),

      // No free mints left (only when contracts are deployed and we know the count)
      connected && whitelistChecked && contractsDeployed && !mintsAvailable && h('div', { className: 'status-message status-warning' },
        'All free mints have been claimed'
      ),

      // Not on whitelist
      connected && whitelistChecked && !onWhitelist && h('div', { className: 'claim-ineligible' },
        h('p', null, 'Your wallet is not on the whitelist. Free mints are reserved for sxCYPH stakers, Remilio holders, Milady holders, and CULT holders.')
      ),

      // On whitelist, already claimed (only possible when contracts deployed)
      connected && whitelistChecked && contractsDeployed && onWhitelist && hasClaimed && h('div', { className: 'whitelist-section' },
        h('div', { className: 'whitelist-badge claimed' }, 'Claimed'),
        h('p', { className: 'whitelist-info' }, 'You have already claimed your free mint'),
        h('div', { className: 'claim-communities-inline' },
          h('span', { className: 'claim-community' }, 'sxCYPH'),
          h('span', { className: 'claim-community' }, 'Remilio'),
          h('span', { className: 'claim-community' }, 'Milady'),
          h('span', { className: 'claim-community' }, 'CULT')
        )
      ),

      // On whitelist, eligible (pre-launch or can claim)
      connected && whitelistChecked && onWhitelist && !hasClaimed && h('div', { className: 'whitelist-section' },
        h('div', { className: 'whitelist-badge' }, 'Eligible'),
        h('p', { className: 'whitelist-info' }, 'You are eligible for a free CAMEL mint'),
        h('div', { className: 'claim-communities-inline' },
          h('span', { className: 'claim-community' }, 'sxCYPH'),
          h('span', { className: 'claim-community' }, 'Remilio'),
          h('span', { className: 'claim-community' }, 'Milady'),
          h('span', { className: 'claim-community' }, 'CULT')
        )
      ),

      // Free mints remaining (only when contracts deployed)
      whitelistChecked && contractsDeployed && freeMintsRemaining !== null && h('div', { className: 'mint-info' },
        h('div', { className: 'mint-available' }, freeMintsRemaining.toLocaleString()),
        h('div', { className: 'mint-label' }, 'Free mints remaining')
      ),

      // Pre-launch notice
      connected && whitelistChecked && !contractsDeployed && h('div', { className: 'status-message status-warning' },
        'Minting opens at launch'
      ),

      error && h('div', { className: 'status-message status-error' }, error),
      success && h('div', { className: 'status-message status-success' }, success),

      // Claim button — only shown when contracts deployed, eligible, and unclaimed
      connected && whitelistChecked && contractsDeployed && mintsAvailable && onWhitelist && !hasClaimed &&
        h('button', {
          className: 'btn btn-primary btn-block',
          disabled: whitelistMinting,
          onClick: this.bind(this.handleWhitelistMint)
        },
          whitelistMinting ? h('span', { className: 'loading' }) : 'Claim'
        )
    );
  }

  renderTradeTab() {
    const { contractsInfo } = this.props;
    if (!contractsInfo?.contracts?.camel) {
      return h('div', { className: 'tab-content' },
        h('div', { className: 'chart-placeholder' },
          h('div', { className: 'chart-placeholder-icon' }, '\uD83D\uDCB1'),
          h('p', null, 'Trading available after launch'),
          h('p', { className: 'chart-placeholder-hint' },
            'Gas-efficient swaps via Cypher DEX will be enabled once CAMEL is deployed'
          )
        )
      );
    }

    const { fromToken, toToken, fromAmount, toAmount, swapping, quoting, sniperTaxPercent,
            slippage, customSlippage, showSlippageSettings, ethBalance, error, success } = this.state;
    const { tokenBalance } = this.props;
    const effectiveSlippage = slippage;
    const slippageLow = sniperTaxPercent > 0 && effectiveSlippage < sniperTaxPercent;

    // Compute live rate from current quote
    const fromNum = parseFloat(fromAmount);
    const toNum = parseFloat(toAmount);
    const hasValidQuote = fromNum > 0 && toNum > 0 && !quoting;
    let rateDisplay = '–';
    if (hasValidQuote) {
      if (fromToken === 'ETH') {
        const rate = toNum / fromNum;
        rateDisplay = `1 ETH ≈ ${rate >= 1000 ? Math.round(rate).toLocaleString() : rate.toFixed(2)} CAMEL`;
      } else {
        const rate = fromNum / toNum;
        rateDisplay = `1 ETH ≈ ${rate >= 1000 ? Math.round(rate).toLocaleString() : rate.toFixed(2)} CAMEL`;
      }
    }

    // Minimum received after slippage
    let minReceived = null;
    if (hasValidQuote) {
      const min = toNum * (1 - effectiveSlippage / 100);
      const unit = toToken === 'ETH' ? 'ETH' : 'CAMEL';
      minReceived = `${min >= 1000 ? Math.round(min).toLocaleString() : min.toFixed(toToken === 'ETH' ? 6 : 2)} ${unit}`;
    }

    // Balance for current from-token
    const fromBalance = fromToken === 'ETH'
      ? (ethBalance != null ? `${parseFloat(ethBalance).toFixed(4)} ETH` : null)
      : `${parseFloat(tokenBalance || 0).toLocaleString()} CAMEL`;

    const camelBal = parseFloat(tokenBalance || 0);
    // Keep raw string for 100% fill to avoid floating point precision loss
    const camelBalRaw = tokenBalance || '0';

    return h('div', { className: 'tab-content' },
      // Header row with description + settings gear
      h('div', { className: 'swap-header' },
        h('p', { className: 'tab-description' }, 'Gas-efficient swaps via Cypher DEX'),
        h('button', {
          className: 'slippage-gear-btn',
          onClick: () => this.setState({ showSlippageSettings: !showSlippageSettings })
        },
          '⚙'
        )
      ),

      // Slippage settings panel
      showSlippageSettings && h('div', { className: 'slippage-panel' },
        h('div', { className: 'slippage-label' }, 'Slippage Tolerance'),
        h('div', { className: 'slippage-options' },
          [0.5, 1, 3, 5].map(pct =>
            h('button', {
              key: pct,
              className: `slippage-option ${slippage === pct && !customSlippage ? 'slippage-option-active' : ''}`,
              onClick: () => this.setState({ slippage: pct, customSlippage: '' })
            }, `${pct}%`)
          ),
          h('div', { className: 'slippage-custom' },
            h('input', {
              type: 'number',
              className: 'slippage-custom-input',
              placeholder: 'Custom',
              value: customSlippage,
              onChange: (e) => {
                const val = e.target.value;
                this.setState({
                  customSlippage: val,
                  slippage: val && parseFloat(val) > 0 ? parseFloat(val) : 1
                });
              }
            }),
            h('span', { className: 'slippage-custom-suffix' }, '%')
          )
        ),
        slippageLow && h('div', { className: 'slippage-warn' },
          `Slippage is below the sniper tax (${sniperTaxPercent.toFixed(1)}%). Transaction will likely revert.`
        )
      ),

      // Current slippage display
      h('div', { className: 'slippage-display' },
        `Slippage: ${effectiveSlippage}%`,
        slippageLow && h('span', { className: 'slippage-display-warn' }, ' (below tax)')
      ),

      // Sniper tax warning
      sniperTaxPercent > 0 && h('div', { className: 'sniper-tax-warning' },
        h('div', { className: 'sniper-tax-icon' }, '!'),
        h('div', { className: 'sniper-tax-body' },
          h('div', { className: 'sniper-tax-title' }, `Sniper tax active: ${sniperTaxPercent.toFixed(1)}%`),
          h('div', { className: 'sniper-tax-detail' },
            'Early trading protection is active. Tax decays linearly to 0% over the launch period.'
          )
        )
      ),

      h('div', { className: 'swap-container' },
        // === FROM field ===
        h('div', { className: 'form-group' },
          h('div', { className: 'form-label-row' },
            h('label', { className: 'form-label' }, `From (${fromToken})`),
            fromBalance && h('span', { className: 'form-balance' }, `Balance: ${fromBalance}`)
          ),
          h('input', {
            type: 'number',
            className: 'form-input',
            placeholder: '0.0',
            value: fromAmount,
            onChange: (e) => this.updateFromAmount(e.target.value)
          }),
          // Quickfill buttons
          h('div', { className: 'quickfill-row' },
            fromToken === 'ETH'
              ? [0.005, 0.01, 0.05, 0.1].map(amt =>
                  h('button', {
                    key: amt,
                    className: `quickfill-btn ${fromAmount === String(amt) ? 'quickfill-active' : ''}`,
                    onClick: () => this.setQuickFill(amt)
                  }, `${amt} ETH`)
                )
              : [25, 50, 75, 100].map(pct => {
                  // Use raw string for 100% to avoid parseFloat precision loss (6 wei drift)
                  const pctVal = pct === 100 ? camelBalRaw : (camelBal * pct / 100).toFixed(2);
                  return h('button', {
                    key: pct,
                    className: `quickfill-btn ${camelBal > 0 && fromAmount === String(pctVal) ? 'quickfill-active' : ''}`,
                    onClick: () => {
                      if (camelBal <= 0) return;
                      this.setQuickFill(pctVal);
                    },
                    disabled: camelBal <= 0
                  }, `${pct}%`);
                }
                )
          )
        ),

        h('div', { className: 'swap-direction' },
          h('button', {
            className: 'swap-direction-btn',
            onClick: (e) => this.toggleDirection(e)
          },
            '⇅'
          )
        ),

        // === TO field ===
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, `To (${toToken})`),
          h('div', { className: 'form-input-wrap' },
            h('input', {
              type: 'text',
              className: `form-input ${quoting ? 'form-input-quoting' : ''}`,
              placeholder: '0.0',
              value: quoting ? '' : toAmount,
              readOnly: true
            }),
            quoting && h('div', { className: 'quote-shimmer' })
          )
        ),

        // Rate + minimum received
        (hasValidQuote || quoting) && h('div', { className: 'swap-rate' },
          h('div', { className: 'swap-rate-row' },
            h('span', { className: 'swap-rate-label' }, 'Rate'),
            h('span', { className: 'swap-rate-value' }, quoting ? '...' : rateDisplay)
          ),
          minReceived && h('div', { className: 'swap-rate-row' },
            h('span', { className: 'swap-rate-label' }, 'Min. received'),
            h('span', { className: 'swap-rate-value' }, minReceived)
          )
        )
      ),

      error && h('div', { className: 'status-message status-error' }, error),
      success && h('div', { className: 'status-message status-success' }, success),

      h('button', {
        className: 'btn btn-primary btn-block',
        style: { marginTop: '1rem' },
        disabled: swapping || !fromAmount,
        onClick: this.bind(this.handleSwap)
      },
        swapping ? h('span', { className: 'loading' }) : `Swap ${fromToken} for ${toToken}`
      )
    );
  }

  renderChartTab() {
    const { contractsInfo } = this.props;
    const camelAddress = contractsInfo?.contracts?.camel?.address;

    // Chart iframe URL - update this once token is launched
    const chartUrl = camelAddress
      ? `https://dexscreener.com/ethereum/${camelAddress}?embed=1&theme=dark`
      : null;

    return h('div', { className: 'tab-content' },
      h('p', { className: 'tab-description' }, 'Live price action on Cypher DEX'),

      chartUrl
        ? h('div', { className: 'chart-container' },
            h('iframe', {
              src: chartUrl,
              className: 'chart-iframe',
              frameBorder: '0',
              allowFullScreen: true
            })
          )
        : h('div', { className: 'chart-placeholder' },
            h('div', { className: 'chart-placeholder-icon' }, '📈'),
            h('p', null, 'Chart available after launch'),
            h('p', { className: 'chart-placeholder-hint' },
              'Live price data will appear here once CAMEL is trading on Cypher DEX'
            )
          )
    );
  }

  renderCodeWarning(context) {
    const text = context === 'portfolio'
      ? 'Your address has code deployed (EIP-7702 delegation or similar). The CAMEL contract will treat your address as a contract, which will disable auto-minting. Use the balance mint above to mint your NFTs or disable this default in Advanced settings below.'
      : 'Your address has code deployed (EIP-7702 delegation or similar). The CAMEL contract will treat your address as a contract, which will disable auto-minting. Please use the balance mint in the Portfolio tab to mint your NFTs or disable this default in Advanced settings.';

    return h('div', { className: 'advanced-warning code-warning' },
      h('div', { className: 'sniper-tax-icon' }, '!'),
      h('div', null,
        h('div', { className: 'advanced-warning-title' }, 'Smart Account Detected'),
        h('div', { className: 'advanced-warning-text' }, text)
      )
    );
  }

  renderPortfolioHeader() {
    const { nfts, rerollMode, loadingNfts } = this.state;
    const hasNfts = !loadingNfts && nfts.length > 0;

    return h('div', { className: 'portfolio-header' },
      h('p', { className: 'tab-description' }, 'Manage your camels'),
      !rerollMode && h('div', { className: 'portfolio-header-actions' },
        hasNfts && h('button', {
          className: 'btn btn-secondary btn-sm',
          onClick: () => this.setState({ rerollMode: true, shieldedIds: new Set() })
        }, 'Reroll'),
        !loadingNfts && h('button', {
          className: 'btn btn-ghost btn-sm portfolio-refresh-btn',
          onClick: this.bind(this.loadNFTs)
        }, '\u21bb')
      )
    );
  }

  renderMintBanner() {
    const { mintableCount, minting, loadingNfts } = this.state;

    if (loadingNfts || mintableCount <= 0) return null;

    return h('div', { className: 'mint-banner' },
      h('span', { className: 'mint-banner-text' },
        `Your balance supports ${mintableCount} more NFT${mintableCount !== 1 ? 's' : ''}`
      ),
      h('button', {
        className: 'btn btn-primary btn-sm',
        disabled: minting,
        onClick: this.bind(this.handleBalanceMint)
      }, minting ? h('span', { className: 'loading' }) : 'Mint')
    );
  }

  renderEmptyPortfolio() {
    return h('div', { className: 'traits-empty' },
      h('div', { className: 'traits-empty-icon' }, '🐪'),
      h('p', { className: 'portfolio-empty-title' }, 'No Camels in your Cabal'),
      h('p', { className: 'traits-empty-hint' },
        'Every 1,000,000 CAMEL tokens you hold generates an NFT'
      ),
      h('button', {
        className: 'btn btn-primary',
        style: { marginTop: '0.75rem' },
        onClick: () => this.setTab('trade')
      }, 'Buy CAMEL')
    );
  }

  toggleShield(tokenId) {
    const shieldedIds = new Set(this.state.shieldedIds);
    if (shieldedIds.has(tokenId)) {
      shieldedIds.delete(tokenId);
    } else {
      shieldedIds.add(tokenId);
    }
    this.setState({ shieldedIds });
  }

  renderRerollBar() {
    const { nfts, shieldedIds, rerolling, rawBalance } = this.state;
    const rerollCount = nfts.length - shieldedIds.size;

    // Calculate if the fee will cause NFT loss
    let feeWarning = null;
    if (rawBalance && rerollCount > 0) {
      const unit = ethers.utils.parseUnits('1000000', 18);
      const fee = rawBalance.mul(1).div(10000); // 0.01%
      const postFeeBalance = rawBalance.sub(fee);
      const nftsAfterFee = postFeeBalance.div(unit).toNumber();
      const nftsBefore = nfts.length;
      if (nftsAfterFee < nftsBefore) {
        const lost = nftsBefore - nftsAfterFee;
        feeWarning = `The 0.01% fee will reduce your balance below the threshold for ${lost} of your camels. You will have ${nftsAfterFee} camel${nftsAfterFee !== 1 ? 's' : ''} after reroll instead of ${nftsBefore}.`;
      }
    }

    const hasShielded = shieldedIds.size > 0;

    return h('div', { className: 'reroll-bar' },
      h('p', { className: 'reroll-explain' },
        hasShielded
          ? 'Select the camels you want to protect. Everything else will be burned and re-minted with new traits.'
          : 'All camels will be burned and re-minted with new traits.'
      ),
      h('div', { className: 'reroll-bar-info' },
        h('span', null, `${rerollCount} camel${rerollCount !== 1 ? 's' : ''} will be rerolled`),
        hasShielded && rerollCount > 0 && h('span', { className: 'reroll-fee' }, '0.01% convenience fee')
      ),
      !hasShielded && rerollCount > 0 && h('div', { className: 'reroll-no-fee' }, 'No fee — rerolling all via self-transfer'),
      hasShielded && feeWarning && h('div', { className: 'advanced-warning' },
        h('div', { className: 'sniper-tax-icon' }, '!'),
        h('div', null,
          h('div', { className: 'advanced-warning-title' }, 'Balance Warning'),
          h('div', { className: 'advanced-warning-text' }, feeWarning)
        )
      ),
      h('div', { className: 'reroll-bar-btns' },
        h('button', {
          className: 'btn btn-ghost btn-sm',
          disabled: rerolling,
          onClick: () => this.setState({ rerollMode: false, shieldedIds: new Set() })
        }, 'Cancel'),
        h('button', {
          className: 'btn btn-primary btn-sm',
          disabled: rerolling || rerollCount === 0,
          onClick: this.bind(this.handleReroll)
        }, rerolling ? h('span', { className: 'loading' }) : 'Confirm Reroll')
      )
    );
  }

  async handleReroll() {
    const { walletService, contractsInfo } = this.props;
    const { shieldedIds } = this.state;

    if (!walletService?.isConnected()) return;

    this.setState({ rerolling: true, error: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();

      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        signer
      );

      const balance = await camel.balanceOf(userAddress);

      let tx;
      if (shieldedIds.size === 0) {
        // No shielded NFTs — self-transfer rerolls all, no fee
        tx = await camel.transfer(userAddress, balance);
      } else {
        // Shielded NFTs — use contract function for exemptions (0.01% fee)
        const exemptedIds = Array.from(shieldedIds).map(id => ethers.BigNumber.from(id));
        tx = await camel.rerollSelectedNFTs(balance, exemptedIds);
      }
      await tx.wait();

      this.setState({
        rerolling: false,
        rerollMode: false,
        shieldedIds: new Set(),
        success: 'Reroll complete! Your camels have new traits.'
      });

      this.loadNFTs();
      this.loadPortfolioData();
    } catch (error) {
      console.error('[portfolio] Reroll error:', error);
      this.setState({
        rerolling: false,
        error: error.reason || error.message || 'Reroll failed'
      });
    }
  }

  renderAdvancedSection() {
    const { advancedOpen, skipNftStatus, skipNftToggling, skipNftGap, skipNftConfirming, nfts, loadingNfts } = this.state;

    if (loadingNfts || nfts.length === 0) return null;

    // skipNFT=true means auto-minting is OFF (skip = don't mint)
    const autoMintOn = skipNftStatus === false;
    const autoMintLabel = autoMintOn ? 'ON' : 'OFF';

    return h('div', { className: 'advanced-section' },
      h('button', {
        className: 'advanced-toggle',
        onClick: () => this.setState({ advancedOpen: !advancedOpen })
      },
        h('span', null, 'Advanced'),
        h('span', { className: `advanced-chevron ${advancedOpen ? 'advanced-chevron-open' : ''}` }, '\u203a')
      ),

      advancedOpen && h('div', { className: 'advanced-body' },
        h('div', { className: 'advanced-row' },
          h('div', null,
            h('div', { className: 'advanced-label' }, `Auto-minting is ${autoMintLabel}`),
            h('div', { className: 'advanced-hint' },
              'Controls whether buying CAMEL automatically mints NFTs'
            )
          )
        ),

        // Warning about the gap
        !autoMintOn && skipNftGap > 0 && h('div', { className: 'advanced-warning' },
          h('div', { className: 'sniper-tax-icon' }, '!'),
          h('div', null,
            h('div', { className: 'advanced-warning-title' }, 'Caution'),
            h('div', { className: 'advanced-warning-text' },
              `You have ${skipNftGap} unminted NFT${skipNftGap !== 1 ? 's' : ''} worth of balance. Enabling auto-minting will attempt to mint all of them on your next token purchase, which could cost significant gas.`
            )
          )
        ),

        !skipNftConfirming
          ? h('button', {
              className: 'btn btn-secondary btn-sm',
              style: { marginTop: '0.75rem' },
              disabled: skipNftToggling || skipNftStatus === null,
              onClick: () => this.setState({ skipNftConfirming: true })
            }, autoMintOn ? 'Disable Auto-Minting' : 'Enable Auto-Minting')
          : h('div', { className: 'advanced-confirm' },
              h('p', { className: 'advanced-confirm-text' },
                autoMintOn
                  ? 'Disabling auto-minting means new token purchases will not mint NFTs.'
                  : skipNftGap > 0
                    ? `Enabling auto-minting will try to mint ${skipNftGap} NFTs on your next purchase. This may use significant gas. Are you sure?`
                    : 'Enabling auto-minting means future token purchases will automatically mint NFTs.'
              ),
              h('div', { className: 'reroll-bar-btns' },
                h('button', {
                  className: 'btn btn-ghost btn-sm',
                  disabled: skipNftToggling,
                  onClick: () => this.setState({ skipNftConfirming: false })
                }, 'Cancel'),
                h('button', {
                  className: 'btn btn-primary btn-sm',
                  disabled: skipNftToggling,
                  onClick: this.bind(this.handleToggleSkipNft)
                }, skipNftToggling ? h('span', { className: 'loading' }) : 'Confirm')
              )
            )
      )
    );
  }

  async handleToggleSkipNft() {
    const { walletService, contractsInfo } = this.props;
    const { skipNftStatus } = this.state;

    if (!walletService?.isConnected() || skipNftStatus === null) return;

    this.setState({ skipNftToggling: true, error: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();

      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        contractsInfo.contracts.camel.abi,
        signer
      );

      // setSkipNFT(true) = disable auto-minting, setSkipNFT(false) = enable auto-minting
      const newSkipValue = !skipNftStatus;
      const tx = await camel.setSkipNFT(newSkipValue);
      await tx.wait();

      this.setState({
        skipNftToggling: false,
        skipNftConfirming: false,
        skipNftStatus: newSkipValue,
        success: newSkipValue ? 'Auto-minting disabled' : 'Auto-minting enabled'
      });

      this.loadPortfolioData();
    } catch (error) {
      console.error('[portfolio] setSkipNFT error:', error);
      this.setState({
        skipNftToggling: false,
        error: error.reason || error.message || 'Failed to update setting'
      });
    }
  }

  renderFullscreenImage() {
    const { detailNft } = this.state;
    return h('div', {
      className: 'portfolio-fullscreen-overlay',
      onClick: () => this.setState({ fullscreenImage: false })
    },
      h('button', {
        className: 'portfolio-fullscreen-close',
        onClick: (e) => { e.stopPropagation(); this.setState({ fullscreenImage: false }); }
      }, '\u00d7'),
      h(IpfsImage, {
        src: detailNft.image,
        alt: `Camel #${detailNft.tokenId}`,
        placeholder: h('div', { className: 'nft-card-placeholder' }, h('span', { className: 'loading' }))
      })
    );
  }

  renderDetailModal() {
    const { detailNft, sendAddress, sendConfirming, sending } = this.state;

    return h('div', {
      className: 'portfolio-modal-overlay',
      onClick: (e) => {
        if (e.target.classList.contains('portfolio-modal-overlay')) {
          this.setState({ detailNft: null, fullscreenImage: false, sendAddress: '', sendConfirming: false });
        }
      }
    },
      h('div', { className: 'portfolio-modal' },
        // Close button
        h('button', {
          className: 'portfolio-modal-close',
          onClick: () => this.setState({ detailNft: null, fullscreenImage: false, sendAddress: '', sendConfirming: false })
        }, '\u00d7'),

        // Image (click to fullscreen)
        h('div', {
          className: 'portfolio-modal-image',
          onClick: () => { if (detailNft.image) this.setState({ fullscreenImage: true }); }
        },
          detailNft.image
            ? h(IpfsImage, {
                src: detailNft.image,
                alt: `Camel #${detailNft.tokenId}`,
                className: 'portfolio-modal-img',
                placeholder: h('div', { className: 'nft-card-placeholder' }, h('span', { className: 'loading' })),
                errorPlaceholder: h('div', { className: 'nft-card-placeholder' }, '\ud83d\udc2b')
              })
            : h('div', { className: 'nft-card-placeholder portfolio-modal-img' }, '\ud83d\udc2b')
        ),

        // Title
        h('h3', { className: 'portfolio-modal-title' },
          detailNft.name || `Camel #${detailNft.tokenId}`
        ),

        // Traits
        detailNft.traits.length > 0 && h('div', { className: 'traits-list' },
          detailNft.traits.map((trait, idx) =>
            h('div', { key: idx, className: 'trait-item' },
              h('div', { className: 'trait-type' }, trait.trait_type || 'Trait'),
              h('div', { className: 'trait-value' }, trait.value || 'Unknown')
            )
          )
        ),

        detailNft.traits.length === 0 && h('p', { className: 'traits-none' }, 'No traits available'),

        // Send section
        h('div', { className: 'portfolio-send-section' },
          h('label', { className: 'form-label' }, 'Send this Camel'),
          !sendConfirming
            ? h('div', { className: 'portfolio-send-row' },
                h('input', {
                  type: 'text',
                  className: 'form-input',
                  placeholder: '0x... recipient address',
                  value: sendAddress,
                  onChange: (e) => this.setState({ sendAddress: e.target.value })
                }),
                h('button', {
                  className: 'btn btn-primary btn-sm',
                  disabled: !sendAddress || !sendAddress.match(/^0x[a-fA-F0-9]{40}$/) || sending,
                  onClick: () => this.setState({ sendConfirming: true })
                }, 'Send')
              )
            : h('div', { className: 'portfolio-send-confirm' },
                h('p', { className: 'portfolio-send-confirm-text' },
                  `Send Camel #${detailNft.tokenId} to ${sendAddress.slice(0, 6)}...${sendAddress.slice(-4)}?`
                ),
                h('div', { className: 'portfolio-send-confirm-btns' },
                  h('button', {
                    className: 'btn btn-ghost btn-sm',
                    disabled: sending,
                    onClick: () => this.setState({ sendConfirming: false })
                  }, 'Cancel'),
                  h('button', {
                    className: 'btn btn-primary btn-sm',
                    disabled: sending,
                    onClick: this.bind(this.handleSendNft)
                  }, sending ? h('span', { className: 'loading' }) : 'Confirm Send')
                )
              )
        )
      )
    );
  }

  async handleSendNft() {
    const { walletService, contractsInfo } = this.props;
    const { detailNft, sendAddress } = this.state;

    if (!walletService?.isConnected() || !sendAddress) return;

    this.setState({ sending: true, error: null });

    try {
      const provider = new ethers.providers.Web3Provider(walletService.provider);
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();

      // DN404 NFT transfer goes through the mirror ERC721 contract
      const mirrorAbi = [
        'function transferFrom(address from, address to, uint256 tokenId) external',
      ];

      // Get mirror address from the main CAMEL contract
      const camel = new ethers.Contract(
        contractsInfo.contracts.camel.address,
        ['function mirrorERC721() view returns (address)'],
        provider
      );
      const mirrorAddress = await camel.mirrorERC721();

      const mirror = new ethers.Contract(mirrorAddress, mirrorAbi, signer);
      const tx = await mirror.transferFrom(userAddress, sendAddress, detailNft.tokenId);
      await tx.wait();

      this.setState({
        sending: false,
        sendConfirming: false,
        detailNft: null,
        fullscreenImage: false,
        sendAddress: '',
        success: `Camel #${detailNft.tokenId} sent!`
      });

      this.loadNFTs();
      this.loadPortfolioData();
    } catch (error) {
      console.error('[portfolio] Send NFT error:', error);
      this.setState({
        sending: false,
        error: error.reason || error.message || 'Failed to send NFT'
      });
    }
  }

  renderNftGrid() {
    const { nfts, rerollMode, shieldedIds } = this.state;

    return h('div', { className: 'nft-grid portfolio-grid' },
      nfts.map(nft =>
        h('div', {
          key: nft.tokenId,
          className: [
            'nft-card portfolio-card',
            rerollMode && shieldedIds.has(nft.tokenId) ? 'nft-card-shielded' : '',
            rerollMode ? 'nft-card-selectable' : ''
          ].filter(Boolean).join(' '),
          onClick: () => rerollMode
            ? this.toggleShield(nft.tokenId)
            : this.setState({ detailNft: nft, sendAddress: '', sendConfirming: false })
        },
          // Image
          nft.image
            ? h(IpfsImage, {
                src: nft.image,
                alt: `Camel #${nft.tokenId}`,
                className: 'nft-card-image',
                placeholder: h('div', { className: 'nft-card-placeholder' }, h('span', { className: 'loading' })),
                errorPlaceholder: h('div', { className: 'nft-card-placeholder' }, '🐫')
              })
            : h('div', { className: 'nft-card-placeholder' }, '🐫'),

          // ID label
          h('div', { className: 'nft-card-id' }, `#${nft.tokenId}`),

          // Shield indicator in reroll mode
          rerollMode && shieldedIds.has(nft.tokenId) && h('div', { className: 'nft-card-shield' }, '🛡')
        )
      )
    );
  }

  renderPortfolioTab() {
    const { walletService, contractsInfo } = this.props;
    if (!contractsInfo?.contracts?.camel) {
      return h('div', { className: 'tab-content' },
        h('div', { className: 'chart-placeholder' },
          h('div', { className: 'chart-placeholder-icon' }, '\uD83D\uDC2B'),
          h('p', null, 'Portfolio available after launch'),
          h('p', { className: 'chart-placeholder-hint' },
            'View and manage your CAMEL NFTs once the contract is deployed'
          )
        )
      );
    }

    const { nfts, loadingNfts, detailNft, rerollMode } = this.state;

    if (!walletService?.isConnected()) {
      return h('div', { className: 'tab-content' },
        h('p', { className: 'tab-description' }, 'Manage your camels'),
        h('div', { className: 'status-message status-warning' },
          'Connect wallet to view your portfolio'
        )
      );
    }

    return h('div', { className: 'tab-content portfolio-tab' },
      // Portfolio header
      this.renderPortfolioHeader(),

      // Address has code warning
      this.state.addressHasCode && this.state.skipNftStatus !== false && this.renderCodeWarning('portfolio'),

      // Mint banner (conditional)
      this.renderMintBanner(),

      // Loading
      loadingNfts && h('div', { className: 'traits-loading' },
        h('span', { className: 'loading' }),
        h('span', null, 'Loading...')
      ),

      // Empty state
      !loadingNfts && nfts.length === 0 && this.renderEmptyPortfolio(),

      // NFT Grid
      !loadingNfts && nfts.length > 0 && this.renderNftGrid(),

      // Reroll confirmation bar
      rerollMode && this.renderRerollBar(),

      // Advanced section
      !rerollMode && this.renderAdvancedSection(),

      // Detail modal (rendered on top)
      detailNft && this.renderDetailModal(),

      // Fullscreen image viewer (above modal)
      detailNft && this.state.fullscreenImage && detailNft.image && this.renderFullscreenImage(),

      // Error/success
      this.state.error && h('div', { className: 'status-message status-error' }, this.state.error),
      this.state.success && h('div', { className: 'status-message status-success' }, this.state.success)
    );
  }

  renderStakeTab() {
    const { liquidityLoading, liquidityData } = this.state;

    const formatCamel = (n) => n >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(2);
    const formatEth = (n) => n >= 10 ? n.toFixed(2) : n.toFixed(4);

    // Phase roadmap — Phase 1 is current default
    const phases = [
      { num: 1, title: 'Deepen Liquidity', desc: 'CAMEL trading fees compound into deeper positions' },
      { num: 2, title: 'Expand Positions', desc: 'Add higher-APR pools to accelerate the flywheel' },
      { num: 3, title: 'Enable Staking', desc: 'Positions large enough to distribute rewards to holders' },
      { num: 4, title: 'DAO Governance', desc: 'Community operates the liquidity manager directly' }
    ];
    const currentPhase = liquidityData?.stakingEnabled ? 3 : 1;

    return h('div', { className: 'tab-content' },
      // Staking status — first thing users see
      liquidityData && !liquidityData.stakingEnabled && h('div', { className: 'liq-staking-status' },
        h('span', { className: 'liq-staking-status-label' }, 'Staking Disabled'),
        h('span', { className: 'liq-staking-status-value' }, 'Phase 1 — Building Positions')
      ),
      liquidityData && liquidityData.stakingEnabled && h('div', { className: 'liq-staking-status liq-staking-live' },
        h('span', { className: 'liq-staking-status-label' }, 'Staking'),
        h('span', { className: 'liq-staking-status-value' }, 'Live')
      ),

      // Loading
      liquidityLoading && h('div', { className: 'traits-loading' },
        h('span', { className: 'loading' }),
        h('span', null, 'Loading positions...')
      ),

      // Position value — the big numbers
      liquidityData && h('div', { className: 'liq-position-value' },
        h('div', { className: 'liq-position-title' }, 'Protocol Liquidity'),
        h('div', { className: 'liq-position-amounts' },
          h('div', { className: 'liq-amount' },
            h('span', { className: 'liq-amount-num' }, formatCamel(liquidityData.totalCamel)),
            h('span', { className: 'liq-amount-token' }, 'CAMEL')
          ),
          h('div', { className: 'liq-amount-divider' }, '+'),
          h('div', { className: 'liq-amount' },
            h('span', { className: 'liq-amount-num' }, formatEth(liquidityData.totalWeth)),
            h('span', { className: 'liq-amount-token' }, 'ETH')
          )
        ),
        h('div', { className: 'liq-position-meta' },
          `${liquidityData.activePositions} active position${liquidityData.activePositions !== 1 ? 's' : ''} on Cypher DEX`
        )
      ),

      // Growth from launch
      liquidityData && liquidityData.growthPct > 0 && h('div', { className: 'liq-growth' },
        h('div', { className: 'liq-growth-bar-track' },
          h('div', {
            className: 'liq-growth-bar-fill',
            style: { width: `${Math.min(liquidityData.growthPct, 100)}%` }
          })
        ),
        h('div', { className: 'liq-growth-label' },
          h('span', null, 'Growth from launch'),
          h('span', { className: 'liq-growth-pct' }, `+${liquidityData.growthPct.toFixed(1)}%`)
        )
      ),

      // Investment Schedule
      liquidityData && liquidityData.allocations.length > 0 && h('div', { className: 'liq-schedule' },
        h('div', { className: 'liq-schedule-title' }, 'Fee Reinvestment'),
        h('div', { className: 'liq-allocations' },
          liquidityData.allocations.map((alloc, i) =>
            h('div', { key: i, className: 'liq-alloc-row' },
              h('div', { className: 'liq-alloc-header' },
                h('span', { className: 'liq-alloc-label' }, `Position #${alloc.positionId}`),
                h('span', { className: 'liq-alloc-pct' }, `${(alloc.bps / 100).toFixed(1)}%`)
              ),
              h('div', { className: 'liq-alloc-bar-track' },
                h('div', { className: 'liq-alloc-bar-fill', style: { width: `${alloc.bps / 100}%` } })
              )
            )
          )
        )
      ),

      // Phase roadmap
      h('div', { className: 'liq-roadmap' },
        h('div', { className: 'liq-roadmap-title' }, 'Roadmap'),
        h('div', { className: 'liq-phases' },
          phases.map(p =>
            h('div', {
              key: p.num,
              className: `liq-phase ${p.num === currentPhase ? 'liq-phase-active' : ''} ${p.num < currentPhase ? 'liq-phase-done' : ''}`
            },
              h('div', { className: 'liq-phase-num' }, p.num < currentPhase ? '\u2713' : String(p.num)),
              h('div', { className: 'liq-phase-body' },
                h('div', { className: 'liq-phase-title' }, p.title),
                h('div', { className: 'liq-phase-desc' }, p.desc)
              )
            )
          )
        )
      ),

      // Whitepaper + footer
      h('a', {
        className: 'btn btn-primary btn-block',
        href: '#whitepaper',
        style: { textDecoration: 'none' }
      }, 'Read Whitepaper'),

      h('div', { className: 'stake-footer' },
        h('p', null, 'No VCs. No private investors. All revenues to the community.')
      )
    );
  }

  render() {
    const { activeTab } = this.state;

    return h('div', { className: 'card tabbed-card animate-fade-in-up delay-3' },
      h('h2', { className: 'card-title' }, 'CAMEL'),

      this.renderTabs(),

      activeTab === 'claim' && this.renderClaimTab(),
      activeTab === 'trade' && this.renderTradeTab(),
      activeTab === 'chart' && this.renderChartTab(),
      activeTab === 'portfolio' && this.renderPortfolioTab(),
      activeTab === 'stake' && this.renderStakeTab()
    );
  }
}

export default TabbedCard;
