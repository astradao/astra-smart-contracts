// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface ChefInterface{

    function checkHighestStaker(address user) external view returns (bool);
    
    function stakingScoreAndMultiplier(
        address _userAddress,
        uint256 _stakedAmount
    )
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );
    
    function depositWithUserAddress(
        uint256 _amount,
        uint256 _vault,
        address _userAddress
    ) external;

    function userInfo(uint256 _pid, address _userAddress) external view returns (uint256, uint256, uint256, uint256, uint256, bool,uint256);

    function distributeExitFeeShare(uint256 _amount) external;
    
    function distributeAdditionalReward(uint256 _rewardAmount) external;

}