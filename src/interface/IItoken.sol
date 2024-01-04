// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface Iitoken{

	function mint(address account, uint256 amount) external;
	function burn(address account, uint256 amount) external;
	function balanceOf(address account) external view returns (uint256);
	function totalSupply() external view returns (uint256);
    
}