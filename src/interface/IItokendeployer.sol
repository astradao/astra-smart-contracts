// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface Iitokendeployer{

	function createnewitoken(string calldata _name, string calldata _symbol) external returns(address);
    
}