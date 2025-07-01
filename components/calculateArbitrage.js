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
const LOAN = 1; //Pool Tokens. In this example 1 ETH

const provider = new ethers.JsonRpcProvider(RPC.ARBITRUM);
const pools = [
  //new DexPriceFetcherV3(RPC.ETHEREUM, ETH_NETWORK_POOL.UNISWAP_WBTC, TOKEN_ETH.WBTC, TOKEN_ETH.USDC, 0.03),
  new DexPriceFetcherV3(RPC.ARBITRUM, ARB_NETWORK_POOL.SUSHISWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_SUSHISWAP),
  new DexPriceFetcherV3(RPC.ARBITRUM, ARB_NETWORK_POOL.UNISWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_UNISWAP),
];

const ShowDebug = true;

async function main() {
  try {
    // ==========================================================
    // ===============      UNISWAP V3 LOGIC       ==============
    // ==========================================================
    //TODO: Add algorithm for shufling and add labels for pools
    results = [];
    for (const pool of pools) {
      const prices = await pool.fetchV3PoolPrice();
      results.push(prices);
    }

    const [poolB, poolC] = results;
    const priceA = parseFloat(poolB.NormalizedPrice);
    const priceB = parseFloat(poolC.NormalizedPrice);
    const spread = Math.abs(priceA - priceB);
    const totalFees = (priceA * FEE_UNISWAP) + (priceB * FEE_SUSHISWAP);

    if (spread > totalFees) {
      const priceMovementB = await pools[0].simulateTradeLoop(LOAN, 0, ShowDebug);
      const priceMovementC = await pools[1].simulateTradeLoop(LOAN, 1, ShowDebug);

      const priceB = new BigNumber(priceMovementB.InitialPriceForFirstPool);
      const priceC = new BigNumber(priceMovementC.AverageBuyPriceForSecondPool);
      const priceDifference = priceB.minus(priceC);

      const totalFee = await calculateLoanFeeAndGasV3(LOAN, priceMovementB.InitialPriceForFirstPool)

      const totalOutUSDC = new BigNumber(priceMovementB.TotalGiveStableCoinsFromSellToken);
      const totalInUSDC = new BigNumber(priceMovementC.TotalPayStableCoinsForBuyToken);
      const amountDifference = totalOutUSDC.minus(totalInUSDC).minus(totalFee);

      const profitPercent = amountDifference.div(LOAN * priceMovementB.InitialPriceForFirstPool).times(100);
      const isArbitrageProfitable = profitPercent.gt(0);

      if (ShowDebug) {
        logger.warn("**************");
        logger.info("LoanETH: " + LOAN);
        logger.info("ProfitPercent: " + profitPercent.toFixed(2));
        logger.info("AmountDifference: " + amountDifference.toFixed(2));
      }

      return {
        PriceBeforeSwapPoolB: priceB.toFixed(6),
        PriceBeforeSwapPoolC: priceC.toFixed(6),
        PriceAfterSwapPoolB: priceMovementB.FinalPriceForFirstPool,
        PriceAfterSwapPoolC: priceMovementC.FinalPriceForSecondPool,
        AverageSellPrice: priceMovementB.AverageSellPriceForFirstPool,
        AverageBuyPrice: priceMovementC.AverageBuyPriceForSecondPool,
        PriceDifference: priceDifference.toFixed(6),
        FinalAmountProfit: amountDifference.toFixed(6),
        FinalPercentageProfit: profitPercent.toFixed(2),
        Loan: LOAN,
        ArbitrageProfitable: isArbitrageProfitable
      }
    }


    // ==========================================================
    // ===============      UNISWAP V2 LOGIC       ==============
    // ==========================================================
  } catch (err) {
    logger.error(`[ArbitrageMonitor]: Failed to fetch price from pool (${this.poolAddress}): ${err.message}`);
    return null;
  }
}

async function calculateLoanFeeAndGasV3(loanAmount, tokenPrice) {
  try {
    const gasPriceWei = await provider.send("eth_gasPrice", []);
    const gasPriceGwei = parseFloat(ethers.formatUnits(gasPriceWei, "gwei"));
    const gasLimit = 250000; // move to config
    const gasCostUSDC = new BigNumber(gasPriceGwei).times(gasLimit).times(tokenPrice).div(1e9);

    const flashLoanFeeRate = 0.0009; // move to config
    const flashLoanFeeETH = new BigNumber(loanAmount).times(flashLoanFeeRate);
    const flashLoanFeeUSDC = flashLoanFeeETH.times(tokenPrice);

    return gasCostUSDC.plus(flashLoanFeeUSDC);
  }
  catch (error) {
    logger.error(`[calculateLoanFeeandGas] Error: ${error.message}`);
    throw error;
  }
}

module.exports = { main };