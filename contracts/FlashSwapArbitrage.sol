// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

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
    address public constant SWAP_ROUTER_02 = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    ISwapRouter02 public constant router = ISwapRouter02(SWAP_ROUTER_02);

    uint160 private constant MIN_SQRT_RATIO = 4295128739;
    uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    /**
     * @notice Entry point for flash swap-based arbitrage.
     * @param pool0 Uniswap pool to borrow from
     * @param fee1 Fee tier for secondary swap
     * @param tokenIn Token to borrow
     * @param tokenOut Token to trade into
     * @param amountIn Amount to borrow
     */
    function flashSwap(
        address pool0,
        uint24 fee1,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external {
        bool zeroForOne = tokenIn < tokenOut;
        uint160 sqrtPriceLimitX96 = zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1;

        bytes memory data = abi.encode(
            msg.sender,
            pool0,
            fee1,
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
     * @dev Swap via Uniswap router.
     */
    function _swap(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMin
    ) private returns (uint256 amountOut) {
        IERC20(tokenIn).approve(address(router), amountIn);

        ISwapRouter02.ExactInputSingleParams memory params = ISwapRouter02.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0
        });

        amountOut = router.exactInputSingle(params);
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
            uint24 fee1,
            address tokenIn,
            address tokenOut,
            uint256 amountIn,
            bool zeroForOne
        ) = abi.decode(data, (address, address, uint24, address, address, uint256, bool));

        uint256 amountOut = zeroForOne ? uint256(-amount1) : uint256(-amount0);

        // Perform secondary swap back to tokenIn
        uint256 boughtBack = _swap(tokenOut, tokenIn, fee1, amountOut, amountIn);

        uint256 profit = boughtBack - amountIn;
        require(profit > 0, "FlashSwap: No profit");

        // Repay flash swap
        IERC20(tokenIn).transfer(pool0, amountIn);

        // Send profit to initiator
        IERC20(tokenIn).transfer(caller, profit);
    }
}
