const UNISWAP_V3_POOL_ABI = [
  {
    "name": "slot0",
    "type": "function",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      { "name": "sqrtPriceX96", "type": "uint160" },
      { "name": "tick", "type": "int24" },
      { "name": "observationIndex", "type": "uint16" },
      { "name": "observationCardinality", "type": "uint16" },
      { "name": "observationCardinalityNext", "type": "uint16" },
      { "name": "feeProtocol", "type": "uint8" },
      { "name": "unlocked", "type": "bool" }
    ]
  },
  {
    "name": "liquidity",
    "type": "function",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "uint128" }
    ]
  },
  {
    "name": "token0",
    "type": "function",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "address" }
    ]
  },
  {
    "name": "token1",
    "type": "function",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      { "name": "", "type": "address" }
    ]
  }
];

export { UNISWAP_V3_POOL_ABI };
