// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./interface/KeeperCompatible.sol";

interface IMAsterChef{
	function depositWithUserAddress(uint256 _pid, uint256 _amount, uint256 vault, address _sender) external;
	function distributeExitFeeShare(uint256 _amount) external;
    function distributeAdditionalReward(uint256 _rewardAmount) external;
}

contract IndicesSplit is Initializable, Ownable2StepUpgradeable, KeeperCompatibleInterface, ReentrancyGuardUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // The ASTRA TOKEN!
    IERC20Upgradeable public astra;

    address public treasury;
    address public chef;

    uint256 public constant TOTAL_FEES = 10000;
    uint256 public stakingContractPercentage;
    uint256 public totalDeposited;
    uint256 public remaining;
    uint256 public distributedBalance;
    uint256 public threshold;

    event Distribute(uint256 indexed _amount);
    event UpdateThresholdValue(uint256 indexed _threshold);
    event UpdatePercentage(uint256 indexed _stakingContractPercentage);
    event UpdateTreasuryAddresss(address indexed _treasury);
    event UpdateChefAddresss(address indexed _chef);

    /**
    @notice This function is used for initializing the contract with sort of parameter.
    @dev Description :
    This function is basically used to initialize the necessary things of indices fees slpit contract and set the owner of the
    contract. This function definition is marked "external" because this fuction is called only from outside the contract.
    */
    function initialize(
        IERC20Upgradeable _astra,
        address _treasury,
        address _chef,
        uint256 _stakingContractPercentage,
        uint256 _threshold
    ) external initializer {
        require(address(_astra) != address(0), "Zero Address");
        __Ownable2Step_init();
        __ReentrancyGuard_init();
        astra = _astra;
        chef = _chef;
        treasury = _treasury;
        stakingContractPercentage = _stakingContractPercentage;
        threshold = _threshold;
    }
     /**
     * @dev Public function to distribute rewards when contract is eligible for distribution.
     */
    function distribute() public nonReentrant {
        uint256 _currentContractBalance = astra.balanceOf(address(this));
        require(_currentContractBalance >= threshold, "Threshold not reached");
        uint256 stakingContracRewards = _currentContractBalance.mul(stakingContractPercentage).div(TOTAL_FEES);
    
        astra.safeTransfer(treasury, _currentContractBalance.sub(stakingContracRewards));        
        astra.approve(chef,stakingContracRewards);
        
        IMAsterChef(chef).distributeAdditionalReward(stakingContracRewards);
        
        totalDeposited = totalDeposited.add(_currentContractBalance);
        distributedBalance = distributedBalance.add(stakingContracRewards);
        emit Distribute(stakingContracRewards);
    }

     /**
     * @dev Chainlink call this function to verify before call automation function.
     */
    function checkUpkeep(bytes calldata checkData)
        external
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        uint256 _currentContractBalance = astra.balanceOf(address(this));
        upkeepNeeded = _currentContractBalance >= threshold;
    }

    /**
     * @dev Chainlink automation function that will release tokens to all users. This function is public and anyone can call this functions.
     */
    function performUpkeep(bytes calldata performData) external override {
        distribute();
    }

     /**
     * @dev Update Threshold value for automation.
     */
    function updateThresholdValue(uint256 _threshold) external onlyOwner {
        threshold = _threshold;
        emit UpdateThresholdValue(_threshold);
    }

     /**
     * @dev Update percentage value.
     */
    function updatePercentage(uint256 _stakingContractPercentage) external onlyOwner {
        stakingContractPercentage = _stakingContractPercentage;
        emit UpdatePercentage(_stakingContractPercentage);
    }

     /**
     * @dev Update treasury address.
     */
    function updateTreasuryAddresss(address _treasury) external onlyOwner {
        require(_treasury != address(0), "zero address");
        treasury = _treasury;
        emit UpdateTreasuryAddresss(_treasury);
    }
     
    /**
     * @dev Update treasury address.
     */
    function updateChefAddresss(address _chef) external onlyOwner {
        require(_chef != address(0), "zero address");
        chef = _chef;
        emit UpdateChefAddresss(_chef);
    }
}
