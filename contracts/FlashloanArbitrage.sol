// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import {IUniswapV3FlashCallback} from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3FlashCallback.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title FlashloanArbitrage
 * @notice Fully configurable flashloan arbitrage contract. Parameters such as swap fees, minimum profit, and tokens are all passed by an off-chain bot.
 */
contract FlashloanArbitrage is IUniswapV3FlashCallback, Ownable {
    using SafeERC20 for IERC20;

    // Uniswap V3 pool from which the flash loan will be requested
    address public immutable UNISWAP_POOL;

    // Uniswap V3 router used for swapping tokens
    address public immutable UNISWAP_ROUTER;

    constructor(address pool, address router) Ownable(msg.sender) {
        UNISWAP_POOL = pool;
        UNISWAP_ROUTER = router;
    }

    /**
     * @notice External call from bot to initiate flashloan
     * @param token0 The token to borrow via flashloan
     * @param token1 The intermediate swap token (final return is also in token0)
     * @param amount0 The amount of token0 to borrow
     * @param amount1 The amount of token1 to borrow (optional, usually 0)
     * @param fee0 Fee tier for the first swap (token0 -> token1)
     * @param fee1 Fee tier for the reverse swap (token1 -> token0)
     * @param minProfit Minimum expected profit, used for reversion check
     */
    function requestFlashLoan(
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1,
        uint24 fee0,
        uint24 fee1,
        uint256 minProfit
    ) external onlyOwner {
        bytes memory data = abi.encode(token0, token1, fee0, fee1, minProfit);
        IUniswapV3Pool(UNISWAP_POOL).flash(address(this), amount0, amount1, data);
    }

    /**
     * @notice Callback from Uniswap pool after flashloan execution
     * @dev Performs the arbitrage logic and ensures repayment + profit
     * @param fee0 Flashloan fee for token0
     * @param data Encoded params passed from requestFlashLoan
     */
    function uniswapV3FlashCallback(
        uint256 fee0, // Fee for token0
        uint256 /* fee1 */, // Fee for token1 (currently unused)
        bytes calldata data // Encoded data from the flash call
    ) external override {
        require(msg.sender == UNISWAP_POOL, "Invalid pool callback");

        (
            address token0,
            address token1,
            uint24 feeSwap0,
            uint24 feeSwap1,
            uint256 minProfit
        ) = abi.decode(data, (address, address, uint24, uint24, uint256));

        // Get the borrowed amount of token0
        uint256 amountIn = IERC20(token0).balanceOf(address(this));
        require(amountIn > 0, "No token0 received");

        // Approve Uniswap router to spend token0
        IERC20(token0).approve(UNISWAP_ROUTER, amountIn);

        // Swap token0 -> token1
        ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter.ExactInputSingleParams({
            tokenIn: token0,
            tokenOut: token1,
            fee: feeSwap0,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });

        uint256 swappedOut = ISwapRouter(UNISWAP_ROUTER).exactInputSingle(swapParams);

        // Approve Uniswap router to spend token1
        IERC20(token1).approve(UNISWAP_ROUTER, swappedOut);

        // Swap token1 -> token0
        ISwapRouter.ExactInputSingleParams memory reverseSwap = ISwapRouter.ExactInputSingleParams({
            tokenIn: token1,
            tokenOut: token0,
            fee: feeSwap1,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: swappedOut,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });

        uint256 finalAmount = ISwapRouter(UNISWAP_ROUTER).exactInputSingle(reverseSwap);

        // Calculate what we owe back to the pool
        uint256 requiredRepayment = amountIn + fee0;

        // Check if the operation was profitable
        require(finalAmount >= requiredRepayment + minProfit, "Not profitable");

        // Approve repayment
        IERC20(token0).approve(UNISWAP_POOL, requiredRepayment);
    }

    /**
     * @notice Withdraw profit (ERC20 token) to owner
     */
    function withdrawToken(address token) external onlyOwner {
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "Nothing to withdraw");
        IERC20(token).safeTransfer(owner(), bal);
    }

    /**
     * @notice Withdraw native ETH (if any) to owner
     */
    function withdrawETH() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No ETH to withdraw");
        payable(owner()).transfer(bal);
    }

    /**
     * @notice Return contract token balance
     */
    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Allow contract to receive ETH from swaps
     */
    receive() external payable {}

    /**
     * @dev How to interact with this contract:
     * 1. Deploy this contract with constructor(poolAddress, routerAddress)
     * 2. bot monitor DEX prices off-chain
     * 3. If a profitable arbitrage is found:
     *      a. Encode token0/token1
     *      b. Call requestFlashLoan(token0, token1, amount0, 0)
     * 4. The callback will execute automatically
     * 5. Flashloan is repaid if profitable, otherwise transaction reverts
     * 6. Call withdrawToken(token) or withdrawETH() to retrieve profits
     */
}
