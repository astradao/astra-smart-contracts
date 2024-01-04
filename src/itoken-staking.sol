// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interface/IChefV2.sol";
import "./interface/IIndices.sol";
import "@arbitrum/nitro-contracts/src/precompiles/ArbSys.sol";


interface IERC20Decimal {
    function decimals() external view returns (uint8);  
}


contract ItokenStaking is Initializable, Ownable2StepUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        uint256 maxStakingScore;
        uint256 maxMultiplier;
        uint256 lastDeposit;
        bool cooldown;
        uint256 cooldowntimestamp;
        //
        // We do some fancy math here. Basically, any point in time, the amount of ASTRAs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accAstraPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accAstraPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // Info of each pool.
    struct PoolInfo {
        uint256 allocPoint; // How many allocation points assigned to this pool. ASTRAs to distribute per block.
        uint256 lastRewardBlock; // Last block number that ASTRAs distribution occurs.
        uint256 accAstraPerShare; // Accumulated ASTRAs per share, times 1e12. See below.
        uint256 totalStaked;
        uint256 maxMultiplier; // Total Astra staked amount.
    }

    struct ItokenInfo {
        IERC20Upgradeable itoken;
        uint256 decimal;
        uint256 poolId;
    }

    //staking info structure
    struct StakeInfo {
        uint256 amount;
        uint256 timestamp;
        uint256 vault;
        uint256 withdrawTime;
        uint256 itokenId;
        uint256 itokenAmount;
    }

    // The ASTRA TOKEN!
    IERC20Upgradeable public astra;
    Iindices public indicesContract;
    // Governance address.
    address public governanceAddress;
    address public astraStakingContract;

    // Block number when bonus ASTRA period ends.
    uint256 public bonusEndBlock;
    // ASTRA tokens created per block.
    uint256 public astraPerBlock;
    uint256 public constant ZERO_MONTH_VAULT = 0;
    uint256 public constant SIX_MONTH_VAULT = 6;
    uint256 public constant NINE_MONTH_VAULT = 9;
    uint256 public constant TWELVE_MONTH_VAULT = 12;
    uint256 public constant AVG_STAKING_SCORE_CAL_TIME = 60;
    uint256 public constant MAX_STAKING_SCORE_CAL_TIME_SECONDS = 5184000;
    uint256 public constant SECONDS_IN_DAY = 86400;
    uint256 public constant STAKING_SCORE_TIME_CONSTANT = 5184000;
    uint256 public constant VAULT_MULTIPLIER_FOR_STAKING_SCORE = 5;
    uint256 public constant MULTIPLIER_DECIMAL = 10000000000000;
    uint256 public constant SLASHING_FEES_CONSTANT = 90;
    uint256 public constant DEFAULT_POOL = 0;
    address public constant ARBSYS_ADDRESS = 0x0000000000000000000000000000000000000064;
    // Info of each pool.
    PoolInfo[] public poolInfo;

    ItokenInfo[] public itokenInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint;
    // The block number when ASTRA rewards distribution starts.
    uint256 public startBlock;
    uint256 public totalRewards;
    uint256 public maxPerBlockReward;
    uint256 public constant coolDownPeriodTime = 1;
    uint256 public constant coolDownClaimTime = 1;

    mapping(uint256 => mapping(address => uint256)) private userStakeCounter;
    mapping(uint256 => mapping(address => mapping(uint256 => StakeInfo)))
        public userStakeInfo;
    mapping(uint256 => bool) public isValidVault;
    mapping(uint256 => uint256) public usersTotalStakedInVault;
    mapping(uint256 => uint256) public stakingVaultMultiplier;

    mapping(address => bool) public isAllowedContract;

    mapping(address => uint256) public unClaimedReward;
    bool private isFirstDepositInitialized;

    mapping(uint256 => mapping(address => uint256)) public averageStakedTime;
    mapping(address => bool) public eligibleDistributionAddress;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );
    event EmergencyAstraWithdraw(
        address indexed user,
        uint256 amount
    );
    event DistributeReward(uint256 indexed rewardAmount);
    event AddVault(uint256 indexed _vault, uint256 indexed _vaultMultiplier);
    event WhitelistDepositContract(address indexed _contractAddress, bool indexed _value);
    event SetGovernanceAddress(address indexed _governanceAddress);
    event Set(uint256 indexed _allocPoint, bool _withUpdate);
    event SetIndicesContractAddress(Iindices indexed _indicesContract);
    event SetAstraStakingContract(address indexed _astraStakingContract);
    event RestakedReward(address _userAddress, uint256 indexed _amount);
    event ClaimedReward(address _userAddress, uint256 indexed _amount);
    event ReduceReward(uint256 indexed _rewardAmount, uint256 indexed _newPerBlockReward);


    /**
    @notice This function is used for initializing the contract with sort of parameter
    @param _astra : astra contract address
    @param _startBlock : start block number for starting rewars distribution
    @param _bonusEndBlock : end block number for ending reward distribution
    @param _totalRewards : Total ASTRA rewards
    @dev Description :
    This function is basically used to initialize the necessary things of chef contract and set the owner of the
    contract. This function definition is marked "external" because this fuction is called only from outside the contract.
    */
    function initialize(
        IERC20Upgradeable _astra,
        Iindices _indicesContract,
        uint256 _startBlock,
        uint256 _bonusEndBlock,
        uint256 _totalRewards
    ) external initializer {
        require(address(_astra) != address(0), "Zero Address");
        __Ownable2Step_init();
        astra = _astra;
        indicesContract = _indicesContract;
        bonusEndBlock = _bonusEndBlock;
        startBlock = _startBlock;
        totalRewards = _totalRewards;
        maxPerBlockReward = totalRewards.div(bonusEndBlock.sub(startBlock));
        astraPerBlock = totalRewards.div(bonusEndBlock.sub(startBlock));
        isValidVault[ZERO_MONTH_VAULT] = true;
        isValidVault[SIX_MONTH_VAULT] = true;
        isValidVault[NINE_MONTH_VAULT] = true;
        isValidVault[TWELVE_MONTH_VAULT] = true;
        stakingVaultMultiplier[ZERO_MONTH_VAULT] = 10000000000000;
        stakingVaultMultiplier[SIX_MONTH_VAULT] = 11000000000000;
        stakingVaultMultiplier[NINE_MONTH_VAULT] = 13000000000000;
        stakingVaultMultiplier[TWELVE_MONTH_VAULT] = 18000000000000;
        // updateRewardRate(startBlock,1, 1, 0);
        add(100);
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    function add(
        uint256 _allocPoint
    ) internal {
        uint256 lastRewardBlock = ArbSys(ARBSYS_ADDRESS).arbBlockNumber() > startBlock
            ? ArbSys(ARBSYS_ADDRESS).arbBlockNumber()
            : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(
            PoolInfo({
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accAstraPerShare: 0,
                totalStaked: 0,
                maxMultiplier: MULTIPLIER_DECIMAL
            })
        );
    }

    // Add a new itoken to the pool. Can only be called by the owner.
    // XXX DO NOT add the same itoken token more than once. Rewards will be messed up if you do.
    function addItoken(
        address _itoken,
        uint256 _poolId
    ) public onlyOwner {
        updatePool();
        itokenInfo.push(
            ItokenInfo({
                itoken: IERC20Upgradeable(_itoken),
                decimal: IERC20Decimal(_itoken).decimals(),
                poolId: _poolId
            })
        );
    }

    /**
    @notice Add vault month. Can only be called by the owner.
    @param _vault : value of month like 0, 3, 6, 9, 12.
    @param _vaultMultiplier: Vault multiplier.
    @dev    this function definition is marked "external" because this fuction is called only from outside the contract.
    */
    function addVault(uint256 _vault, uint256 _vaultMultiplier) external onlyOwner {
        isValidVault[_vault] = true;
        stakingVaultMultiplier[_vault] = _vaultMultiplier;
        emit AddVault(_vault, _vaultMultiplier);
    }

    /**
    @notice Add contract address. Can only be called by the owner.
    @param _contractAddress : Contract address.
    @dev    Add contract address for external dposit.
    */
    function whitelistDepositContract(address _contractAddress, bool _value)
        external
        onlyOwner
    {
        isAllowedContract[_contractAddress] = _value;
        emit WhitelistDepositContract(_contractAddress, _value);
    }

    // Update governance contract address.
    function setGovernanceAddress(address _governanceAddress)
        external
        onlyOwner
    {
        governanceAddress = _governanceAddress;
        emit SetGovernanceAddress(_governanceAddress);
    }

    // Update Indices contract address.
    function setIndicesContractAddress(Iindices _indicesContract)
        external
        onlyOwner
    {
        indicesContract = _indicesContract;
        emit SetIndicesContractAddress(_indicesContract);
    }

    // Update Astra staking contract.
    function setAstraStakingContract(address _astraStakingContract)
        external
        onlyOwner
    {
        astraStakingContract = _astraStakingContract;
        emit SetAstraStakingContract(_astraStakingContract);
    }

    // Update the given pool's ASTRA allocation point. Can only be called by the owner.
    function set(
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            updatePool();
        }
        totalAllocPoint = totalAllocPoint.sub(poolInfo[DEFAULT_POOL].allocPoint).add(
            _allocPoint
        );
        poolInfo[DEFAULT_POOL].allocPoint = _allocPoint;
        emit Set(_allocPoint, _withUpdate);
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        if (_to <= bonusEndBlock) {
            return _to.sub(_from);
        } else if (_from >= bonusEndBlock) {
            return _to.sub(_from);
        } else {
            return
                bonusEndBlock.sub(_from).add(
                    _to.sub(bonusEndBlock)
                );
        }
    }

    // View function to see pending ASTRAs on frontend.
    function pendingAstra(address _user)
        external
        view
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[DEFAULT_POOL];
        UserInfo storage user = userInfo[DEFAULT_POOL][_user];
        uint256 accAstraPerShare = pool.accAstraPerShare;
        uint256 lpSupply = pool.totalStaked;
        uint256 PoolEndBlock = ArbSys(ARBSYS_ADDRESS).arbBlockNumber();
        uint256 userMultiplier;
        if (ArbSys(ARBSYS_ADDRESS).arbBlockNumber() > bonusEndBlock) {
            // If current block number is greater than bonusEndBlock than PoolEndBlock will have the bonusEndBlock value.
            // otherwise it will have current block number value.
            PoolEndBlock = bonusEndBlock;
        }
        if (ArbSys(ARBSYS_ADDRESS).arbBlockNumber() > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = getMultiplier(
                pool.lastRewardBlock,
                PoolEndBlock
            );
            uint256 astraReward = multiplier
                .mul(astraPerBlock)
                .mul(pool.allocPoint)
                .div(totalAllocPoint);
            accAstraPerShare = accAstraPerShare.add(
                astraReward.mul(1e12).div(lpSupply)
            );
        }
        (, userMultiplier, ) = stakingScoreAndMultiplier(
            _user,
            user.amount
        );
        return
            unClaimedReward[_user]
                .add(
                    (
                        user.amount.mul(accAstraPerShare).div(1e12).sub(
                            user.rewardDebt
                        )
                    )
                )
                .mul(userMultiplier)
                .div(MULTIPLIER_DECIMAL);
    }

    function restakeAstraReward() public {
        updatePool();
        PoolInfo storage pool = poolInfo[DEFAULT_POOL];
        UserInfo storage user = userInfo[DEFAULT_POOL][msg.sender];
        uint256 userMultiplier;
        uint256 userMaxMultiplier;
        uint256 slashedReward;
        uint256 claimableReward;

        (, userMultiplier, userMaxMultiplier) = stakingScoreAndMultiplier(
            msg.sender,
            user.amount
        );

        claimableReward = unClaimedReward[msg.sender].add(
            (
                user.amount.mul(pool.accAstraPerShare).div(1e12).sub(
                    user.rewardDebt
                )
            )
        );

        claimableReward = claimableReward
            .mul(userMaxMultiplier)
            .div(MULTIPLIER_DECIMAL);

        astra.approve(astraStakingContract,claimableReward);
        ChefInterface(astraStakingContract).depositWithUserAddress(claimableReward, SIX_MONTH_VAULT, msg.sender);
        user.rewardDebt = user.amount.mul(pool.accAstraPerShare).div(1e12);
        updateRewardRate(
            pool.lastRewardBlock,
            pool.maxMultiplier,
            slashedReward
        );
        unClaimedReward[msg.sender] = 0;
        emit RestakedReward(msg.sender, claimableReward);
    }

    function claimAstra() public {
        updatePool();
        PoolInfo storage pool = poolInfo[DEFAULT_POOL];
        UserInfo storage user = userInfo[DEFAULT_POOL][msg.sender];
        uint256 userMultiplier;
        uint256 userMaxMultiplier;
        uint256 slashedReward;
        uint256 claimableReward;
        uint256 slashingFees;

        (, userMultiplier, userMaxMultiplier) = stakingScoreAndMultiplier(
            msg.sender,
            user.amount
        );
        claimableReward = unClaimedReward[msg.sender].add(
            (
                user.amount.mul(pool.accAstraPerShare).div(1e12).sub(
                    user.rewardDebt
                )
            )
        );
        if (userMaxMultiplier > userMultiplier) {
            slashedReward = (
                claimableReward.mul(userMaxMultiplier).sub(
                    claimableReward.mul(userMultiplier)
                )
            ).div(MULTIPLIER_DECIMAL);
        }

        claimableReward = claimableReward
            .mul(userMaxMultiplier)
            .div(MULTIPLIER_DECIMAL)
            .sub(slashedReward);
        uint256 slashDays = block.timestamp.sub(averageStakedTime[DEFAULT_POOL][msg.sender]).div(
            SECONDS_IN_DAY
        );
        if (slashDays < 90) {
            slashingFees = claimableReward
                .mul(SLASHING_FEES_CONSTANT.sub(slashDays))
                .div(100);
        }
        slashedReward = slashedReward.add(slashingFees);
        user.rewardDebt = user.amount.mul(pool.accAstraPerShare).div(1e12);
        safeAstraTransfer(msg.sender, claimableReward.sub(slashingFees));
        updateRewardRate(
            pool.lastRewardBlock,
            pool.maxMultiplier,
            slashedReward
        );
        unClaimedReward[msg.sender] = 0;
        emit ClaimedReward(msg.sender, claimableReward.sub(slashingFees));
    }

    function updateUserAverageSlashingFees(address _userAddress, uint256 previousDepositAmount, uint256 newDepositAmount, uint256 currentTimestamp) internal {
        if(averageStakedTime[DEFAULT_POOL][_userAddress] == 0){
            averageStakedTime[DEFAULT_POOL][_userAddress] = currentTimestamp;
        }else{
            uint256 previousDepositedWeight = averageStakedTime[DEFAULT_POOL][_userAddress].mul(previousDepositAmount);
            uint256 newDepositedWeight = newDepositAmount.mul(currentTimestamp);
            averageStakedTime[DEFAULT_POOL][_userAddress] = newDepositedWeight.add(previousDepositedWeight).div(previousDepositAmount.add(newDepositAmount));
        }
    }

    function updateRewardRate(
        uint256 lastUpdatedBlock,
        uint256 newMaxMultiplier,
        uint256 slashedReward
    ) internal {
        uint256 _startBlock = lastUpdatedBlock >= bonusEndBlock
            ? bonusEndBlock
            : lastUpdatedBlock;
        uint256 blockLeft = bonusEndBlock.sub(_startBlock);
        if (blockLeft > 0) {
            if (!isFirstDepositInitialized) {
                maxPerBlockReward = totalRewards.div(blockLeft);
                isFirstDepositInitialized = true;
            } else {
                maxPerBlockReward = slashedReward
                    .add(maxPerBlockReward.mul(blockLeft))
                    .mul(MULTIPLIER_DECIMAL)
                    .div(blockLeft)
                    .div(MULTIPLIER_DECIMAL);
            }
            astraPerBlock = blockLeft
                .mul(maxPerBlockReward)
                .mul(MULTIPLIER_DECIMAL)
                .div(blockLeft)
                .div(newMaxMultiplier);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool() public {
        PoolInfo storage pool = poolInfo[DEFAULT_POOL];
        // PoolEndBlock is nothing just contains the value of end block.
        uint256 PoolEndBlock = ArbSys(ARBSYS_ADDRESS).arbBlockNumber();
        if (ArbSys(ARBSYS_ADDRESS).arbBlockNumber() > bonusEndBlock) {
            // If current block number is greater than bonusEndBlock than PoolEndBlock will have the bonusEndBlock value.
            // otherwise it will have current block number value.
            PoolEndBlock = bonusEndBlock;
        }
        if (ArbSys(ARBSYS_ADDRESS).arbBlockNumber() <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.totalStaked;
        if (lpSupply == 0) {
            pool.lastRewardBlock = PoolEndBlock;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, PoolEndBlock);
        uint256 astraReward = multiplier
            .mul(astraPerBlock)
            .mul(pool.allocPoint)
            .div(totalAllocPoint);
        pool.accAstraPerShare = pool.accAstraPerShare.add(
            astraReward.mul(1e12).div(lpSupply)
        );

        pool.lastRewardBlock = PoolEndBlock;
    }

    function calculateMultiplier(uint256 _stakingScore)
        public
        pure
        returns (uint256)
    {
        if (_stakingScore >= 100000 ether && _stakingScore < 300000 ether) {
            return 12000000000000;
        } else if (
            _stakingScore >= 300000 ether && _stakingScore < 800000 ether
        ) {
            return 13000000000000;
        } else if (_stakingScore >= 800000 ether) {
            return 17000000000000;
        } else {
            return 10000000000000;
        }
    }

    function stakingScoreAndMultiplier(
        address _userAddress,
        uint256 _stakedAmount
    )
        public
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 currentStakingScore;
        uint256 currentMultiplier;
        uint256 vaultMultiplier;
        uint256 multiplierPerStake;
        uint256 maxMultiplier;
        for (uint256 i = 0; i < userStakeCounter[DEFAULT_POOL][_userAddress]; i++) {
            StakeInfo memory stakerDetails = userStakeInfo[DEFAULT_POOL][_userAddress][
                i
            ];
            if (
                stakerDetails.withdrawTime == 0 ||
                stakerDetails.withdrawTime == block.timestamp
            ) {
                uint256 stakeTime = block.timestamp.sub(
                    stakerDetails.timestamp
                );
                stakeTime = stakeTime >= STAKING_SCORE_TIME_CONSTANT
                    ? STAKING_SCORE_TIME_CONSTANT
                    : stakeTime;
                multiplierPerStake = multiplierPerStake.add(
                    stakerDetails.amount.mul(
                        stakingVaultMultiplier[stakerDetails.vault]
                    )
                );
                uint256 decimalValue = uint256(18) > itokenInfo[stakerDetails.itokenId].decimal ? uint256(18).sub(itokenInfo[stakerDetails.itokenId].decimal) : 0;
                if (stakerDetails.vault == TWELVE_MONTH_VAULT) {
                    currentStakingScore = currentStakingScore.add(
                        stakerDetails.amount * 10 ** (decimalValue)
                    );
                } else {
                    uint256 userStakedTime = block.timestamp.sub(
                        stakerDetails.timestamp
                    ) >= MAX_STAKING_SCORE_CAL_TIME_SECONDS
                        ? MAX_STAKING_SCORE_CAL_TIME_SECONDS
                        : block.timestamp.sub(stakerDetails.timestamp);
                    uint256 tempCalculatedStakingScore = (
                        stakerDetails.amount.mul(userStakedTime)
                    ).div(
                            AVG_STAKING_SCORE_CAL_TIME
                                .sub(
                                    stakerDetails.vault.mul(
                                        VAULT_MULTIPLIER_FOR_STAKING_SCORE
                                    )
                                )
                                .mul(SECONDS_IN_DAY)
                        );
                    uint256 finalStakingScoreForCurrentStake = tempCalculatedStakingScore >=
                            stakerDetails.amount
                            ? stakerDetails.amount
                            : tempCalculatedStakingScore;
                    finalStakingScoreForCurrentStake = finalStakingScoreForCurrentStake * 10 ** (decimalValue);
                    currentStakingScore = currentStakingScore.add(
                        finalStakingScoreForCurrentStake
                    );
                }
            }
        }
        if (_stakedAmount == 0) {
            vaultMultiplier = MULTIPLIER_DECIMAL;
        } else {
            vaultMultiplier = multiplierPerStake.div(_stakedAmount);
        }
        currentMultiplier = vaultMultiplier
            .add(calculateMultiplier(currentStakingScore))
            .sub(MULTIPLIER_DECIMAL);
        maxMultiplier = vaultMultiplier
            .add(calculateMultiplier(_stakedAmount))
            .sub(MULTIPLIER_DECIMAL);
        return (currentStakingScore, currentMultiplier, maxMultiplier);
    }

    function updateUserDepositDetails(
        address _userAddress,
        uint256 _amount,
        uint256 _vault,
        uint256 _itokenId, 
        uint256 _itokenAmount
    ) internal {
        uint256 userstakeid = userStakeCounter[DEFAULT_POOL][_userAddress];
        // Fetch the stakeInfo which saved on stake id.
        StakeInfo storage staker = userStakeInfo[DEFAULT_POOL][_userAddress][
            userstakeid
        ];
        // Here sets the below values in the object.
        staker.amount = _amount;
        staker.itokenAmount = _itokenAmount;
        staker.timestamp = block.timestamp;
        staker.vault = _vault;
        staker.withdrawTime = 0;
        staker.itokenId = _itokenId;
        userStakeCounter[DEFAULT_POOL][_userAddress] = userStakeCounter[DEFAULT_POOL][
            _userAddress
        ].add(1);
    }

    function deposit(
        uint256 _itokenId,
        uint256 _amount,
        uint256 _vault
    ) external {
        require(_amount > 0, "Amount should be greater than 0");
        itokenInfo[_itokenId].itoken.safeTransferFrom(
            address(msg.sender),
            address(this),
            _amount
        );
        _deposit(_amount, _vault, msg.sender, _itokenId);
    }

    // This function will be used by other contracts to deposit on user's behalf.
    function depositWithUserAddress(
        uint256 _itokenId,
        uint256 _amount,
        uint256 _vault,
        address _userAddress
    ) external {
        require(isAllowedContract[msg.sender], "Invalid sender");
        require(_amount > 0, "Amount should be greater than 0");
        itokenInfo[_itokenId].itoken.safeTransferFrom(
            address(msg.sender),
            address(this),
            _amount
        );
        _deposit(_amount, _vault, _userAddress, _itokenId);
    }

    function getTVLAmount(uint256 _itokenId, address _userAddress, uint256 _itokenAmount) internal view returns(uint256){
        Iindices.PoolUser memory indicesUserInfo = indicesContract.poolUserInfo(itokenInfo[_itokenId].poolId, _userAddress);
        return (indicesUserInfo.currentBalance + indicesUserInfo.pendingBalance).mul(_itokenAmount).div(indicesUserInfo.Itokens);
    }

    // Deposit LP tokens to MasterChef for ASTRA allocation.
    function _deposit(
        uint256 _itokenAmount,
        uint256 _vault,
        address _userAddress,
        uint256 _itokenId
    ) internal {
        require(isValidVault[_vault], "Invalid vault");
        uint256 _stakingScore;
        uint256 _currentMultiplier;
        uint256 _maxMultiplier;

        PoolInfo storage pool = poolInfo[DEFAULT_POOL];
        UserInfo storage user = userInfo[DEFAULT_POOL][_userAddress];
        updatePool();

        uint256 _amount = getTVLAmount(_itokenId, _userAddress, _itokenAmount);
        if (user.amount > 0) {
            uint256 pending = user
                .amount
                .mul(pool.accAstraPerShare)
                .div(1e12)
                .sub(user.rewardDebt);
            unClaimedReward[_userAddress] = unClaimedReward[_userAddress].add(
                pending
            );
        }
        uint256 updateStakedAmount = user.amount.add(_amount);
        updateUserDepositDetails(_userAddress, _amount, _vault, _itokenId,_itokenAmount);
        uint256 newPoolMaxMultiplier;

        (
            _stakingScore,
            _currentMultiplier,
            _maxMultiplier
        ) = stakingScoreAndMultiplier(_userAddress, updateStakedAmount);
        newPoolMaxMultiplier = updateStakedAmount
            .mul(_maxMultiplier)
            .add(pool.totalStaked.mul(pool.maxMultiplier))
            .sub(user.amount.mul(user.maxMultiplier))
            .div(pool.totalStaked.add(_amount));
        updateUserAverageSlashingFees(_userAddress, user.amount, _amount, block.timestamp);
        user.amount = updateStakedAmount;
        pool.totalStaked = pool.totalStaked.add(_amount);
        user.maxMultiplier = _maxMultiplier;
        user.rewardDebt = user.amount.mul(pool.accAstraPerShare).div(1e12);
        pool.maxMultiplier = newPoolMaxMultiplier;
        user.lastDeposit = block.timestamp;
        updateRewardRate(pool.lastRewardBlock, pool.maxMultiplier, 0);
        emit Deposit(_userAddress, DEFAULT_POOL, _amount);
    }

    function withdraw(uint256 _itokenId, bool _withStake) external {
        UserInfo storage user = userInfo[DEFAULT_POOL][msg.sender];
        //Instead of transferring to a standard staking vault, Astra tokens can be locked (meaning that staker forfeits the right to unstake them for a fixed period of time). There are following lockups vaults: 6,9 and 12 months.
        if (user.cooldown == false) {
            user.cooldown = true;
            user.cooldowntimestamp = block.timestamp;
            return;
        } else {
                require(
                    block.timestamp >=
                        user.cooldowntimestamp.add(
                            SECONDS_IN_DAY.mul(coolDownPeriodTime)
                        ),
                    "withdraw: cooldown period"
                );
                user.cooldown = false;
                // Calling withdraw function after all the validation like cooldown period, eligible amount etc.
                _withdraw(_withStake, _itokenId);
        }
    }

    // Withdraw LP tokens from MasterChef.
    function _withdraw(bool _withStake, uint256 _itokenId) internal {
        PoolInfo storage pool = poolInfo[DEFAULT_POOL];
        UserInfo storage user = userInfo[DEFAULT_POOL][msg.sender];
        uint256 _amount;
        uint256 _itokenAmount;
        (_amount,_itokenAmount) = checkEligibleAmount(msg.sender, _itokenId);
        require(user.amount >= _amount, "withdraw: not good");
        if (_withStake) {
            restakeAstraReward();
        } else {
            claimAstra();
        }

        uint256 _stakingScore;
        uint256 _currentMultiplier;
        uint256 _maxMultiplier;
        uint256 updateStakedAmount = user.amount.sub(_amount);
        uint256 newPoolMaxMultiplier;
        if (pool.totalStaked.sub(_amount) > 0) {
            (
                _stakingScore,
                _currentMultiplier,
                _maxMultiplier
            ) = stakingScoreAndMultiplier(msg.sender, updateStakedAmount);
            newPoolMaxMultiplier = updateStakedAmount
                .mul(_maxMultiplier)
                .add(pool.totalStaked.mul(pool.maxMultiplier))
                .sub(user.amount.mul(user.maxMultiplier))
                .div(pool.totalStaked.sub(_amount));
        } else {
            newPoolMaxMultiplier = MULTIPLIER_DECIMAL;
        }

        user.amount = updateStakedAmount;
        pool.totalStaked = pool.totalStaked.sub(_amount);
        user.maxMultiplier = _maxMultiplier;
        user.rewardDebt = user.amount.mul(pool.accAstraPerShare).div(1e12);
        pool.maxMultiplier = newPoolMaxMultiplier;
        user.lastDeposit = block.timestamp;
        updateRewardRate(pool.lastRewardBlock, pool.maxMultiplier, 0);
        itokenInfo[_itokenId].itoken.safeTransfer(
            address(msg.sender),
            _itokenAmount
        );
        emit Withdraw(msg.sender, DEFAULT_POOL, _amount);
    }

    /**
    @notice View the eligible amount which is able to withdraw.
    @param _user : user address
    @dev Description :
    View the eligible amount which needs to be withdrawn if user deposits amount in multiple vaults. This function
    definition is marked "public" because this fuction is called from outside and inside the contract.
    */
    function viewEligibleAmount(address _user)
        external
        view
        returns (uint256)
    {
        uint256 eligibleAmount = 0;
        // Getting count of stake which is managed at the time of deposit
        uint256 countofstake = userStakeCounter[DEFAULT_POOL][_user];
        // This loop is applied for calculating the eligible withdrawn amount. This will fetch the user StakeInfo and calculate
        // the eligible amount which needs to be withdrawn
        for (uint256 i = 0; i <= countofstake; i++) {
            // Single stake info by stake id.
            StakeInfo storage stkInfo = userStakeInfo[DEFAULT_POOL][_user][i];
            // Checking the deposit variable is true
            if (
                stkInfo.withdrawTime == 0 ||
                stkInfo.withdrawTime == block.timestamp
            ) {
                uint256 vaultdays = stkInfo.vault.mul(30);
                uint256 timeaftervaultmonth = stkInfo.timestamp.add(
                    vaultdays.mul(SECONDS_IN_DAY)
                );
                // Checking if the duration of vault month is passed.
                if (block.timestamp >= timeaftervaultmonth) {
                    eligibleAmount = eligibleAmount.add(stkInfo.amount);
                }
            }
        }
        return eligibleAmount;
    }

    /**
    @notice Check the eligible amount which is able to withdraw.
    @param _user : user address
    @dev Description :
    This function is like viewEligibleAmount just here we update the state of stakeInfo object. This function definition
    is marked "private" because this fuction is called only from inside the contract.
    */
    function checkEligibleAmount(address _user, uint256 _itokenId)
        private
        returns (uint256,uint256)
    {
        uint256 eligibleAmount = 0;
        uint256 eligibleWithdrawAmount = 0;
        uint256 totaldepositAmount;
        averageStakedTime[DEFAULT_POOL][_user] = 0;
        // Getting count of stake which is managed at the time of deposit
        uint256 countofstake = userStakeCounter[DEFAULT_POOL][_user];
        // This loop is applied for calculating the eligible withdrawn amount. This will fetch the user StakeInfo and
        // calculate the eligible amount which needs to be withdrawn and StakeInfo is getting updated in this function.
        // Means if amount is eligible then false value needs to be set in deposit varible.
        for (uint256 i = 0; i <= countofstake; i++) {
            // Single stake info by stake id.
            StakeInfo storage stkInfo = userStakeInfo[DEFAULT_POOL][_user][i];
            // Checking the deposit variable is true
            if (
                stkInfo.withdrawTime == 0 ||
                stkInfo.withdrawTime == block.timestamp
            ) {
                uint256 vaultdays = stkInfo.vault.mul(30);
                uint256 timeaftervaultmonth = stkInfo.timestamp.add(
                    vaultdays.mul(SECONDS_IN_DAY)
                );
                // Checking if the duration of vault month is passed.
                if (block.timestamp >= timeaftervaultmonth && stkInfo.itokenId == _itokenId) {
                    eligibleAmount = eligibleAmount.add(stkInfo.amount);
                    eligibleWithdrawAmount = eligibleWithdrawAmount.add(stkInfo.itokenAmount);
                    stkInfo.withdrawTime = block.timestamp;
                } else{
                    updateUserAverageSlashingFees(_user, totaldepositAmount, stkInfo.amount, stkInfo.timestamp);
                    totaldepositAmount = totaldepositAmount.add(stkInfo.amount);
                }
            }
        }
        return (eligibleAmount,eligibleWithdrawAmount);
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _itokenId, uint256 _amount) public onlyOwner {
        itokenInfo[_itokenId].itoken.safeTransfer(address(msg.sender), _amount);
        emit EmergencyWithdraw(msg.sender, _itokenId, _amount);
    }

    // Withdraw astra rewards. EMERGENCY ONLY.
    function emergencyAstraWithdraw(uint256 _amount) public onlyOwner {
        safeAstraTransfer(msg.sender, _amount);
        emit EmergencyAstraWithdraw(msg.sender, _amount);
    }

    // Safe astra transfer function, just in case if rounding error causes pool to not have enough ASTRAs.
    function safeAstraTransfer(address _to, uint256 _amount) internal {
        uint256 astraBal = astra.balanceOf(address(this));
        if (_amount > astraBal) {
            astra.transfer(_to, astraBal);
        } else {
            astra.transfer(_to, _amount);
        }
    }

    function whitelistDistributionAddress(address _distributorAddress, bool _value) external onlyOwner {
        require(_distributorAddress != address(0), "zero address");
        eligibleDistributionAddress[_distributorAddress] = _value;
    }

    function decreaseRewardRate(uint256 _amount) external {
        require(eligibleDistributionAddress[msg.sender], "Not eligible");
        // Sync current pool before updating the reward rate.
        updatePool();
        
        uint256 _startBlock = poolInfo[0].lastRewardBlock >= bonusEndBlock
            ? bonusEndBlock
            : poolInfo[0].lastRewardBlock;
        uint256 _totalBlocksLeft = bonusEndBlock.sub(_startBlock);
        require(_totalBlocksLeft > 0, "Distribution Closed");

        // Calculate total pending reward.
        uint256 _totalRewardsLeft = maxPerBlockReward.mul(_totalBlocksLeft);
        require(_totalRewardsLeft > _amount, "Not enough rewards");
        
        uint256 _decreasedPerBlockReward = _totalRewardsLeft
                        .sub(_amount)
                        .mul(MULTIPLIER_DECIMAL)
                        .div(_totalBlocksLeft)
                        .div(MULTIPLIER_DECIMAL);
        maxPerBlockReward = _decreasedPerBlockReward;
        astraPerBlock = _decreasedPerBlockReward
            .mul(MULTIPLIER_DECIMAL)
            .div(poolInfo[0].maxMultiplier);
        safeAstraTransfer(msg.sender, _amount);
        emit ReduceReward(_amount, maxPerBlockReward);
    }

    // Distribute additional rewards to stakers.
    function distributeAdditionalReward(uint256 _rewardAmount) external {
        require(eligibleDistributionAddress[msg.sender], "Not eligible");

        // Get amount that needs to be distributed.
        astra.safeTransferFrom(
            address(msg.sender),
            address(this),
            _rewardAmount
            );

        // Distribute rewards to astra staking pool.
        updatePool();
        uint256 _startBlock = poolInfo[0].lastRewardBlock >= bonusEndBlock
            ? bonusEndBlock
            : poolInfo[0].lastRewardBlock;
        uint256 blockLeft = bonusEndBlock.sub(_startBlock);
        require(blockLeft > 0, "Distribution Closed");

        if (!isFirstDepositInitialized) {
                totalRewards = totalRewards.add(_rewardAmount);
                maxPerBlockReward = totalRewards.div(blockLeft);
            } else {
                maxPerBlockReward = _rewardAmount
                    .add(maxPerBlockReward.mul(blockLeft))
                    .mul(MULTIPLIER_DECIMAL)
                    .div(blockLeft)
                    .div(MULTIPLIER_DECIMAL);
            }
        astraPerBlock = blockLeft
            .mul(maxPerBlockReward)
            .mul(MULTIPLIER_DECIMAL)
            .div(blockLeft)
            .div(poolInfo[0].maxMultiplier);
        emit DistributeReward(_rewardAmount);
    }
}
