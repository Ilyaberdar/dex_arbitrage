const { Web3 } = require('web3');
const { ethers } = require('ethers');
const pkg = require('bignumber.js');
const { getTokenDecimals } = require('./utils/tokenUtils.js');
const { ERC20_ABI } = require('../config/erc20ABI.js');
const { UNISWAP_V3_POOL_ABI } = require('../config/uniswapV3PoolABI.js');
const { UNISWAP_V2_POOL_ABI } = require('../config/uniswapV2PoolABI.js');
const dotenv = require('dotenv');
const { logger } = require('../utils/log.js');

dotenv.config();

const { BigNumber } = pkg;

const web3 = new Web3(process.env.RPC_URL);
const provider = new ethers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/2S3IoADMLVdnijcimHMG9bzqpGhQ-Hgn');

/**
 * Simulate price change in the pool after swapping a given amount of token0 to token1
 * @param {BigNumber} balance0 - Current balance of token0
 * @param {BigNumber} balance1 - Current balance of token1
 * @param {BigNumber} amountInToken0 - Amount of token0 to add (e.g. via flashloan)
 * @returns {string} - New price after swap
 */
function simulatePriceImpact(balance0, balance1, amountInToken0, fee) {
  const newBalance0 = balance0.plus(amountInToken0.times(1 - fee));

  // Constant product: x * y = k => new y = k / new x
  const k = balance0.times(balance1);
  const newBalance1 = k.div(newBalance0);

  const priceAfter = newBalance1.div(newBalance0).toFixed(18);
  return priceAfter;
}

function calculatePriceImpact(currentPrice, priceAfterSwap) {
  const impact = ((priceAfterSwap / currentPrice) - 1) * 100;
  return impact.toFixed(6);
}

async function getV3PriceNormalized(poolAddress, token0, token1) {
  const pool = new ethers.Contract(poolAddress, UNISWAP_V3_POOL_ABI, provider);

  const [slot0, decimals0, decimals1] = await Promise.all([
    pool.slot0(),
    getTokenDecimals(token0),
    getTokenDecimals(token1)
  ]);

  const sqrtPriceX96 = slot0.sqrtPriceX96;

  //const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  //const price = priceX192 / (2n ** 192n);

  const price = (sqrtPriceX96 * sqrtPriceX96) / (2n ** 192n);

  const scaleFactor = (10n ** BigInt(decimals0)) / (10n ** BigInt(decimals1));
  const normalizedPrice = price * scaleFactor;

  return normalizedPrice.toString();
}

/**
 * Get token price from a specific Uniswap V3 pool via token balances.
 * @param {string} poolAddress - Address of the Uniswap V3 pool.
 * @param {string} token0 - Address of token0 in the pool.
 * @param {string} token1 - Address of token1 in the pool.
 * @returns {Promise<object|null>} - Object with raw price.
 */
async function getPriceFromV3Pool(poolAddress, token0, token1, amountIn = null, fee = null) {
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
      priceAfterSwap = simulatePriceImpact(balance0, balance1, amountInBN, fee || 0.003);
    }

    let blockNumber = null;
    provider.getBlockNumber().then((result) => {
      blockNumber = result;
    });

    const normalizedPrice = await getV3PriceNormalized(poolAddress, token0, token1);
    const pricepriceFormatted = normalizedPrice;

    const priceImpact = calculatePriceImpact(rawPrice, priceAfterSwap);

    return {
      tokenBalance0: balance0,
      tokenBalance1: balance1,
      currentPrice: rawPrice,
      NormalizedPrice: normalizedPrice,
      PriceImpact: priceImpact,
      BlockNumber: blockNumber
    };
  } catch (err) {
    logger.error(`[ERROR]: Failed to fetch price from pool (${poolAddress}): ${err.message}`);
    return null;
  }
}

/**
 * @param {string|bigint} balance
 * @param {number} decimals
 * @returns {number}
 */
function normalizeBalance(balance, decimals) {
  return Number(balance) / (10 ** decimals);
}

const UNISWAP_V2_FEE_NUMERATOR = 997n;
const UNISWAP_V2_FEE_DENOMINATOR = 1000n;
const DEFAULT_AMOUNT_IN = '1000000000000000000';

/**
 * Get token price from a specific Uniswap V2 pool via token balances.
 * @param {string} poolAddress - Address of the Uniswap V2 pool.
 * @param {string} token0 - Address of token0 in the pool.
 * @param {string} token1 - Address of token1 in the pool.
 * @returns {Promise<object|null>} - Object with raw price.
 */
async function getPriceFromV2Pool(poolAddress, token0, token1, amountIn = null, fee = null) {
  const poolContract = new web3.eth.Contract(UNISWAP_V2_POOL_ABI, poolAddress);

  const [poolToken0, poolToken1] = await Promise.all([
    poolContract.methods.token0().call(),
    poolContract.methods.token1().call()
  ]);

  const reserves = await poolContract.methods.getReserves().call();
  const reserve0 = BigInt(reserves._reserve0);
  const reserve1 = BigInt(reserves._reserve1);

  const [decimals0, decimals1] = await Promise.all([
    getTokenDecimals(poolToken0),
    getTokenDecimals(poolToken1)
  ]);

  let reserveIn, reserveOut;

  if (token0.toLowerCase() === poolToken0.toLowerCase() && token1.toLowerCase() === poolToken1.toLowerCase()) {
    reserveIn = reserve0;
    reserveOut = reserve1;
  } else if (token0.toLowerCase() === poolToken1.toLowerCase() && token1.toLowerCase() === poolToken0.toLowerCase()) {
    reserveIn = reserve1;
    reserveOut = reserve0;
    balance0 = reserve1;
    balance1 = reserve0;
  } else {
    throw new Error('Provided tokens do not match the pool tokens.');
  }

  const inputAmount = amountIn ? BigInt(amountIn) : BigInt(DEFAULT_AMOUNT_IN);

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
  const blockNumber = await web3.eth.getBlockNumber();

  return {
    tokenBalance0: normalizedReserve0,
    tokenBalance1: normalizedReserve1,
    currentPrice: realPrice,
    NormalizedPrice: priceFormatted,
    PriceImpact: priceImpact,
    BlockNumber: blockNumber
  };
}


module.exports = { getPriceFromV3Pool, getPriceFromV2Pool };
