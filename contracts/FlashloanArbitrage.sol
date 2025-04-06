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
 * @notice This contract performs a Uniswap V3 flashloan and swaps the borrowed tokens back and forth to profit from arbitrage opportunities.
 * The deal profitability is determined off-chain by a C++ bot. The bot triggers the flashloan only if it detects a profitable arbitrage.
 */
contract FlashloanArbitrage is IUniswapV3FlashCallback, Ownable {
    using SafeERC20 for IERC20;

    address public immutable UNISWAP_POOL;    // Address of the Uniswap V3 pool to borrow from
    address public immutable UNISWAP_ROUTER;  // Address of the Uniswap V3 router for swaps

    constructor(address pool, address router) Ownable(msg.sender) {
        UNISWAP_POOL = pool;
        UNISWAP_ROUTER = router;
    }

    /**
     * @notice Called externally (by your bot) to initiate the flashloan.
     * @param token0 Address of token0 in the Uniswap pair (the one you're borrowing)
     * @param token1 Address of token1 in the Uniswap pair (optional, set to address(0) if unused)
     * @param amount0 Amount of token0 to borrow
     * @param amount1 Amount of token1 to borrow
     * The flashloan will automatically trigger uniswapV3FlashCallback(...) with the encoded data.
     */
    function requestFlashLoan(address token0, address token1, uint256 amount0, uint256 amount1) external onlyOwner {
        IUniswapV3Pool(UNISWAP_POOL).flash(address(this), amount0, amount1, abi.encode(token0, token1));
    }

    /**
     * @notice This callback is triggered by the Uniswap pool after it sends the flashloaned tokens.
     * Here we perform the arbitrage: token0 → token1 → token0 (or any other logic).
     * The C++ bot must precompute the expected profit and only call requestFlashLoan if it's profitable.
     */
    function uniswapV3FlashCallback(
        uint256 fee0, // Fee for token0
        uint256 /* fee1 */, // Fee for token1 (currently unused)
        bytes calldata data // Encoded data from the flash call
    ) external override {
        require(msg.sender == UNISWAP_POOL, "Invalid caller");

        (address token0, address token1) = abi.decode(data, (address, address));

        // ------------------------
        // Arbitrage for token0
        // ------------------------
        uint256 amountIn0 = IERC20(token0).balanceOf(address(this));
        require(amountIn0 > 0, "Token0: No balance received");

        IERC20(token0).approve(UNISWAP_ROUTER, amountIn0);

        ISwapRouter.ExactInputSingleParams memory params0 = ISwapRouter.ExactInputSingleParams({
            tokenIn: token0,
            tokenOut: token1,
            fee: 3000,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountIn0,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });

        uint256 amountOut0 = ISwapRouter(UNISWAP_ROUTER).exactInputSingle(params0);

        IERC20(token1).approve(UNISWAP_ROUTER, amountOut0);

        ISwapRouter.ExactInputSingleParams memory reverseParams0 = ISwapRouter.ExactInputSingleParams({
            tokenIn: token1,
            tokenOut: token0,
            fee: 3000,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountOut0,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });

        uint256 finalAmount0 = ISwapRouter(UNISWAP_ROUTER).exactInputSingle(reverseParams0);
        uint256 requiredRepayment0 = amountIn0 + fee0;

        require(finalAmount0 >= requiredRepayment0, "Token0: Not profitable");

        // Approve the pool to pull repayment for token0
        IERC20(token0).approve(UNISWAP_POOL, requiredRepayment0);
    }

    /**
     * @notice Withdraw ERC20 token profit to the owner wallet
     */
    function withdrawToken(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "Nothing to withdraw");
        IERC20(token).safeTransfer(owner(), balance);
    }

    /**
     * @notice Withdraw native ETH (if contract has any)
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        payable(owner()).transfer(balance);
    }

    /**
     * @notice Returns the current ERC20 token balance held by the contract
     */
    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Allows contract to receive ETH if needed by any DEXes
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
