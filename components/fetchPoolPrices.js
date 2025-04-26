// testPriceFetch.js
const { getPriceFromV3Pool, getPriceFromV2Pool } = require('./dexPriceFetcher.js');
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
  logger.info(`Normalized V3 Price: ${data.NormalizedPrice} USDC`);
  logger.info(`Price Impact: ${data.PriceImpact} %`);
  logger.info(`Block Number: ${data.BlockNumber}`);
};


const getPoolPrices = async () => {
  //const currentUniswapPoolPrice = await getPriceFromV3Pool(POOL.UNISWAP_WBTC, TOKEN.WBTC, TOKEN.USDC /*,1*/); //@note: amountIn param to pass in the equivalent of a token in the pool 
  //const currentSushiSwapPoolPrice = await getPriceFromV3Pool(POOL.SUSHISWAP_WBTC, TOKEN.WBTC, TOKEN.USDC);

  //const currentUniswapPoolPrice = await getPriceFromV3Pool(POOL.UNISWAP_WETH, TOKEN.WETH, TOKEN.USDC, 300, 0.03);
  //printRouterPrice('Uniswap V3', currentUniswapPoolPrice);

  const currentUniswapPoolPriceV2 = await getPriceFromV2Pool(POOL.UNISWAP_ETH_V2, TOKEN.WETH, TOKEN.USDC, 300, 0.03);
  printRouterPrice('Uniswap V2', currentUniswapPoolPriceV2);

  const currentUniswapPoolPrice_v2 = await getPriceFromV3Pool(POOL.UNISWAP_WETH_V2, TOKEN.WETH_V2, TOKEN.USDC_V2, 300, 0.03);
  printRouterPrice('Uniswap V2', currentUniswapPoolPrice_v2);

  //const currentSushiSwapPoolPrice = await getPriceFromV3Pool(POOL.SUSHISWAP_WETH, TOKEN.WETH, TOKEN.USDC, 1, 0.03);
  //printRouterPrice('SushiSwap V3', currentSushiSwapPoolPrice);
};

getPoolPrices();
