require('dotenv').config();
const { ethers } = require('ethers');
const { RPC } = require('../config/rpcNetworks.js');

const provider = new ethers.JsonRpcProvider(RPC.ETHEREUM);

const quoterAddress = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const quoterAbi = [
  "function quoteExactInputSingle(address,address,uint24,uint256,uint160) returns (uint256,uint160,uint32,uint256)"
];
const iface = new ethers.Interface(quoterAbi);

// ✅ Проверенные параметры
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const fee = 500; // 0.05% — valid for UniswapV3 USDC/WETH
const amountIn = ethers.parseUnits("1000", 6); // 1000 USDC

async function simulateQuote() {
  const data = iface.encodeFunctionData("quoteExactInputSingle", [
    USDC,
    WETH,
    fee,
    amountIn,
    0
  ]);

  try {
    const res = await provider.call({ to: quoterAddress, data });
    const [amountOut, sqrtPriceX96, ticksCrossed, gasEstimate] = iface.decodeFunctionResult("quoteExactInputSingle", res);

    console.log("ETH Out:", ethers.formatUnits(amountOut, 18));
    console.log("sqrtPriceX96 After:", sqrtPriceX96.toString());
    console.log("Ticks Crossed:", ticksCrossed.toString());
    console.log("Gas Estimate:", gasEstimate.toString());
  } catch (e) {
    console.error("Ошибка:", e.message);
  }
}

simulateQuote();