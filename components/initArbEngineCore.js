import fs from 'fs';
import BigNumber from 'bignumber.js';
import { ethers } from "ethers";
import JSBI from 'jsbi';

import { RPC } from '../config/rpcNetworks.js';

import { getLogger } from '../utils/log.js';
const engineLog = getLogger("engine");

import * as wasm from '../perf_meter/pkg/perf_meter.js';
const perf = new wasm.PerfMeter();
const writeFileDestination = '../perf-viewer/src/perf_metrics.json'

function getPairKey(token0, token1) {
    return [token0, token1].sort().join('-');
}

function groupPoolsByTokenPair(pools) {
    const map = new Map();
    for (const pool of pools) {
        const key = getPairKey(pool.token0, pool.token1);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(pool);
    }
    return map;
}

function getValidTripletsFromGroups(grouped) {
    const triplets = [];
    for (const [pair, poolList] of grouped.entries()) {
        const uniquePools = Array.from(new Map(poolList.map(p => [p.poolAddress, p])).values());
        if (uniquePools.length < 3) {
            engineLog.debug(`Skipping pair ${pair} (only ${uniquePools.length} unique pools)`);
            continue;
        }
        engineLog.info(`Pair ${pair} has ${uniquePools.length} unique pools. Generating triplets...`);
        for (let i = 0; i < uniquePools.length - 2; i++) {
            for (let j = i + 1; j < uniquePools.length - 1; j++) {
                for (let k = j + 1; k < uniquePools.length; k++) {
                    triplets.push([uniquePools[i], uniquePools[j], uniquePools[k]]);
                }
            }
        }
    }
    return triplets;
}

function getPermutations([a, b, c]) {
    return [
        [a, b, c],
        [a, c, b],
        [b, a, c],
        [b, c, a],
        [c, a, b],
        [c, b, a],
    ];
}

async function simulateArbitrageLoop(poolA, poolB, poolC, loanAmount, debug = false) {
    try {
        const poolStateA = await poolA.getPoolState();
        const liquidity = JSBI.BigInt(poolStateA.liquidity.toString());
        if (JSBI.equal(liquidity, JSBI.BigInt(0))) {
            return null;
        }

        perf.start(poolB.poolAddress);
        const priceMovementB = await poolB.simulateTradeLoop(loanAmount, 0, debug); // sell

        perf.start(poolC.poolAddress);
        const priceMovementC = await poolC.simulateTradeLoop(loanAmount, 1, debug); // buy

        if (!poolStateA || !priceMovementB || !priceMovementC) {
            perf.stop(poolB.poolAddress);
            perf.stop(poolC.poolAddress);

            return null;
        }

        const initialSell = Number(priceMovementB.InitialPriceForFirstPool);
        const finalSell = Number(priceMovementB.FinalPriceForFirstPool);
        const stepsSell = 10;

        const sellPriceCurve = [];

        for (let i = 0; i <= stepsSell; i++) {
            const t = i / stepsSell;
            const price = finalSell + (initialSell - finalSell) / (1 + 10 * t);
            sellPriceCurve.push(price);
        }

        perf.add_curve("simulateTradeLoopFor1Pool", sellPriceCurve);
        perf.stop(poolB.poolAddress);

        const initialBuy = Number(priceMovementB.InitialPriceForFirstPool);
        const finalBuy = Number(priceMovementB.FinalPriceForFirstPool);
        const stepsBuy = 10;

        const buyPriceCurve = [];

        for (let i = 0; i <= stepsBuy; i++) {
            const t = i / stepsBuy;
            const price = initialBuy + (finalBuy - initialBuy) / (1 + 10 * (1 - t));
            buyPriceCurve.push(price);
        }

        perf.add_curve("simulateTradeLoopFor2Pool", buyPriceCurve);
        perf.stop(poolC.poolAddress);

        const priceB = new BigNumber(priceMovementB.AverageSellPriceForFirstPool);
        const priceC = new BigNumber(priceMovementC.AverageBuyPriceForSecondPool);
        const priceDifference = priceB.minus(priceC);

        const loanFeeV3 = await calculateLoanFeeV3(loanAmount, priceMovementB.InitialPriceForFirstPool);
        const gasPrice = await calculateGasPrice(priceMovementB.InitialPriceForFirstPool);

        const totalOutUSDC = new BigNumber(priceMovementB.TotalGiveStableCoinsFromSellToken);
        const totalInUSDC = new BigNumber(priceMovementC.TotalPayStableCoinsForBuyToken);
        const amountDifference = totalOutUSDC.minus(totalInUSDC).minus(loanFeeV3).minus(gasPrice);

        const profitPercent = amountDifference.div(loanAmount * priceMovementB.InitialPriceForFirstPool).times(100);

        return {
            poolA,
            poolB,
            poolC,
            priceDifference,
            profit: amountDifference,
            roi: profitPercent,
            isProfitable: profitPercent.gt(0),
            path: [poolA.poolAddress, poolB.poolAddress, poolC.poolAddress],
        };
    } catch (err) {
        engineLog.error(`Simulation error: ${err.message}`);
        return null;
    }
}

async function calculateGasPrice(tokenPrice) {
    try {
        const provider = new ethers.JsonRpcProvider(RPC.ARBITRUM);
        const gasPriceWei = await provider.send("eth_gasPrice", []);
        const gasPriceGwei = parseFloat(ethers.formatUnits(gasPriceWei, "gwei"));
        const gasLimit = 250000; // move to config
        const gasCostUSDC = new BigNumber(gasPriceGwei).times(gasLimit).times(tokenPrice).div(1e9);

        return gasCostUSDC;
    }
    catch (error) {
        logger.error(`[calculateLoanFeeandGas] Error: ${error.message}`);
        throw error;
    }
}

async function calculateLoanFeeV3(loanAmount, tokenPrice) {
    try {
        const flashLoanFeeRate = 0.0009; // move to config
        const flashLoanFeeETH = new BigNumber(loanAmount).times(flashLoanFeeRate);
        const flashLoanFeeUSDC = flashLoanFeeETH.times(tokenPrice);

        return flashLoanFeeUSDC;
    }
    catch (error) {
        logger.error(`[calculateLoanFeeandGas] Error: ${error.message}`);
        throw error;
    }
}

export async function initArbEngineCore(pools, loanAmount) {
    engineLog.info('Grouping pools by token pairs...');
    const grouped = groupPoolsByTokenPair(pools);
    engineLog.info(`Grouped into ${grouped.size} unique token pairs`);

    const triplets = getValidTripletsFromGroups(grouped);
    engineLog.info(`Generated ${triplets.length} valid triplets`);

    const finalResults = [];

    for (const baseTriplet of triplets) {
        const permutations = getPermutations(baseTriplet);
        let best = null;

        for (const [poolA, poolB, poolC] of permutations) {
            const result = await simulateArbitrageLoop(poolA, poolB, poolC, loanAmount, false);
            if (result) {
                const absDiff = result.priceDifference.abs();
                if (!best || absDiff.lt(best.priceDifference.abs())) {
                    best = result;
                }
            }
        }

        if (best) {
            finalResults.push(best);
            engineLog.info(`+ ROI: ${best.roi.toFixed(2)}% | Profit: ${best.profit.toFixed(6)} | Path: ${best.path.join(' → ')}`);

            const perf_json = perf.export_json();
            const str = JSON.stringify(perf_json);
            fs.writeFileSync(writeFileDestination, str);
        }
    }

    if (finalResults.length === 0) {
        engineLog.info('No profitable arbitrage paths found.');
        return [];
    }

    const sorted = finalResults.sort((a, b) => b.profit.minus(a.profit));
    const top = sorted[0];

    engineLog.info(`Best arbitrage → Profit: ${top.profit.toFixed(6)} | ROI: ${top.roi.toFixed(2)}% | Path: ${top.path.join(' → ')}`);

    return sorted;
}
