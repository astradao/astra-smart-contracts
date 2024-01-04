// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "./ISwapRouter.sol";

interface IUniswapV3Router is ISwapRouter {

    function refundETH() external payable;

    function factory() external pure returns (address);

    function WETH9() external pure returns (address);

}