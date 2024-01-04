// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface DexAggregator{
	function getBestExchangeRate(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external returns (uint256 amountOut, address[] memory, address);
    
	function swapFromBestExchange(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external payable returns(uint256);

}
