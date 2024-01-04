// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IindicesPayment{

	function validateIndicesCreation(address _userAddress) external returns(bool);
    
}