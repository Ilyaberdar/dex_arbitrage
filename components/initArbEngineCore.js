// initArbEngineCore.js

import { getLogger } from '../utils/log.js';
const engineLog = getLogger("engine");

import BigNumber from 'bignumber.js';

function buildTokenGraph(pools) {
    const graph = new Map();

    for (const pool of pools) {
        const { token0, token1 } = pool;

        if (!graph.has(token0)) graph.set(token0, []);
        if (!graph.has(token1)) graph.set(token1, []);

        graph.get(token0).push({ pool, from: token0, to: token1 });
        graph.get(token1).push({ pool, from: token1, to: token0 });
    }

    return graph;
}

async function simulatePath(route, tokenIn, amountIn) {
    let amount = new BigNumber(amountIn);
    let currentToken = tokenIn;

    for (const pool of route) {
        const result = await pool.simulateSwap(currentToken, amount);
        if (!result) return null;

        amount = new BigNumber(result.amountOut);
        currentToken = result.tokenOut;
    }

    const profit = amount.minus(amountIn);
    if (profit.isGreaterThan(0)) {
        return {
            route,
            initial: new BigNumber(amountIn),
            final: amount,
            profit,
            roi: profit.dividedBy(amountIn).multipliedBy(100)
        };
    }

    return null;
}

async function findProfitableCycles(graph, amountIn) {
    const profitablePaths = [];

    for (const [tokenA, edges1] of graph.entries()) {
        for (const edge1 of edges1) {
            const tokenB = edge1.to;

            for (const edge2 of graph.get(tokenB) || []) {
                const tokenC = edge2.to;
                if (tokenC === tokenA) continue;

                for (const edge3 of graph.get(tokenC) || []) {
                    if (edge3.to !== tokenA) continue;

                    const route = [edge1.pool, edge2.pool, edge3.pool];
                    const result = await simulatePath(route, tokenA, amountIn);
                    if (result) {
                        profitablePaths.push(result);
                    }
                }
            }
        }
    }

    return profitablePaths;
}

export async function initArbEngineCore(pools, amountIn) {
    engineLog.info('Building token graph...');
    const graph = buildTokenGraph(pools);

    for (const [token, edges] of graph.entries()) {
        const connections = edges.map(edge => edge.to).join(', ');
        engineLog.info(`Token ${token} → [ ${connections} ] (${edges.length} edges)`);
    }

    engineLog.info('Searching profitable cycles...');
    const results = await findProfitableCycles(graph, amountIn);

    engineLog.info(`Found ${results.length} profitable path(s)`);
    for (const res of results) {
        engineLog.info(`+ ROI: ${res.roi.toFixed(2)}% | Profit: ${res.profit.toFixed(6)} | Route: ${res.route.map(p => p.poolAddress || 'N/A').join(' → ')}`);
    }

    return results;
}
