const { DexPriceFetcherV3 } = require('./dexPriceFetcherV3.js');
const { DexPriceFetcherV2 } = require('./dexPriceFetcherV2.js');

const { TOKEN_ETH, TOKEN_ARB } = require('../config/tokens.js');
const { ETH_NETWORK_POOL, ARB_NETWORK_POOL } = require('../config/liquidityPool.js');

const { RPC } = require('../config/rpcNetworks.js');
const { ethers } = require("ethers");
const { logger } = require('../utils/log.js');

const pkg = require('bignumber.js');
const { BigNumber } = pkg;

const ShowDebug = true; // move to config

// ===============      UNISWAP V3 Pools       ==============
const FEE_UNISWAP_V3 = 0.0001; // move to config
const FEE_SUSHISWAP_V3 = 0.0005; // move to config
const LOAN_V3 = 1;

const poolsV3 = [
  //new DexPriceFetcherV3(RPC.ETHEREUM, ETH_NETWORK_POOL.UNISWAP_WBTC, TOKEN_ETH.WBTC, TOKEN_ETH.USDC, 0.03),
  new DexPriceFetcherV3(RPC.ARBITRUM, ARB_NETWORK_POOL.UNISWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_UNISWAP_V3),
  new DexPriceFetcherV3(RPC.ARBITRUM, ARB_NETWORK_POOL.SUSHISWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_SUSHISWAP_V3),
];

// ===============      UNISWAP V2 Pools       ==============
const FEE_UNISWAP_V2 = 0.0001; // move to config
const FEE_SUSHISWAP_V2 = 0.0005; // move to config
const LOAN_V2 = 1;

const poolsV2 = [
  new DexPriceFetcherV2(RPC.ARBITRUM, ARB_NETWORK_POOL.UNISWAP_ETH_V2, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_UNISWAP_V2),
  new DexPriceFetcherV2(RPC.ARBITRUM, ARB_NETWORK_POOL.SUSHISWAP_ETH_V2, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_SUSHISWAP_V2),
];

async function mainV3() {
  try {
    // ==========================================================
    // ===============      UNISWAP V3 LOGIC       ==============
    // ==========================================================

    //TODO: Add algorithm for shufling and add labels for pools
    resultsV3 = [];
    for (const pool of poolsV3) {
      const prices = await pool.fetchV3PoolPrice();
      resultsV3.push(prices);
    }

    const [poolB, poolC] = resultsV3;
    const priceA = parseFloat(poolB.NormalizedPrice);
    const priceB = parseFloat(poolC.NormalizedPrice);
    const spread = Math.abs(priceA - priceB);
    const totalFees = (priceA * FEE_UNISWAP_V3) + (priceB * FEE_SUSHISWAP_V3);

    if (spread > totalFees) {
      const priceMovementB = await poolsV3[0].simulateTradeLoop(LOAN_V3, 0, ShowDebug);
      const priceMovementC = await poolsV3[1].simulateTradeLoop(LOAN_V3, 1, ShowDebug);

      const priceB = new BigNumber(priceMovementB.AverageSellPriceForFirstPool);
      const priceC = new BigNumber(priceMovementC.AverageBuyPriceForSecondPool);
      const priceDifference = priceB.minus(priceC);

      const loanFeeV3 = await calculateLoanFeeV3(LOAN_V3, priceMovementB.InitialPriceForFirstPool)
      const gasPrice = await calculateGasPrice(priceMovementB.InitialPriceForFirstPool)

      const totalOutUSDC = new BigNumber(priceMovementB.TotalGiveStableCoinsFromSellToken);
      const totalInUSDC = new BigNumber(priceMovementC.TotalPayStableCoinsForBuyToken);
      const amountDifference = totalOutUSDC.minus(totalInUSDC).minus(loanFeeV3).minus(gasPrice);

      const profitPercent = amountDifference.div(LOAN_V3 * priceMovementB.InitialPriceForFirstPool).times(100);
      const isArbitrageProfitable = profitPercent.gt(0);

      if (ShowDebug) {
        logger.warn("*******V3*******");
        logger.info("LoanETH: " + LOAN_V3);
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
        Loan: LOAN_V3,
        ArbitrageProfitable: isArbitrageProfitable
      }
    }
  } catch (err) {
    logger.error(`[ArbitrageMonitor]: Failed to fetch price from pool (${this.poolAddress}): ${err.message}`);
    return null;
  }
}

async function mainV2() {
  try {
    // ==========================================================
    // ===============      UNISWAP V2 LOGIC       ==============
    // ==========================================================

    resultsV2 = [];
    for (const pool of poolsV2) {
      const prices = await pool.fetchV2PoolPrice();
      resultsV2.push(prices);
    }

    const [poolBV2, poolCV2] = resultsV2;
    const reserveB0 = BigInt(Math.floor(Number(poolBV2.TokenBalance0) * 10 ** poolBV2.TokenDecimals0));
    const reserveB1 = BigInt(Math.floor(Number(poolBV2.TokenBalance1) * 10 ** poolCV2.TokenDecimals1));

    const reserveC0 = BigInt(Math.floor(Number(poolCV2.TokenBalance0) * 10 ** poolBV2.TokenDecimals0));
    const reserveC1 = BigInt(Math.floor(Number(poolCV2.TokenBalance1) * 10 ** poolCV2.TokenDecimals1));

    const poolBV2Result = poolsV2[0].simulatePriceAfterSwap(reserveB0, reserveB1, LOAN_V2, poolBV2.TokenDecimals0, poolBV2.TokenDecimals1, false, ShowDebug);
    const poolCV2Result = poolsV2[1].simulatePriceAfterSwap(reserveC1, reserveC0, 2400, poolCV2.TokenDecimals1, poolCV2.TokenDecimals0, true, ShowDebug);

    const currentEthPrice = await poolsV2[0].getCurrentEthPrice(ARB_NETWORK_POOL.UNISWAP_ETH_V3);
    const gasPrice = await calculateGasPrice(currentEthPrice.CurrentPrice);

    const sellOut = poolBV2Result;
    const buyIn = poolCV2Result;

    const totalFeePercent = (FEE_UNISWAP_V2 + FEE_SUSHISWAP_V2) * 100;
    const amountDifference = sellOut.AveragePrice - buyIn.AveragePrice;
    const profit = amountDifference - gasPrice - totalFeePercent;

    if (ShowDebug) {
      logger.warn("*******V2*******");
      logger.info("LoanETH: " + LOAN_V2);
      logger.info("Profit: " + profit.toFixed(2));
      logger.info("AmountDifference: " + amountDifference.toFixed(2));
    }

     const isArbitrageProfitable = profit > 0;

     return {
        SellOutPriceBefore: sellOut.priceBefore,
        SellOutPriceAfter: sellOut.priceAfter,
        SellOutAveragePrice: sellOut.AveragePrice,

        BuyInPriceBefore: buyIn.priceBefore,
        BuyInPriceAfter: buyIn.priceAfter,
        BuyInAveragePrice: buyIn.AveragePrice,

        PriceDifference: amountDifference.toFixed(6),
        FinalAmountProfit: profit.toFixed(6),
        Loan: LOAN_V2,
        ArbitrageProfitable: isArbitrageProfitable
      }
  } catch (err) {
    logger.error(`[ArbitrageMonitor]: Failed to fetch price from pool (${this.poolAddress}): ${err.message}`);
    return null;
  }
}

async function calculateGasPrice(tokenPrice) {
  try {
    const provider = new ethers.JsonRpcProvider(RPC.ARBITRUM);
    const gasPriceWei = await provider.send("eth_gasPrice", []);
    const gasPriceGwei = parseFloat(ethers.formatUnits(gasPriceWei, "gwei"));
    const gasLimit = 250000; // move to config
    const gasCostUSDC = new BigNumber(gasPriceGwei).times(gasLimit).times(tokenPrice).div(1e9);

    return gasCostUSDC;
  }
  catch (error) {
    logger.error(`[calculateLoanFeeandGas] Error: ${error.message}`);
    throw error;
  }
}

async function calculateLoanFeeV3(loanAmount, tokenPrice) {
  try {
    const flashLoanFeeRate = 0.0009; // move to config
    const flashLoanFeeETH = new BigNumber(loanAmount).times(flashLoanFeeRate);
    const flashLoanFeeUSDC = flashLoanFeeETH.times(tokenPrice);

    return flashLoanFeeUSDC;
  }
  catch (error) {
    logger.error(`[calculateLoanFeeandGas] Error: ${error.message}`);
    throw error;
  }
}

module.exports = { mainV3, mainV2 };