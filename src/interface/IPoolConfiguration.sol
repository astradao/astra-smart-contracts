// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface IPoolConfiguration{

	 function checkDao(address daoAddress) external returns(bool);
	 function getperformancefees() external view returns(uint256);
	 function paymentContractAddress() external view returns(address);
	 function getmaxTokenSupported() external view returns(uint256);
	 function getslippagerate() external view returns(uint256);
	 function getoracleaddress() external view returns(address);
	 function getEarlyExitfees() external view returns(uint256);
	 function checkStableCoin(address _stable) external view returns(bool);
	 function treasuryAddress() external view returns(address);
	 function isAdmin(address _address) external view returns(bool);
	 function isBlackListed(address _address) external pure returns(bool);
     
}