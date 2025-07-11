import fs from 'fs';
import { DexPriceFetcherV3 } from './dexPriceFetcherV3.js';
import { DexPriceFetcherV2 } from './dexPriceFetcherV2.js';
import { initArbEngineCore } from './initArbEngineCore.js';

import { TOKEN_ETH, TOKEN_ARB } from '../config/tokens.js';
import { ETH_NETWORK_POOL, ARB_NETWORK_POOL } from '../config/liquidityPool.js';

import { RPC } from '../config/rpcNetworks.js';
import { ethers } from "ethers";
import { logger } from '../utils/log.js';

import BigNumber from 'bignumber.js';

import * as wasm from '../perf_meter/pkg/perf_meter.js';
const perf = new wasm.PerfMeter();
const writeFileDestination = '../perf-viewer/src/perf_metrics.json'

const ShowDebug = true; // move to config

// ===============      UNISWAP V3 Pools       ==============
const FEE_UNISWAP_V3 = 0.0001; // move to config
const FEE_SUSHISWAP_V3 = 0.0005; // move to config
const LOAN_V3 = 1;

// Read from file
const poolsV3 = [
  new DexPriceFetcherV3(RPC.ARBITRUM, ARB_NETWORK_POOL.PANCAKESWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, FEE_UNISWAP_V3),
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
    // =================================================================
    // ===============      UNISWAP V3 Start Engine       ==============
    // =================================================================

    const profitablePaths = await initArbEngineCore(poolsV3, LOAN_V3);
    

    /*
    let resultsV3 = [];

    perf.start("fetchV3PoolPriceFor2Pools");
    for (const pool of poolsV3) {
      const prices = await pool.fetchV3PoolPrice();
      resultsV3.push(prices);
    }
    perf.stop("fetchV3PoolPriceFor2Pools");

    const [poolB, poolC] = resultsV3;
    const priceA = parseFloat(poolB.NormalizedPrice);
    const priceB = parseFloat(poolC.NormalizedPrice);
    const spread = Math.abs(priceA - priceB);
    const totalFees = (priceA * FEE_UNISWAP_V3) + (priceB * FEE_SUSHISWAP_V3);

    if (spread > totalFees) {
      perf.start("simulateTradeLoopFor1Pool");
      const priceMovementB = await poolsV3[0].simulateTradeLoop(LOAN_V3, 0, ShowDebug);

      const initial = Number(priceMovementB.InitialPriceForFirstPool);
      const final = Number(priceMovementB.FinalPriceForFirstPool);
      const steps = 10;

      const sellPriceCurve = [];

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const price = final + (initial - final) / (1 + 10 * t);
        sellPriceCurve.push(price);
      }

      perf.add_curve("simulateTradeLoopFor1Pool", sellPriceCurve);
      perf.stop("simulateTradeLoopFor1Pool");

      perf.start("simulateTradeLoopFor2Pool");
      const priceMovementC = await poolsV3[1].simulateTradeLoop(LOAN_V3, 1, ShowDebug);

      const initialBuy = Number(priceMovementB.InitialPriceForFirstPool);
      const finalBuy = Number(priceMovementB.FinalPriceForFirstPool);
      const stepsBuy = 10;

      const buyPriceCurve = [];

      for (let i = 0; i <= stepsBuy; i++) {
        const t = i / stepsBuy;
        const price = initialBuy + (finalBuy - initialBuy) / (1 + 10 * (1 - t));
        buyPriceCurve.push(price);
      }

      perf.add_curve("simulateTradeLoopFor2Pool", buyPriceCurve);
      perf.stop("simulateTradeLoopFor2Pool");

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
      */
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

    let resultsV2 = [];

    perf.start("fetchV2PoolPriceFor2Pools");
    for (const pool of poolsV2) {
      const prices = await pool.fetchV2PoolPrice();
      resultsV2.push(prices);
    }
    perf.stop("fetchV2PoolPriceFor2Pools");

    const [poolBV2, poolCV2] = resultsV2;
    const reserveB0 = BigInt(Math.floor(Number(poolBV2.TokenBalance0) * 10 ** poolBV2.TokenDecimals0));
    const reserveB1 = BigInt(Math.floor(Number(poolBV2.TokenBalance1) * 10 ** poolCV2.TokenDecimals1));

    const reserveC0 = BigInt(Math.floor(Number(poolCV2.TokenBalance0) * 10 ** poolBV2.TokenDecimals0));
    const reserveC1 = BigInt(Math.floor(Number(poolCV2.TokenBalance1) * 10 ** poolCV2.TokenDecimals1));

    perf.start("SimulatePriceAfterSwapFor1Pools");
    const poolBV2Result = poolsV2[0].simulatePriceAfterSwap(reserveB0, reserveB1, LOAN_V2, poolBV2.TokenDecimals0, poolBV2.TokenDecimals1, false, ShowDebug);
    perf.stop("SimulatePriceAfterSwapFor1Pools");

    perf.start("SimulatePriceAfterSwapFor2Pools");
    const poolCV2Result = poolsV2[1].simulatePriceAfterSwap(reserveC1, reserveC0, 2400, poolCV2.TokenDecimals1, poolCV2.TokenDecimals0, true, ShowDebug);
    perf.stop("SimulatePriceAfterSwapFor2Pools");

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

    const perf_json = perf.export_json();
    const str = JSON.stringify(perf_json);
    fs.writeFileSync(writeFileDestination, str);

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

export { mainV3, mainV2 };