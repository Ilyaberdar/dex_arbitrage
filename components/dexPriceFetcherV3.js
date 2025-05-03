const { Web3 } = require('web3');
const { ethers } = require('ethers');

const { ERC20_ABI } = require('../config/erc20ABI.js');
const { UNISWAP_V3_POOL_ABI } = require('../config/uniswapV3PoolABI.js');

const { logger } = require('../utils/log.js');

const pkg = require('bignumber.js');
const { BigNumber } = pkg;

const { performance } = require('perf_hooks');

/**
 * DexPriceFetcherV3
 * Fetches prices from Uniswap V3 style pools.
 */
class DexPriceFetcherV3 {
  constructor(rpcUrl, poolAddress, token0, token1, fee) {
    this.rpcUrl = rpcUrl;
    this.poolAddress = poolAddress;
    this.token0 = token0;
    this.token1 = token1;
    this.fee = fee || 0.003;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.web3 = new Web3(rpcUrl);
  }

  /**
 * Fetches the normalized price from a Uniswap V3 pool.
 *
 * Calculation explanation:
 * - `slot0().sqrtPriceX96` gives the square root of the price (token1/token0), scaled by 2^96 (Q96 fixed-point format).
 * - To obtain the real price, we square `sqrtPriceX96` and divide by 2^192.
 * - Then, the price is adjusted based on the decimal differences between token0 and token1.
 * - If the calculated price is extremely small (< 1e-6), it is inverted to maintain consistency.
 *
 * Final formula:
 *   price = (sqrtPriceX96^2) / 2^192
 *   price = price * (10^(decimals0 - decimals1))
 *   if (price < 1e-6) { price = 1 / price }
 *
 * @returns {Promise<number>} Normalized pool price (token1 per token0), adjusted for decimals
 */
  async getV3PriceSqrt() {
    const pool = new ethers.Contract(this.poolAddress, UNISWAP_V3_POOL_ABI, this.provider);

    const [slot0, decimals0, decimals1] = await Promise.all([
      pool.slot0(),
      this.getTokenDecimals(this.token0),
      this.getTokenDecimals(this.token1)
    ]);

    const start = performance.now();

    const sqrtPriceX96 = slot0.sqrtPriceX96;
    const priceX192 = sqrtPriceX96 * sqrtPriceX96;

    let price = Number(priceX192) / Number(2n ** 192n);
    price = price * (10 ** (decimals0 - decimals1))

    if (price < 1e-6) {
      price = 1 / price;
    }

    const end = performance.now();
    logger.warn(`Execution time: ${(end - start).toFixed(2)} ms`);

    return price;
  }

  async fetchV3PoolPrice(amountIn = null) {
    try {
      const token0Contract = new this.web3.eth.Contract(ERC20_ABI, this.token0);
      const token1Contract = new this.web3.eth.Contract(ERC20_ABI, this.token1);

      const [balance0Raw, balance1Raw] = await Promise.all([
        token0Contract.methods.balanceOf(this.poolAddress).call(),
        token1Contract.methods.balanceOf(this.poolAddress).call()
      ]);

      const decimalsToken0 = await this.getTokenDecimals(this.token0);
      const decimalsToken1 = await this.getTokenDecimals(this.token1);

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

      const normalizedPrice = await this.getV3PriceSqrt();

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

  async calculatePriceImpact(currentPrice, priceAfterSwap) {
    const impact = ((priceAfterSwap / currentPrice) - 1) * 100;
    return impact.toFixed(6);
  }

  async getTokenDecimals(tokenAddress) {
    try {
      const token = new this.web3.eth.Contract(ERC20_ABI, tokenAddress);
      const decimals = await token.methods.decimals().call();
      return parseInt(decimals);
    } catch (err) {
      logger.error(`[DexPriceFetcherV3]: Failed to fetch decimals for token ${tokenAddress}: ${err.message}`);
      return 18; // fallback default
    }
  }
}

module.exports = { DexPriceFetcherV3 };

