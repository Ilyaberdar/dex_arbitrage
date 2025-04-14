// testPriceFetch.js
const { getPriceFromV3Pool } = require('./dexPriceFetcher.js');
const { TOKEN } = require('../config/tokens.js');
const { POOL } = require('../config/liquidityPool.js');
const { logger } = require('../utils/log.js');

const printRouterPrice = (label, data) => {
  if (!data) {
    logger.error(`${label}: Failed to fetch price`);
    return;
  }

  logger.info(`${label}:`);
  logger.info(`Circulation for token 0: ${data.tokenBalance0}`);
  logger.info(`Circulation for token 1: ${data.tokenBalance1}`);
  logger.info(`Current Pool Price: ${data.currentPrice} USDC`);
  logger.info(`Simulate Price Impact: ${data.simulatedPrice} USDC`);
};


const getPoolPrices = async () => {
  //const currentUniswapPoolPrice = await getPriceFromV3Pool(POOL.UNISWAP_WBTC, TOKEN.WBTC, TOKEN.USDC /*,1*/); //@note: amountIn param to pass in the equivalent of a token in the pool 
  //const currentSushiSwapPoolPrice = await getPriceFromV3Pool(POOL.SUSHISWAP_WBTC, TOKEN.WBTC, TOKEN.USDC);
  logger.info(`Start:`);

  const currentUniswapPoolPrice = await getPriceFromV3Pool(POOL.UNISWAP_WETH, TOKEN.WETH, TOKEN.USDC /*,1*/);
  const currentSushiSwapPoolPrice = await getPriceFromV3Pool(POOL.SUSHISWAP_WETH, TOKEN.WETH, TOKEN.USDC);

  printRouterPrice('Uniswap V3', currentUniswapPoolPrice);
  printRouterPrice('SushiSwap V3', currentSushiSwapPoolPrice);
};

getPoolPrices();
