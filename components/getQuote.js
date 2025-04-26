require('dotenv').config()

const { ethers } = require('ethers');


console.log(process.env.RPC_URL);

// Параметри
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL); // або свій RPC
const quoterAddress = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6'; // Офіційний Quoter Uniswap V3 на Ethereum

const tokenIn = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC адреса
const tokenOut = '0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2'; // WETH адреса
const fee = 3000; // 0.3% фі
const amountIn = ethers.parseUnits('2000', 6); // 2000 USDC (6 decimal places)

const quoterABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)'
];

async function getQuote() {
  const quoter = new ethers.Contract(quoterAddress, quoterABI, provider);
  //const quoter = new web3.eth.Contract(quoterABI, quoterAddress);
  
  const amountOut = await quoter.quoteExactInputSingle(
    tokenIn,
    tokenOut,
    fee,
    amountIn,
    0 // sqrtPriceLimitX96 = 0 -> без обмеження
  );

  console.log('Скільки ETH отримаєш за 2000 USDC:', ethers.formatEther(amountOut));
}

getQuote();
