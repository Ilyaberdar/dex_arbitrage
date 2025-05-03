// arbitrageMinitor.js
const { main } = require('./calculateArbitrage.js');
const axios = require('axios');
const { logger } = require('../utils/log.js');

const TELEGRAM_BOT_TOKEN = '7665763072:AAFXuQ7jXGl88DqZi0l412lthEFm7xluxM4';
const TELEGRAM_CHAT_ID = '-1002591098131';

async function sendTelegramMessage(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error(`Failed to send Telegram message: ${error.message}`);
  }
}

async function Tick() {
  while (true) {
    const start = Date.now();
    try {
      const result = await main(false);
      if (result?.IsArbitrageProfitable) {
        const arbitrageResult = {
          SqrtPriceA: result.SqrtPriceA,
          SqrtPriceB: result.SqrtPriceB,
          PoolsSpread: result.PoolsSpread,
          TotalPoolsFee: result.TotalPoolsFee,
          CurrentGasPrice: result.CurrentGasPrice,
          ArbitrageProfit: result.ArbitrageProfit
        };
        const format = (num, digits = 4) => Number(num).toFixed(digits);

        const message = `💥 *Arbitrage Opportunity Detected*
        *• √Price A:* \`${format(arbitrageResult.SqrtPriceA)}\`
        *• √Price B:* \`${format(arbitrageResult.SqrtPriceB)}\`
        *• Spread:* \`${format(arbitrageResult.PoolsSpread)}\`
        *• Total Fees:* \`${format(arbitrageResult.TotalPoolsFee)}\`
        *• Gas Cost (USDC):* \`${format(arbitrageResult.CurrentGasPrice, 6)}\`
        *• 📈 Profit (USDC):* \`${format(arbitrageResult.ArbitrageProfit, 2)}\`
        🔁 *Executable:* ${arbitrageResult.ArbitrageProfit > 0 ? '*Yes ✅*' : '*No ❌*'}`;
        sendTelegramMessage(message);
      }
    } catch (err) {
      logger.error(`Error in arbitrage loop: ${err.message}`);
      sendTelegramMessage(`*⚠️ Error in arbitrage loop:*\n\`${err.message}\``);
    }

    const duration = Date.now() - start;
    const delay = Math.max(10000 - duration, 0);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

Tick();
