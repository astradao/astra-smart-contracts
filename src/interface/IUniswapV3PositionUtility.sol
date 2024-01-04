// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IUniswapV3PositionUtility{

    function getAstraAmount (uint256 _tokenID) external view returns (uint256);

}