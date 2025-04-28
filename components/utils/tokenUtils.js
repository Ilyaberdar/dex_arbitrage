const { ERC20_ABI } = require('../../config/erc20ABI.js');
const { Web3 } = require('web3');
const { logger } = require('../../utils/log.js');

async function getTokenDecimals(rpc, tokenAddress) {
  try {
    const web3 = new Web3(rpc);
    const token = new web3.eth.Contract(ERC20_ABI, tokenAddress);
    const decimals = await token.methods.decimals().call();
    return parseInt(decimals);
  } catch (err) {
    logger.error(`[ERROR]: Failed to fetch decimals for token ${tokenAddress}: ${err.message}`);
    return 18; // fallback default
  }
}

module.exports = { getTokenDecimals };