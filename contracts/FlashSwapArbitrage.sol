// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUniswapV3Pool {
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

/**
 * @title FlashSwapArbitrage
 * @notice Executes arbitrage using a Uniswap V3 flash swap between two pools.
 * @dev This contract assumes the bot calculates all parameters off-chain.
 */
contract FlashSwapArbitrage {
    uint160 private constant MIN_SQRT_RATIO = 4295128739;
    uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    /**
     * @notice Entry point for flash swap-based arbitrage.
     * @param pool0 Uniswap pool to borrow from
     * @param pool1 Uniswap pool to sell into (different pool)
     * @param tokenIn Token to borrow
     * @param tokenOut Token to trade into
     * @param amountIn Amount to borrow
     */
    function flashSwap(
        address pool0,
        address pool1,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external {
        bool zeroForOne = tokenIn < tokenOut;
        uint160 sqrtPriceLimitX96 = zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1;

        bytes memory data = abi.encode(
            msg.sender,
            pool0,
            pool1,
            tokenIn,
            tokenOut,
            amountIn,
            zeroForOne
        );

        IUniswapV3Pool(pool0).swap({
            recipient: address(this),
            zeroForOne: zeroForOne,
            amountSpecified: int256(amountIn),
            sqrtPriceLimitX96: sqrtPriceLimitX96,
            data: data
        });
    }

    /**
     * @dev Called back by pool after flash swap. Executes arbitrage and repayment.
     */
    function uniswapV3SwapCallback(
        int256 amount0,
        int256 amount1,
        bytes calldata data
    ) external {
        (
            address caller,
            address pool0,
            address pool1,
            address tokenIn,
            address tokenOut,
            uint256 amountIn,
            bool zeroForOne
        ) = abi.decode(data, (address, address, address, address, address, uint256, bool));

        require(msg.sender == pool0, "Callback only allowed from pool0");

        uint256 amountOut = zeroForOne ? uint256(-amount1) : uint256(-amount0);

        // Approve pool1 to spend tokenOut
        IERC20(tokenOut).approve(pool1, amountOut);

        // Reverse direction for swap back
        bool reverse = !zeroForOne;
        uint160 sqrtPriceLimitX96 = reverse ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1;

        bytes memory empty;
        IUniswapV3Pool(pool1).swap(
            address(this),
            reverse,
            int256(amountOut),
            sqrtPriceLimitX96,
            empty
        );

        // Repay flash swap loan
        IERC20(tokenIn).transfer(pool0, amountIn);

        // Transfer profit to initiator
        uint256 balance = IERC20(tokenIn).balanceOf(address(this));
        require(balance > amountIn, "FlashSwap: No profit");
        IERC20(tokenIn).transfer(caller, balance - amountIn);
    }
}
