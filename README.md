
# 💸 Flashloan Arbitrage Bot on Uniswap V3

This project contains a Solidity smart contract that performs flashloans via Uniswap V3 and enables arbitrage between tokens.  
The off-chain logic (e.g., arbitrage opportunity detection) is handled by an external Rust or JavaScript bot.

---

## 🛠 Prerequisites

- [Node.js](https://nodejs.org/) (v16+ recommended)
- [npm](https://www.npmjs.com/)
- Optional: [VSCode](https://code.visualstudio.com/) with Solidity plugin

---

## 📦 Setup Instructions

### 1. Clone the repo

```bash
git clone https://github.com/your-user/flashloan-arb-bot.git
cd flashloan-arb-bot
```

### 2. Initialize project and install Hardhat

```bash
npm init -y
npm install --save-dev hardhat
npx hardhat
```

### 3. Install dependencies

```bash
npm install --save-dev @nomicfoundation/hardhat-toolbox
npm install @openzeppelin/contracts
npm install @uniswap/v3-core @uniswap/v3-periphery
```

### 🧱 Project Structure

```bash
.
├── artifacts/                          # Hardhat artifacts and build output
├── cache/                              # Hardhat cache
├── components/                         # JS logic for arbitrage and price fetching
│   ├── arbitrageMonitor.js
│   ├── calculateArbitrage.js
│   ├── dexPriceFetcherBase.js
│   ├── dexPriceFetcherV2.js
│   ├── dexPriceFetcherV3.js
│   ├── initArbEngineCore.js
│   └── perf_metrics.json              # Output performance metrics in JSON
├── config/                             # Network and contract configurations
│   ├── erc20ABI.js
│   ├── liquidityPool.js
│   ├── routers.js
│   ├── rpcNetworks.js
│   ├── tokens.js
│   ├── uniswapV2PoolABI.js
│   └── uniswapV3PoolABI.js
├── contracts/                          # Solidity smart contracts
│   ├── ERC20Mock.sol
│   ├── FlashloanArbitrage.sol
│   ├── FlashSwapArbitrageV2.sol
│   ├── FlashSwapArbitrageV3.sol
│   ├── SwapRouterMock.sol
│   └── UniswapPoolMock.sol
├── logs/                               # Custom logs and analytics
├── node_modules/
├── perf_meter/                         # Rust-based WASM performance meter
│   ├── pkg/
│   ├── src/
│   ├── target/
│   ├── Cargo.lock
│   └── Cargo.toml
├── perf-viewer/                        # EGUI/eframe Rust GUI for visualizing performance
│   ├── src/
│   ├── target/
│   ├── Cargo.lock
│   └── Cargo.toml
├── rust/                               # Reserved for custom native logic
├── test/                               # JavaScript test files
│   ├── FlashloanArbitrageV2Test.cjs
│   └── FlashloanArbitrageV3Test.cjs
├── utils/                              # Utility modules
│   └── log.js
├── workers/                            # (Empty) for background job runners
├── .env                                # Environment variables
├── .gitignore
├── hardhat.config.cjs                  # Hardhat configuration
├── index.js                            # Entry point (optional CLI/server)
├── LICENSE
├── package.json
├── package-lock.json
└── README.md
```

### 🧪 Compile & Test

Compile all contracts:
```bash
npx hardhat compile
```

Run tests:
```bash
npx hardhat test
```

### 🔁 Run Forked Mainnet Flashloan Test (optional)

#### 1. Get an Infura or Alchemy mainnet RPC URL
[Infura](https://www.infura.io/) or [Alchemy](https://www.alchemy.com/)
#### 2. Create .env file in root:
```ini 
MAINNET_RPC=https://mainnet.infura.io/v3/YOUR_API_KEY
```

#### 3. Edit hardhat.config.js:
```js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    hardhat: {
      forking: {
        url: process.env.MAINNET_RPC,
        blockNumber: 19000000 // optional, but recommended for consistency
      }
    }
  }
};
```

#### 4. Run tests:
```bash
npx hardhat test
```

## 📘 Info: `requestFlashLoan`

```solidity
function flashSwap(
        address pool0,
        address pool1,
        address pool2,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external
```

### Description
Triggers a flashloan from a Uniswap V3 pool, borrowing `token0` and/or `token1`. After receiving the tokens, Uniswap calls the contract’s `uniswapV3FlashCallback`, where the arbitrage logic is executed.

### Parameters
| Name      | Type      | Description                                                  |
|-----------|-----------|--------------------------------------------------------------|
| `pool0`   | `address` | Address of the Uniswap V3 pool to borrow from                |
| `pool1`   | `address` | Pool to sell tokenIn for tokenOut                            |
| `pool2`   | `address` | Pool to buy back tokenIn using tokenOut                      |
| `tokenIn` | `uint256` | Token to borrow (and return at the end)                      |
| `tokenOut`| `uint256` | Intermediate token used for the swap path                    |
| `amountIn`| `uint256` | Amount of tokenIn to borrow from pool0                       |


### Internally
1. Encodes data and calls the pool’s `flash()` method
2. Uniswap V3 automatically calls back `uniswapV3FlashCallback`
3. Arbitrage logic is executed (swap → swap back → repay)
4. Reverts if trade isn’t profitable

---

## 🧠 Example Workflow

1. Deploy the contract using:
```js
await flashloanContract.deploy(poolAddress, routerAddress);
```

2. Rust bot monitors on-chain prices
3. If profitable arbitrage is found, bot calls:
```js
await flashloanContract.requestFlashLoan(token0, token1, amount0, amount1);
```
4. Profit is collected inside the contract
5. Call `withdrawToken(token)` or `withdrawETH()` to collect earnings

---

## 📤 Deployment

```bash
npx hardhat run scripts/deploy.js --network <your_network>
```

## 📤 Run with Perf

```bash
node --experimental-wasm-modules arbitrageMonitor.js
```

![Performance Chart](perf_demo.png)

---