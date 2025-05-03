const { DexPriceFetcherV3 } = require('./dexPriceFetcherV3.js');

const { TOKEN_ETH, TOKEN_ARB } = require('../config/tokens.js');
const { ETH_NETWORK_POOL, ARB_NETWORK_POOL } = require('../config/liquidityPool.js');

const { RPC } = require('../config/rpcNetworks.js');
const { ethers } = require("ethers");
const { logger } = require('../utils/log.js');

const pkg = require('bignumber.js');
const { BigNumber } = pkg;

const FEE_UNISWAP = 0.0001;
const FEE_SUSHISWAP = 0.0005;
const LOAN = 10; //Pool Tokens. In this example 10 ETH

const provider = new ethers.JsonRpcProvider(RPC.ARBITRUM);
const pools = [
  //new DexPriceFetcherV3(RPC.ETHEREUM, ETH_NETWORK_POOL.UNISWAP_WBTC, TOKEN_ETH.WBTC, TOKEN_ETH.USDC, 0.03),
  new DexPriceFetcherV3(RPC.ARBITRUM, ARB_NETWORK_POOL.SUSHISWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_SUSHISWAP),
  new DexPriceFetcherV3(RPC.ARBITRUM, ARB_NETWORK_POOL.UNISWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_UNISWAP),
];

async function main(bCheckPriceImpact) {
  try {
    results = [];
    for (const pool of pools) {
      const prices = await pool.fetchV3PoolPrice();
      results.push(prices);

      //printPoolState('Uniswap V3 pool', prices);
    }

    const [poolA, poolB] = results;
    const priceA = parseFloat(poolA.NormalizedPrice);
    const priceB = parseFloat(poolB.NormalizedPrice);

    const gasPriceWei = await provider.send("eth_gasPrice", []);
    const gasPriceGwei = parseFloat(ethers.formatUnits(gasPriceWei, "gwei"));
    const gasLimit = 250000;
    const TokenPrice = poolA.NormalizedPrice;
    const gasCostUSDC = (gasPriceGwei * gasLimit * TokenPrice) / 1e9;

    const spread = Math.abs(priceA - priceB);
    const totalFees = (priceA * FEE_UNISWAP) + (priceB * FEE_SUSHISWAP);

    if (spread > totalFees) {
      if (bCheckPriceImpact) {
        const amountInBNA = new BigNumber(LOAN);
        const priceAfterSwapA = await pools[0].simulatePriceImpact(poolA.tokenBalance0, poolA.tokenBalance1, amountInBNA, FEE_UNISWAP);
        const priceImpactA = await pools[0].calculatePriceImpact(poolA.currentPrice, priceAfterSwapA);
        logger.info(priceImpactA);

        const amountInBNB = new BigNumber(LOAN);
        const priceAfterSwapB = await pools[1].simulatePriceImpact(poolB.tokenBalance0, poolA.tokenBalance1, amountInBNB, FEE_SUSHISWAP);
        const priceImpactB = await pools[1].calculatePriceImpact(poolB.currentPrice, priceAfterSwapB);
        logger.info(priceImpactB);
      }

      const feeA = 1 - FEE_UNISWAP;
      const feeB = 1 - FEE_SUSHISWAP;

      const A = new BigNumber(LOAN);
      const G = new BigNumber(gasCostUSDC);

      const x1 = new BigNumber(poolA.tokenBalance0); // WETH
      const y1 = new BigNumber(poolA.tokenBalance1); // USDC

      const x2 = new BigNumber(poolB.tokenBalance0); // USDC
      const y2 = new BigNumber(poolB.tokenBalance1); // WETH

      const dyNumerator = y1.times(A.times(feeA));
      const dyDenominator = x1.plus(A.times(feeA));
      const dy = dyNumerator.div(dyDenominator);

      const dyAfterFee = dy.times(feeB);
      const dxBackNumerator = x2.times(dyAfterFee);
      const dxBackDenominator = y2.plus(dyAfterFee);
      const dxBack = dxBackNumerator.div(dxBackDenominator);

      const ethDelta = dxBack.minus(A);
      const profitUSDC = ethDelta.times(priceB).minus(G);

      const isArbitrageProfitable = profitUSDC.gt(0);

      return {
        SqrtPriceA: priceA,
        SqrtPriceB: priceB,
        PoolsSpread: spread,
        TotalPoolsFee: totalFees,
        CurrentGasPrice: gasCostUSDC,
        ArbitrageProfit: profitUSDC,
        IsArbitrageProfitable: isArbitrageProfitable
      };
    }
  } catch (err) {
    logger.error(`[ArbitrageMonitor]: Failed to fetch price from pool (${this.poolAddress}): ${err.message}`);
    return null;
  }
}

module.exports = { main };