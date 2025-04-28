const { Web3 } = require('web3');
const { ethers } = require('ethers');
const { UNISWAP_V2_POOL_ABI } = require('../config/uniswapV2PoolABI.js');
const { ERC20_ABI } = require('../config/erc20ABI.js');
const { getTokenDecimals } = require('../utils/tokenUtils.js');
const { logger } = require('../utils/log.js');

const UNISWAP_V2_FEE_NUMERATOR = 997n;
const UNISWAP_V2_FEE_DENOMINATOR = 1000n;
const DEFAULT_AMOUNT_IN = '1000000000000000000';

/**
 * DexPriceFetcherV2
 * Fetches prices from Uniswap V2 style pools.
 */
class DexPriceFetcherV2 {
  constructor({ rpcUrl, poolAddress, token0, token1, fee }) {
    this.rpcUrl = rpcUrl;
    this.poolAddress = poolAddress;
    this.token0 = token0;
    this.token1 = token1;
    this.fee = fee || 0.003;
    this.web3 = new Web3(rpcUrl);
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Fetches current price and simulated price impact from a Uniswap V2 pool.
   * @param {string|bigint} [amountIn] - Amount of token0 to simulate a swap (optional)
   * @returns {Promise<object|null>} - Price data and pool state
   */
  async fetchPrice(amountIn = null) {
    try {
      const poolContract = new this.web3.eth.Contract(UNISWAP_V2_POOL_ABI, this.poolAddress);

      // Fetch token0 and token1 addresses from the pool
      const [poolToken0, poolToken1] = await Promise.all([
        poolContract.methods.token0().call(),
        poolContract.methods.token1().call()
      ]);

      // Fetch reserves of token0 and token1
      const reserves = await poolContract.methods.getReserves().call();
      const reserve0 = BigInt(reserves._reserve0);
      const reserve1 = BigInt(reserves._reserve1);

      // Fetch token decimals
      const [decimals0, decimals1] = await Promise.all([
        getTokenDecimals(this.rpcUrl, poolToken0),
        getTokenDecimals(this.rpcUrl, poolToken1)
      ]);

      let reserveIn, reserveOut;

      // Determine swap direction based on token order
      if (this.token0.toLowerCase() === poolToken0.toLowerCase() && this.token1.toLowerCase() === poolToken1.toLowerCase()) {
        reserveIn = reserve0;
        reserveOut = reserve1;
      } else if (this.token0.toLowerCase() === poolToken1.toLowerCase() && this.token1.toLowerCase() === poolToken0.toLowerCase()) {
        reserveIn = reserve1;
        reserveOut = reserve0;
      } else {
        throw new Error('Provided tokens do not match the pool tokens.');
      }

      // Default input amount if not provided
      const inputAmount = amountIn ? BigInt(amountIn) : BigInt(DEFAULT_AMOUNT_IN);

      // Calculate swap output amount accounting for Uniswap V2 fee
      const amountInWithFee = inputAmount * UNISWAP_V2_FEE_NUMERATOR;
      const numerator = amountInWithFee * reserveOut;
      const denominator = reserveIn * UNISWAP_V2_FEE_DENOMINATOR + amountInWithFee;
      const amountOut = numerator / denominator;

      const normalizedReserve0 = Number(reserve0) / (10 ** decimals0);
      const normalizedReserve1 = Number(reserve1) / (10 ** decimals1);

      const realPrice = normalizedReserve0 / normalizedReserve1;
      const priceFormatted = Number(amountOut) / Number(inputAmount);
      const expectedPrice = Number(reserveOut) / Number(reserveIn);
      const priceImpact = expectedPrice > 0 ? (expectedPrice - priceFormatted) / expectedPrice : 0;
      const blockNumber = await this.web3.eth.getBlockNumber();

      return {
        tokenBalance0: normalizedReserve0,
        tokenBalance1: normalizedReserve1,
        currentPrice: realPrice,
        NormalizedPrice: priceFormatted,
        PriceImpact: priceImpact
      };

    } catch (error) {
      logger.error(`[DexPriceFetcherV2]: Failed to fetch price from pool (${this.poolAddress}): ${error.message}`);
      return null;
    }
  }
}

module.exports = { DexPriceFetcherV2 };
