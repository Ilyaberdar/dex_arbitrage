import Web3 from 'web3';
import pkg from 'bignumber.js';
import { getTokenDecimals } from './utils/tokenUtils.js';
import { ERC20_ABI } from '../config/erc20ABI.js';
import dotenv from 'dotenv';
import { logger } from '../utils/log.js';

dotenv.config();

const { BigNumber } = pkg;
const web3 = new Web3(process.env.RPC_URL);

/**
 * Simulate price change in the pool after swapping a given amount of token0 to token1
 * @param {BigNumber} balance0 - Current balance of token0
 * @param {BigNumber} balance1 - Current balance of token1
 * @param {BigNumber} amountInToken0 - Amount of token0 to add (e.g. via flashloan)
 * @returns {string} - New price after swap
 */
function simulatePriceImpact(balance0, balance1, amountInToken0) {
  const newBalance0 = balance0.plus(amountInToken0);

  // Constant product: x * y = k => new y = k / new x
  const k = balance0.times(balance1);
  const newBalance1 = k.div(newBalance0);

  const priceAfter = newBalance1.div(newBalance0).toFixed(18);
  return priceAfter;
}

/**
 * Get token price from a specific Uniswap V3 pool via token balances.
 * @param {string} poolAddress - Address of the Uniswap V3 pool.
 * @param {string} token0 - Address of token0 in the pool.
 * @param {string} token1 - Address of token1 in the pool.
 * @returns {Promise<object|null>} - Object with raw price.
 */
export async function getPriceFromV3Pool(poolAddress, token0, token1, amountIn = null) {
  try {
    const token0Contract = new web3.eth.Contract(ERC20_ABI, token0);
    const token1Contract = new web3.eth.Contract(ERC20_ABI, token1);

    const [balance0Raw, balance1Raw] = await Promise.all([
      token0Contract.methods.balanceOf(poolAddress).call(),
      token1Contract.methods.balanceOf(poolAddress).call()
    ]);

    const decimalsToken0 = await getTokenDecimals(token0);
    const decimalsToken1 = await getTokenDecimals(token1);

    const balance0 = new BigNumber(balance0Raw).div(new BigNumber(10).pow(decimalsToken0));
    const balance1 = new BigNumber(balance1Raw).div(new BigNumber(10).pow(decimalsToken1));
    const rawPrice = balance1.div(balance0).toFixed(18);

    let priceAfterSwap = null;
    if (amountIn) {
      const amountInBN = new BigNumber(amountIn);
      priceAfterSwap = simulatePriceImpact(balance0, balance1, amountInBN);
    }

    return {
      tokenBalance0: balance0,
      tokenBalance1: balance1,
      currentPrice: rawPrice,
      ...(priceAfterSwap && { simulatedPrice: priceAfterSwap })
    };
  } catch (err) {
    logger.error(`[ERROR]: Failed to fetch price from pool (${poolAddress}): ${err.message}`);
    return null;
  }
}
