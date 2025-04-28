// testPriceFetch.js
const { getPriceFromV3Pool, getPriceFromV2Pool } = require('./dexPriceFetcher.js');
const { TOKEN_ETH, TOKEN_ARB } = require('../config/tokens.js');
const { ETH_NETWORK_POOL, ARB_NETWORK_POOL } = require('../config/liquidityPool.js');
const { RPC } = require('../config/rpcNetworks.js');
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
};


const getPoolPricesEthNetwork = async () => {
  const currentSushiSwapPoolPrice = await getPriceFromV3Pool(RPC.ETHEREUM, ETH_NETWORK_POOL.UNISWAP_WBTC, TOKEN_ETH.WBTC, TOKEN_ETH.USDC, 300, 0.03);
  printRouterPrice('Uniswap V3 Ethereum', currentSushiSwapPoolPrice);

  //const currentUniswapPoolPrice = await getPriceFromV3Pool(POOL.UNISWAP_WETH, TOKEN.WETH, TOKEN.USDC, 300, 0.03);
  //printRouterPrice('Uniswap V3', currentUniswapPoolPrice);
};

const getPoolPricesArbNetwork = async () => {
  const currentSushiSwapPoolPrice = await getPriceFromV3Pool(RPC.ARBITRUM, ARB_NETWORK_POOL.UNISWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, 300, 0.03);
  printRouterPrice('Uniswap V3 Arbitrum', currentSushiSwapPoolPrice);
};

getPoolPricesArbNetwork();
