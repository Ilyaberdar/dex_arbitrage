import Web3 from 'web3';
import { ERC20_ABI } from '../../config/erc20ABI.js';

const web3 = new Web3(process.env.RPC_URL);

export async function getTokenDecimals(tokenAddress) {
  try {
    const token = new web3.eth.Contract(ERC20_ABI, tokenAddress);
    const decimals = await token.methods.decimals().call();
    return parseInt(decimals);
  } catch (err) {
    console.error(`[ERROR]: Failed to fetch decimals for token ${tokenAddress}: ${err.message}`);
    return 18; // fallback default
  }
}
