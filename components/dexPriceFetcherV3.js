const { Web3 } = require('web3');
const { DexPriceFetcherBase } = require('./dexPriceFetcherBase.js');
const { ethers } = require('ethers');

const { ERC20_ABI } = require('../config/erc20ABI.js');
const { UNISWAP_V3_POOL_ABI } = require('../config/uniswapV3PoolABI.js');
const { Pool, Trade, Route, SwapQuoter, SwapRouter, TickMath, TickDataProvider } = require('@uniswap/v3-sdk');
const { Token, CurrencyAmount, TradeType } = require('@uniswap/sdk-core');
const JSBI = require('jsbi');

const pkg = require('bignumber.js');
const { BigNumber } = pkg;
const BN = require('bignumber.js');

const { logger } = require('../utils/log.js');
const { performance } = require('perf_hooks');

const { TickListDataProvider } = require('@uniswap/v3-sdk');
const { Contract } = require('ethers');
const IUniswapV3PoolABI = require('@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json');

/**
 * DexPriceFetcherV3
 * Fetches prices from Uniswap V3 style pools.
 */
class DexPriceFetcherV3 extends DexPriceFetcherBase {
  constructor(rpcUrl, poolAddress, token0, token1, fee) {
    super(),
    this.rpcUrl = rpcUrl;
    this.poolAddress = poolAddress;
    this.token0 = token0;
    this.token1 = token1;
    this.fee = fee || 0.003;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.web3 = new Web3(rpcUrl);
  }

  async fetchV3PoolPrice(amountIn = null, bShowDebug = false) {
    try {
      const token0Contract = new this.web3.eth.Contract(ERC20_ABI, this.token0);
      const token1Contract = new this.web3.eth.Contract(ERC20_ABI, this.token1);

      const [balance0Raw, balance1Raw] = await Promise.all([
        token0Contract.methods.balanceOf(this.poolAddress).call(),
        token1Contract.methods.balanceOf(this.poolAddress).call()
      ]);

      const decimalsToken0 = await super.getTokenDecimals(this.token0, this.web3);
      const decimalsToken1 = await super.getTokenDecimals(this.token1, this.web3);

      const balance0 = new BigNumber(balance0Raw).div(new BigNumber(10).pow(decimalsToken0));
      const balance1 = new BigNumber(balance1Raw).div(new BigNumber(10).pow(decimalsToken1));
      const rawPrice = balance1.div(balance0).toFixed(18);

      let priceAfterSwap = null;
      let priceImpact = null;

      if (amountIn) {
        const amountInBN = new BigNumber(amountIn);
        priceAfterSwap = await this.simulatePriceImpact(balance0, balance1, amountInBN, this.fee || 0.003);
        priceImpact = await this.calculatePriceImpact(rawPrice, priceAfterSwap);
      }

      const normalizedPrice = await super.getPriceSqrt(this.poolAddress, this.provider, this.web3, this.token0, this.token1, bShowDebug);

      return {
        tokenBalance0: balance0,
        tokenBalance1: balance1,
        currentPrice: rawPrice,
        NormalizedPrice: normalizedPrice,
        PriceImpact: priceImpact
      };
    } catch (err) {
      logger.error(`[DexPriceFetcherV3]: Failed to fetch price from pool (${this.poolAddress}): ${err.message}`);
      return null;
    }
  }

  async simulatePriceImpact(balance0, balance1, amountInToken0, fee) {
    const newBalance0 = balance0.plus(amountInToken0.times(1 - fee));

    // Constant product: x * y = k => new y = k / new x
    const k = balance0.times(balance1);
    const newBalance1 = k.div(newBalance0);

    const priceAfter = newBalance1.div(newBalance0).toFixed(18);
    return priceAfter;
  }

  async simulateTradeLoop(TokenLoan, poolLabel, bShowDebug = false) {
    try {
      const state = await this.getPoolState();

      const decimals0 = await super.getTokenDecimals(this.token0, this.web3);
      const decimals1 = await super.getTokenDecimals(this.token1, this.web3);

      const sqrtPriceX96 = JSBI.BigInt(state.sqrtPriceX96.toString());
      const liquidity = JSBI.BigInt(state.liquidity.toString());
      const tick = Number(state.tick);

      if (JSBI.equal(liquidity, JSBI.BigInt(0))) {
        throw new Error('Pool has no liquidity');
      }
      if (JSBI.lessThanOrEqual(sqrtPriceX96, JSBI.BigInt(0))) {
        throw new Error('Invalid sqrtPriceX96');
      }
      if (!Number.isInteger(tick)) {
        throw new Error('Invalid tick');
      }

      /**
       * Simulation Strategy:
       * Take loan from pool A;
       * Swap Eth to stablecoin in pool B;
       *  - Calculate (initial price, final price, and average sell price by curve ) in this pool
       * Swap Stablecoin to Eth in pool C;
       *  - Calculate (initial price, final price, and average buy price by curve ) in this pool
       * Return loan and get profit
       */

      if (poolLabel === 0) {
        const simulateSwapPoolB = await this.simulateCurvePriceMovement(sqrtPriceX96, liquidity, TokenLoan, decimals0, decimals1, false, bShowDebug);
        const poolBInitialPrice = simulateSwapPoolB.initialPrice;
        const poolBFinalPrice = simulateSwapPoolB.priceAfter;
        const poolBAverageSelEthPrice = simulateSwapPoolB.averageSellCurvePrice;
        const totalUsdcAmountFromSellTokenB = simulateSwapPoolB.USDCAmountToTrade;
        const priceImpactPoolB = this.calculatePriceImpact(poolBInitialPrice, poolBFinalPrice);

        return {
          InitialPriceForFirstPool: poolBInitialPrice.toString(),
          FinalPriceForFirstPool: poolBFinalPrice.toString(),
          AverageSellPriceForFirstPool: poolBAverageSelEthPrice.toString(),
          TotalGiveStableCoinsFromSellToken: totalUsdcAmountFromSellTokenB.toString(),
          PriceImpactA: priceImpactPoolB.toString(),
        };
      } if (poolLabel === 1) {
        const simulateSwapPoolC = await this.simulateCurvePriceMovement(sqrtPriceX96, liquidity, TokenLoan, decimals0, decimals1, true, bShowDebug);
        const poolCInitialPrice = simulateSwapPoolC.initialPrice;
        const poolCFinalPrice = simulateSwapPoolC.priceAfter;
        const poolCAverageBuyEthPrice = simulateSwapPoolC.averageSellCurvePrice;
        const totalUsdcAmountForBuyTokenC = simulateSwapPoolC.USDCAmountToTrade;
        const priceImpactPoolC = this.calculatePriceImpact(poolCInitialPrice, poolCFinalPrice);

        return {
          InitialPriceForSecondPool: poolCInitialPrice.toString(),
          FinalPriceForSecondPool: poolCFinalPrice.toString(),
          AverageBuyPriceForSecondPool: poolCAverageBuyEthPrice.toString(),
          TotalPayStableCoinsForBuyToken: totalUsdcAmountForBuyTokenC.toString(),
          PriceImpactB: priceImpactPoolC.toString(),
        };
      } else {
        logger.error("Invalid pool label")
      }
    }
    catch (error) {
      logger.error(`[simulateTradeLoop] Error: ${error.message}`);
      throw error;
    }
  }

  /**
 * Simulates a swap of token0 → token1 on a Uniswap V3-like curve.
 *
 * This method calculates:
 *  - the final price (after impact) in token1 per token0,
 *  - and the average execution price across the entire curve during the swap.
 *
 * It uses the constant product curve mechanics of Uniswap V3:
 *   sqrtP1 = (L * sqrtP0) / (L - dx * sqrtP0 / Q96)
 *
 * And derives:
 *   - priceAfter: the new spot price after the swap (in token1 per token0),
 *   - avgExecutionPrice: the average price you effectively sold token0 for (based on amountOut / amountIn).
 *
 * Parameters:
 * @param {string|number|BigNumber} sqrtPriceX96 - Initial sqrt price (Q64.96 format)
 * @param {string|number|BigNumber} liquidity - Current pool liquidity
 * @param {number} amountInDecimal - Amount of token0 to sell (human-readable units, e.g. 200 ETH)
 * @param {number} decimals0 - Decimals of token0 (e.g. 18 for ETH)
 * @param {number} decimals1 - Decimals of token1 (e.g. 6 for USDC)
 *
 * Returns:
 * {
 *   priceAfter: string (new spot price after swap, adjusted for decimals),
 *   averageSellCurvePrice: string (effective average price per token0, in token1 units, e.g. USD)
 * }
 */
  async simulateCurvePriceMovement(sqrtPriceX96, liquidity, amountInDecimal, decimals0, decimals1, bRevert = false, bShowDebug = false) {
    BigNumber.config({ DECIMAL_PLACES: 100 });

    var dy = 0;
    var denominator = 0;
    const feeMultiplier = new BigNumber(1).minus(this.fee);

    if (!bRevert) {
      amountInDecimal *= feeMultiplier;
    }

    const Q96 = new BigNumber(2).pow(96);
    const Q192 = new BigNumber(2).pow(192);
    const decimalFactor = new BigNumber(10).pow(decimals0 - decimals1);

    const sqrtP0 = new BigNumber(sqrtPriceX96.toString());         // Q64.96
    const L = new BigNumber(liquidity.toString());                 // Liquidity
    const dx = new BigNumber(amountInDecimal).times(new BigNumber(10).pow(decimals0)); // amountInRaw

    // 2. sqrt(P_after) = (L * sqrtP0) / (L + dx * sqrtP0)
    const dxAdj = dx.times(sqrtP0).div(Q96);

    if (!bRevert) {
      denominator = L.plus(dxAdj);
    } else {
      denominator = L.minus(dxAdj);
    }

    const sqrtP1 = L.times(sqrtP0).div(denominator);

    // 3. P_after = (sqrtP1^2 / Q192) * 10^(dec1 - dec0)
    const priceBeforeRaw = sqrtP0.pow(2).div(Q192);
    const priceAfterRaw = sqrtP1.pow(2).div(Q192);

    const initialPrice = priceBeforeRaw.times(decimalFactor);
    const finalPrice = priceAfterRaw.times(decimalFactor);

    if (!bRevert) {
      dy = L.times(sqrtP0.minus(sqrtP1)).div(Q96);
    } else {
      dy = L.times(sqrtP1.minus(sqrtP0)).div(Q96);
    }

    const dyUSDCDecimal = dy.div(new BigNumber(10).pow(decimals1)); // normalize dy
    const avgPriceInUSDC = dyUSDCDecimal.div(amountInDecimal);      // USDC / ETH
    var USDCAmountToTrade = avgPriceInUSDC.times(amountInDecimal); // BigNumber

    if (bRevert) {
      USDCAmountToTrade *= feeMultiplier;
    }

    if (bShowDebug) {
      const label = !bRevert ? "PoolB" : "PoolC";
      logger.warn("*******V3*******");
      logger.info("Show debug for " + label);
      logger.info("PriceBeforeSwap: " + initialPrice.toFixed(2));
      logger.info("PriceAfterSwap: " + finalPrice.toFixed(2));
      logger.info("AverageCurveSellPrice: " + avgPriceInUSDC.toFixed(2));
      logger.info("TotalGiveAmount: " + USDCAmountToTrade.toFixed(2));
    }

    return {
      initialPrice: initialPrice.toString(),
      priceAfter: finalPrice.toString(),
      averageSellCurvePrice: avgPriceInUSDC.toFixed(2),
      USDCAmountToTrade: USDCAmountToTrade
    };
  }

  async calculatePriceImpact(currentPrice, priceAfterSwap) {
    const impact = Math.abs(((priceAfterSwap / currentPrice) - 1) * 100);
    return impact.toFixed(6);
  }

  async getPoolState() {
    const pool = new ethers.Contract(this.poolAddress, UNISWAP_V3_POOL_ABI, this.provider);
    const [slot0, liquidityRaw] = await Promise.all([
      pool.slot0(),
      pool.liquidity()
    ]);

    return {
      sqrtPriceX96: slot0.sqrtPriceX96,
      tick: slot0.tick,
      liquidity: liquidityRaw
    };
  }

  getPriceFromTick(tick, decimals0, decimals1) {
    const tickNumber = typeof tick === 'bigint' ? Number(tick) : tick;
    const sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tickNumber);
    const priceRaw = JSBI.toNumber(JSBI.multiply(sqrtPriceX96, sqrtPriceX96)) / 2 ** 192;
    const decimalFactor = 10 ** (decimals1 - decimals0);
    return priceRaw * decimalFactor;
  }
}

module.exports = { DexPriceFetcherV3 };

