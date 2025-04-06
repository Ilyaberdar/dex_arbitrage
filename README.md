
# 💸 Flashloan Arbitrage Bot on Uniswap V3

This project contains a Solidity smart contract that performs flashloans via Uniswap V3 and enables arbitrage between tokens.  
The off-chain logic (e.g., arbitrage opportunity detection) is handled by an external C++ or JavaScript bot.

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
├── contracts/
│   ├── FlashloanArbitrage.sol       # Main contract
│   ├── ERC20Mock.sol                # Mock token for testing
│   ├── SwapRouterMock.sol           # Mock Uniswap V3 router
│   └── UniswapPoolMock.sol          # Mock Uniswap V3 pool
├── test/
│   └── FlashloanArbitrage.js   # Test suite
├── hardhat.config.js                # Hardhat config
├── .env                             # Environment variables
├── package.json
└── README.md
└── index.js
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