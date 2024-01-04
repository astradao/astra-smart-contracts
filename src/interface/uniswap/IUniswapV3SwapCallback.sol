// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IUniswapV3SwapCallback {

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external;
    
}