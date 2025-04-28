// testPriceFetch.js
const { DexPriceFetcherV3 } = require('./dexPriceFetcherV3.js');
const { TOKEN_ETH, TOKEN_ARB } = require('../config/tokens.js');
const { ETH_NETWORK_POOL, ARB_NETWORK_POOL } = require('../config/liquidityPool.js');
const { RPC } = require('../config/rpcNetworks.js');
const { logger } = require('../utils/log.js');

const printPoolState = (label, data) => {
  if (!data) {
    logger.error(`${label}: Failed to fetch price`);
    return;
  }

  logger.info(`${label}:`);
  logger.info(`Circulation for token 0: ${data.tokenBalance0}`);
  logger.info(`Circulation for token 1: ${data.tokenBalance1}`);
  logger.info(`Current Pool Price: ${data.currentPrice} USDC`);
  logger.info(`Sqrt Price: ${data.NormalizedPrice} USDC`);
  logger.info(`Price Impact: ${data.PriceImpact} %`);
};

const pools = [
  new DexPriceFetcherV3(RPC.ETHEREUM, ETH_NETWORK_POOL.UNISWAP_WBTC, TOKEN_ETH.WBTC, TOKEN_ETH.USDC, 0.03),
  new DexPriceFetcherV3(RPC.ARBITRUM, ARB_NETWORK_POOL.UNISWAP_ETH_V3, TOKEN_ARB.WETH, TOKEN_ARB.USDC, 0.01)
];

async function main() {
  for (const pool of pools) {
    const prices = await pool.fetchV3PoolPrice(100);
    printPoolState('Uniswap V3 pool', prices);
  }
}

main();
