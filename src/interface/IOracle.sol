// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IOracle{

	function getiTokenDetails(uint _poolIndex) external returns(string memory, string memory,string memory); 
    function getTokenDetails(uint _poolIndex) external returns(address[] memory,uint[] memory,uint ,uint);

}
