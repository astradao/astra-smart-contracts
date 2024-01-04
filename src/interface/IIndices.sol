// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface Iindices {

	struct PoolUser 
    {   
		// Balance of user in pool
        uint256 currentBalance;
		// Number of rebalance pupto which user account is synced 
        uint256 currentPool; 
		// Pending amount for which no tokens are bought
        uint256 pendingBalance; 
		// Total amount deposited in stable coin.
		uint256 USDTdeposit;
		// ioktne balance for that pool. This will tell the total itoken balance either staked at chef or hold at account.
		uint256 Itokens;
		// Check id user account is active
        bool active;
    } 

	function poolUserInfo(uint256 poolId, address userAddress) external pure returns(PoolUser memory);
}