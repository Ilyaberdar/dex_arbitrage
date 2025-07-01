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
      const result = await main();
      if (result?.ArbitrageProfitable) {
        const arbitrageResult = {
          PriceBeforeSwapPoolB: result.PriceBeforeSwapPoolB,
          PriceBeforeSwapPoolC: result.PriceBeforeSwapPoolC,
          PriceAfterSwapPoolB: result.PriceAfterSwapPoolB,
          PriceAfterSwapPoolC: result.PriceAfterSwapPoolC,
          AverageSellPrice: result.AverageSellPrice,
          AverageBuyPrice: result.AverageBuyPrice,
          PriceDifference: result.PriceDifference,
          FinalAmountProfit: result.FinalAmountProfit,
          FinalPercentageProfit: result.FinalPercentageProfit,
          Loan: result.Loan
        };
        const format = (num, digits = 4) => Number(num).toFixed(digits);

        const message = `*Arbitrage Opportunity Detected*
        *PriceBeforeSwapPoolB:* \`${format(arbitrageResult.PriceBeforeSwapPoolB)}\`
        *PriceAfterSwapPoolB:* \`${format(arbitrageResult.PriceAfterSwapPoolB)}\`
        *AverageSellPriceInPoolB:* \`${format(arbitrageResult.AverageSellPrice, 6)}\`
        *PriceBeforeSwapPoolC:* \`${format(arbitrageResult.PriceBeforeSwapPoolC)}\`
        *PriceAfterSwapPoolC:* \`${format(arbitrageResult.PriceAfterSwapPoolC)}\`
        *AverageBuyPriceInPoolC:* \`${format(arbitrageResult.AverageBuyPrice, 6)}\`
        *PriceDifference:* \`${format(arbitrageResult.PriceDifference, 6)}\`
        *FinalAmountProfit:* \`${format(arbitrageResult.FinalAmountProfit, 6)}\`
        *FinalPercentageProfit:* \`${format(arbitrageResult.FinalPercentageProfit, 6)}\`
        *LoanETH:* \`${format(arbitrageResult.Loan, 0)}\`
        *Executable:* ${arbitrageResult.FinalPercentageProfit > 0 ? '*Yes ✅*' : '*No ❌*'}`;
        sendTelegramMessage(message);
      }
    } catch (err) {
      logger.error(`Error in arbitrage loop: ${err.message}`);
      sendTelegramMessage(`*Error in arbitrage loop:*\n\`${err.message}\``);
    }

    const duration = Date.now() - start;
    const delay = Math.max(10000 - duration, 0);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

Tick();
