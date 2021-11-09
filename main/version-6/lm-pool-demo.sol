pragma solidity ^0.6.6;

import "./common/SafeMath.sol";
import "./common/IERC20.sol";
import "./common/ERC20.sol";
import "./common/SafeERC20.sol";
import "./upgrade/Ownable.sol";
import "./common/EnumerableSet.sol";
import "./common/Context.sol";
import "./common/Initializable.sol";

interface Chef {
    function ASTRPoolId() external view returns (uint256);

    function stakeASTRReward(
        address _currUserAddr,
        uint256 _pid,
        uint256 _amount
    ) external;

    function getRewardMultiplier(uint256 _pid, address _user)
        external
        view
        returns (uint256);
}

contract LmPool is Ownable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt;
        bool cooldown;
        uint256 timestamp;
        uint256 totalUserBaseMul;
        uint256 totalReward;
        uint256 cooldowntimestamp;
        uint256 preBlockReward;
        uint256 totalClaimedReward;
        uint256 claimedToday;
        uint256 claimedTimestamp;
    }

    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        uint256 lastRewardBlock; // Last block number that ASTRs distribution occurs.
        uint256 totalBaseMultiplier; // Total rm count of all user
    }

    // The ASTR TOKEN!
    address public ASTR;
    // Chef contract address
    address public chefaddr;
    // Dev address.
    address public devaddr;
    // Block number when bonus ASTR period ends.
    uint256 public bonusEndBlock;
    // ASTR tokens created per block.
    uint256 public ASTRPerBlock;
    // Bonus muliplier for early ASTR makers.
    uint256 public constant BONUS_MULTIPLIER = 1; //no Bonus
    // Pool lptokens info
    mapping(IERC20 => bool) public lpTokensStatus;
    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    // Total allocation poitns. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint = 0;
    // The block number when ASTR mining starts.
    uint256 public startBlock;
    // The TimeLock Address!
    address public timelock;
    // The vault list
    mapping(uint256 => bool) public vaultList;

    //staking info structure
    struct StakeInfo {
        uint256 amount;
        uint256 totalAmount;
        uint256 timestamp;
        uint256 vault;
        bool deposit;
    }

    //stake in mapping
    mapping(uint256 => mapping(address => uint256)) userStakingTrack;
    mapping(uint256 => mapping(address => mapping(uint256 => StakeInfo)))
        public stakeInfo;
    //mapping cooldown period on Withdraw
    mapping(uint256 => mapping(address => uint256)) public coolDownStart;
    //staking variables
    uint256 dayseconds = 86400;
    mapping(uint256 => address[]) public userAddressesInPool;
    enum RewardType {INDIVIDUAL, FLAT, TVL_ADJUSTED}
    uint256 ABP = 6500;

    //highest staked users
    struct HighestAstaStaker {
        uint256 deposited;
        address addr;
    }

    mapping(uint256 => HighestAstaStaker[]) public highestStakerInPool;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    function initialize(
        address _astr,
        address _devaddr,
        uint256 _ASTRPerBlock,
        uint256 _startBlock,
        uint256 _bonusEndBlock
    ) public initializer {
        Ownable.init(_devaddr);
        ASTR = _astr;
        devaddr = _devaddr;
        ASTRPerBlock = _ASTRPerBlock;
        bonusEndBlock = _bonusEndBlock;
        startBlock = _startBlock;
    }

    // This function is made just for demo for increasing _bonusEndBlock. Can only be called by the owner.
    function setBonusEndBlock(uint256 _bonusEndBlock) public onlyOwner {
        bonusEndBlock = _bonusEndBlock;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    function add(IERC20 _lpToken) public onlyOwner {
        require(lpTokensStatus[_lpToken] != true, "LP token already added");
        // require(_msgSender() == owner() || _msgSender() == address(timelock), "Can only be called by the owner/timelock");
        uint256 lastRewardBlock =
            block.number > startBlock ? block.number : startBlock;
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                lastRewardBlock: lastRewardBlock,
                totalBaseMultiplier: 0
            })
        );
        lpTokensStatus[_lpToken] = true;
    }

    function addVault(uint256 val) public onlyOwner {
        vaultList[val] = true;
    }

    // set chef address. Can only be called by the owner.
    function setChefAddress(address _chefaddr) public onlyOwner {
        chefaddr = _chefaddr;
    }

    // set timelock address. Can only be called by the owner.
    function setTimeLockAddress(address _timeLock) public onlyOwner {
        timelock = _timeLock;
    }

    // Update Reward rate. Can only be called by the timelock contract.
    function updateRewardRate(uint256 _rewardRate) public {
        require(
            msg.sender == address(timelock),
            "Call must come from Timelock"
        );
        require(_rewardRate > 0, "Reward Rate can not be 0");
        uint256 currentBlockNumber = block.number;
        uint256 leftBlocks = getMultiplier(currentBlockNumber, bonusEndBlock);
        require(leftBlocks > 0, "Time period over");

        uint256 leftAstrTokens = leftBlocks.mul(ASTRPerBlock);
        uint256 newBonusEndBlockNumber =
            currentBlockNumber.add(leftAstrTokens.div(_rewardRate));
        bonusEndBlock = newBonusEndBlockNumber;
        ASTRPerBlock = _rewardRate;
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        if (_to <= bonusEndBlock) {
            return _to.sub(_from).mul(BONUS_MULTIPLIER);
        } else if (_from >= bonusEndBlock) {
            return _to.sub(_from);
        } else {
            return
                bonusEndBlock.sub(_from).mul(BONUS_MULTIPLIER).add(
                    _to.sub(bonusEndBlock)
                );
        }
    }

    /**
    @notice Reward Multiplier from staked amount
    @param _user : user account address
    @dev Description :
    Depending on users’ staking scores and whether they’ve decided to move Astra tokens to one of the
    lockups vaults, users will get up to 2.5x higher rewards and voting power
    */
    function getRewardMultiplier(address _user) public view returns (uint256) {
        return
            Chef(chefaddr).getRewardMultiplier(
                Chef(chefaddr).ASTRPoolId(),
                _user
            );
    }

    // Deposit LP tokens to MasterChef for ASTR allocation.
    function deposit(
        uint256 _pid,
        uint256 _amount,
        uint256 vault
    ) public {
        require(vaultList[vault] == true, "no vault");
        PoolInfo storage pool = poolInfo[_pid];
        updateBlockReward(_pid);
        UserInfo storage user = userInfo[_pid][msg.sender];
        addUserAddress(_pid);
        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(
                address(msg.sender),
                address(this),
                _amount
            );
            user.amount = user.amount.add(_amount);
        }
        //deposit staking score structure update
        userStakingTrack[_pid][msg.sender] = userStakingTrack[_pid][msg.sender]
            .add(1);
        uint256 userstakeid = userStakingTrack[_pid][msg.sender];

        StakeInfo storage staker = stakeInfo[_pid][msg.sender][userstakeid];
        staker.amount = _amount;
        staker.totalAmount = user.amount;
        staker.timestamp = block.timestamp;
        staker.vault = vault;
        staker.deposit = true;

        //user timestamp
        user.timestamp = block.timestamp;
        emit Deposit(msg.sender, _pid, _amount);
    }

    function withdraw(uint256 _pid, bool _withStake) public {
        UserInfo storage user = userInfo[_pid][msg.sender];
        uint256 _amount = viewEligibleAmount(_pid, msg.sender);
        require(_amount > 0, "withdraw: not good");
        uint256 mintsec = 60;
        //Instead of transferring to a standard staking vault, Astra tokens can be locked (meaning that staker forfeits the right to unstake them for a fixed period of time). There are following lockups vaults: 6,9 and 12 months.
        if (user.cooldown == false) {
            user.cooldown = true;
            user.cooldowntimestamp = block.timestamp;
            return;
        } else {
            // Stakers willing to withdraw tokens from the staking pool will need to go through 7 days
            // of cool-down period. After 7 days, if the user fails to confirm the unstake transaction in the 24h time window, the cooldown period will be reset.
            if (block.timestamp > user.cooldowntimestamp.add(mintsec.mul(5))) {
                user.cooldown = true;
                user.cooldowntimestamp = block.timestamp;
                return;
            } else {
                require(user.cooldown == true, "withdraw: cooldown status");
                require(
                    block.timestamp >=
                        user.cooldowntimestamp.add(mintsec.mul(3)),
                    "withdraw: cooldown period"
                );
                require(
                    block.timestamp <=
                        user.cooldowntimestamp.add(mintsec.mul(5)),
                    "withdraw:close  window"
                );
                //call staking score function to update staking score value
                _withdraw(_pid, _withStake);
            }
        }
    }

    function _withdraw(uint256 _pid, bool _withStake) private {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        withdrawASTRReward(_pid, _withStake);
        uint256 _amount = checkEligibleAmount(_pid, msg.sender, true);
        user.amount = user.amount.sub(_amount);
        pool.lpToken.safeTransfer(address(msg.sender), _amount);
        //update user cooldown status
        user.cooldown = false;
        user.cooldowntimestamp = 0;
        user.totalUserBaseMul = 0;
        emit Withdraw(msg.sender, _pid, _amount);
    }

    function viewEligibleAmount(uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        uint256 eligibleAmount = 0;
        uint256 countofstake = userStakingTrack[_pid][_user];
        for (uint256 i = 1; i <= countofstake; i++) {
            StakeInfo storage stkInfo = stakeInfo[_pid][_user][i];
            if (stkInfo.deposit == true) {
                uint256 mintsec = 60;
                uint256 vaultdays = stkInfo.vault.mul(1);
                uint256 timeaftervaultmonth =
                    stkInfo.timestamp.add(vaultdays.mul(mintsec));
                if (block.timestamp >= timeaftervaultmonth) {
                    eligibleAmount = eligibleAmount + stkInfo.amount;
                }
            }
        }
        return eligibleAmount;
    }

    function checkEligibleAmount(
        uint256 _pid,
        address _user,
        bool _withUpdate
    ) private returns (uint256) {
        uint256 eligibleAmount = 0;
        uint256 countofstake = userStakingTrack[_pid][_user];
        for (uint256 i = 1; i <= countofstake; i++) {
            StakeInfo storage stkInfo = stakeInfo[_pid][_user][i];
            if (stkInfo.deposit == true) {
                uint256 mintsec = 60;
                uint256 vaultdays = stkInfo.vault.mul(1);
                uint256 timeaftervaultmonth =
                    stkInfo.timestamp.add(vaultdays.mul(mintsec));
                if (block.timestamp >= timeaftervaultmonth) {
                    eligibleAmount = eligibleAmount + stkInfo.amount;
                    if (_withUpdate) {
                        stkInfo.deposit = false;
                    }
                }
            }
        }
        return eligibleAmount;
    }

    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        uint256 _amount = user.amount;
        pool.lpToken.safeTransfer(address(msg.sender), _amount);
        user.amount = 0;
        user.totalReward = 0;
        emit EmergencyWithdraw(msg.sender, _pid, _amount);
    }

    // Withdraw ASTR Tokens from MasterChef address.
    function emergencyWithdrawASTR(address recipient, uint256 amount)
        public
        onlyOwner
    {
        require(
            amount > 0 && recipient != address(0),
            "amount and recipient address can not be 0"
        );
        safeASTRTransfer(recipient, amount);
    }

    // Safe ASTR transfer function, just in case if rounding error causes pool to not have enough ASTRs.
    function safeASTRTransfer(address _to, uint256 _amount) internal {
        uint256 ASTRBal = IERC20(ASTR).balanceOf(address(this));
        require(
            !(_amount > ASTRBal),
            "Insufficient amount on lm pool contract"
        );
        IERC20(ASTR).transfer(_to, _amount);
    }

    // Update dev address by the previous dev.
    function dev(address _devaddr) public {
        require(msg.sender == devaddr, "dev: wut?");
        devaddr = _devaddr;
    }

    /**
    @notice Manage the all user address wrt to LM pool. its store all the user address
    in a map where key is pool id and value is array of user address.
    @param _pid : pool id
    */
    function addUserAddress(uint256 _pid) private {
        address[] storage adds = userAddressesInPool[_pid];
        if (userStakingTrack[_pid][msg.sender] == 0) {
            adds.push(msg.sender);
        }
    }

    /**
    @notice Distribute Individual, Flat and TVL adjusted reward
    @param _pid : LM pool id
    @param _type : reward type 
    @param _amount : amount which needs to be distributed
    @dev Requirements:
        Reward type should not except 0, 1, 2.
        0 - INDIVIDUAL Reward
        1 - FLAT Reward
        2 - TVL ADJUSTED Reward
    */
    function distributeReward(
        uint256 _pid,
        RewardType _type,
        uint256 _amount
    ) public onlyOwner {
        if (_type == RewardType.INDIVIDUAL) {
            distributeIndividualReward(_pid, _amount);
        } else if (_type == RewardType.FLAT) {
            distributeFlatReward(_amount);
        } else if (_type == RewardType.TVL_ADJUSTED) {
            distributeTvlAdjustedReward(_amount);
        }
    }

    /**
    @notice Distribute Individual reward to user
    @param _pid : LM pool id
    @param _amount : amount which needs to be distributed
    @dev Description :
        In individual reward, all base value is calculated in a single LM pool and calculate the
        share for every user by dividing pool base multiplier with user base mulitiplier.
        PBM = UBM1+UBM2
        share % for single S1 = UBM1*100/PBM
        reward amount = S1*amount/100
    */
    function distributeIndividualReward(uint256 _pid, uint256 _amount) private {
        uint256 poolBaseMul = 0;
        PoolInfo storage pool = poolInfo[_pid];
        address[] memory adds = userAddressesInPool[_pid];
        for (uint256 i = 0; i < adds.length; i++) {
            UserInfo storage user = userInfo[_pid][adds[i]];
            uint256 mul = getRewardMultiplier(adds[i]);
            user.totalUserBaseMul = user.amount.mul(mul);
            poolBaseMul = poolBaseMul.add(user.totalUserBaseMul);
        }
        for (uint256 i = 0; i < adds.length; i++) {
            UserInfo storage user = userInfo[_pid][adds[i]];
            uint256 sharePercentage =
                user.totalUserBaseMul.mul(10000).div(poolBaseMul);
            user.totalReward = user.totalReward.add(
                (_amount.mul(sharePercentage)).div(10000)
            );
        }
    }

    /**
    @notice Distribute Flat reward to user
    @param _amount : amount which needs to be distributed
    @dev Description :
        In Flat reward distribution, here base value is calculated for all LM pool and
        calculate the share for each user from each pool.
    */
    function distributeFlatReward(uint256 _amount) private {
        uint256 allPoolBaseMul = 0;
        for (uint256 pid = 0; pid < poolInfo.length; ++pid) {
            PoolInfo storage pool = poolInfo[pid];
            address[] memory adds = userAddressesInPool[pid];
            for (uint256 i = 0; i < adds.length; i++) {
                UserInfo storage user = userInfo[pid][adds[i]];
                uint256 mul = getRewardMultiplier(adds[i]);
                user.totalUserBaseMul = user.amount.mul(mul);
                allPoolBaseMul = allPoolBaseMul.add(user.totalUserBaseMul);
            }
        }

        for (uint256 pid = 0; pid < poolInfo.length; ++pid) {
            address[] memory adds = userAddressesInPool[pid];
            for (uint256 i = 0; i < adds.length; i++) {
                UserInfo storage user = userInfo[pid][adds[i]];
                uint256 sharePercentage =
                    user.totalUserBaseMul.mul(10000).div(allPoolBaseMul);
                user.totalReward = user.totalReward.add(
                    (_amount.mul(sharePercentage)).div(10000)
                );
            }
        }
    }

    /**
    @notice Distribute TVL adjusted reward to user
    @param _amount : amount which needs to be distributed
    @dev Description :
        In TVL reward, First it needs to calculate the reward share for each on the basis of 
        total value locked of each pool.
        totTvl = TVL1+TVL2
        reward share = TVL1*100/totTvl
        user reward will happen like individual reward after calculating the reward share.
    */
    function distributeTvlAdjustedReward(uint256 _amount) private {
        uint256 totalTvl = 0;
        for (uint256 pid = 0; pid < poolInfo.length; ++pid) {
            PoolInfo storage pool = poolInfo[pid];
            uint256 tvl = pool.lpToken.balanceOf(address(this));
            totalTvl = totalTvl.add(tvl);
        }
        for (uint256 pid = 0; pid < poolInfo.length; ++pid) {
            PoolInfo storage pool = poolInfo[pid];
            uint256 tvl = pool.lpToken.balanceOf(address(this));
            uint256 poolRewardShare = tvl.mul(10000).div(totalTvl);
            uint256 reward = (_amount.mul(poolRewardShare)).div(10000);
            distributeIndividualReward(pid, reward);
        }
    }

    /**
    @notice Update the block reward for all user at a time only owner access
    @param _pid : pool id
    @dev Description :
        It calculates the total block reward with defined astr per block and the distribution will be
        same as the individual reward. 
    */
    function updateBlockRewardToAll(uint256 _pid) public onlyOwner {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 PoolEndBlock = block.number;
        if (block.number > bonusEndBlock) {
            PoolEndBlock = bonusEndBlock;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = PoolEndBlock;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, PoolEndBlock);
        uint256 blockReward = multiplier.mul(ASTRPerBlock);
        distributeIndividualReward(_pid, blockReward);
        pool.lastRewardBlock = PoolEndBlock;
    }

    /**
    @notice Update the block reward for a single user, all have the access for this function.
    @param _pid : pool id
    @dev Description :
        It calculates the total block reward with defined astr per block and the distribution will be
        calculated with current user reward multiplier, total user mulplier and total pool multiplier.
        PBM = UBM1+UBM2
        share % for single S1 = UBM1*100/PBM
        reward amount = S1*amount/100
    */
    function updateBlockReward(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 PoolEndBlock = block.number;
        if (block.number > bonusEndBlock) {
            PoolEndBlock = bonusEndBlock;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = PoolEndBlock;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, PoolEndBlock);
        uint256 blockReward = multiplier.mul(ASTRPerBlock);

        UserInfo storage currentUser = userInfo[_pid][msg.sender];
        uint256 totalPoolBaseMul = 0;
        address[] memory adds = userAddressesInPool[_pid];
        for (uint256 i = 0; i < adds.length; i++) {
            UserInfo storage user = userInfo[_pid][adds[i]];
            if (user.amount > 0) {
                uint256 mul = getRewardMultiplier(adds[i]);
                if (msg.sender != adds[i]) {
                    user.preBlockReward = user.preBlockReward.add(blockReward);
                }
                totalPoolBaseMul = totalPoolBaseMul.add(user.amount.mul(mul));
            }
        }
        updateCurBlockReward(currentUser, _pid, blockReward, totalPoolBaseMul);
        pool.lastRewardBlock = PoolEndBlock;
    }

    function updateCurBlockReward(
        UserInfo storage currentUser,
        uint256 _pid,
        uint256 blockReward,
        uint256 totalPoolBaseMul
    ) private {
        uint256 userBaseMul =
            currentUser.amount.mul(getRewardMultiplier(msg.sender));
        uint256 totalBlockReward = blockReward.add(currentUser.preBlockReward);
        uint256 sharePercentage = userBaseMul.mul(10000).div(totalPoolBaseMul);
        currentUser.totalReward = currentUser.totalReward.add(
            (totalBlockReward.mul(sharePercentage)).div(10000)
        );
        currentUser.preBlockReward = 0;
    }

    /**
    @notice View the total user reward in the particular pool.
    @param _pid : pool id
    */
    function viewRewardInfo(uint256 _pid) public view returns (uint256) {
        UserInfo memory currentUser = userInfo[_pid][msg.sender];
        PoolInfo memory pool = poolInfo[_pid];
        uint256 totalReward = currentUser.totalReward;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return totalReward;
        }

        if (block.number <= pool.lastRewardBlock) {
            return totalReward;
        }

        uint256 PoolEndBlock = block.number;
        if (block.number > bonusEndBlock) {
            PoolEndBlock = bonusEndBlock;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, PoolEndBlock);
        uint256 blockReward = multiplier.mul(ASTRPerBlock);

        uint256 totalPoolBaseMul = 0;
        address[] memory adds = userAddressesInPool[_pid];
        for (uint256 i = 0; i < adds.length; i++) {
            UserInfo storage user = userInfo[_pid][adds[i]];
            uint256 mul = getRewardMultiplier(adds[i]);
            totalPoolBaseMul = totalPoolBaseMul.add(user.amount.mul(mul));
        }
        uint256 userBaseMul =
            currentUser.amount.mul(getRewardMultiplier(msg.sender));
        uint256 totalBlockReward = blockReward.add(currentUser.preBlockReward);
        uint256 sharePercentage = userBaseMul.mul(10000).div(totalPoolBaseMul);
        return
            currentUser.totalReward.add(
                (totalBlockReward.mul(sharePercentage)).div(10000)
            );
    }

    function distributeExitFeeShare(uint256 _amount) public {
        require(_amount > 0, "Amount should not be zero");
        distributeIndividualReward(Chef(chefaddr).ASTRPoolId(), _amount);
    }

    /**
    @notice Claim ASTR reward by user
    @param _pid : pool id
    @param _withStake : with or without stake
    @dev Description :
        Here User can claim the claimable ASTR reward. There is two option for claiming the reward with
        or without staking the ASTR token. If user wants to claim 100% then he needs to stake the ASTR
        to ASTR pool. Otherwise some ASTR amount would be deducted as a fee.
    */
    function withdrawASTRReward(uint256 _pid, bool _withStake) public {
        updateBlockReward(_pid);
        UserInfo storage currentUser = userInfo[_pid][msg.sender];
        if (_withStake) {
            uint256 _amount = currentUser.totalReward;
            stakeASTRReward(Chef(chefaddr).ASTRPoolId(), _amount);
            updateClaimedReward(currentUser, _amount);
        } else {
            uint256 dayInSecond = 60;
            uint256 dayCount =
                (block.timestamp.sub(currentUser.timestamp)).div(dayInSecond);
            if (dayCount >= 90) {
                dayCount = 90;
            }
            slashExitFee1(currentUser, _pid, dayCount);
        }
        currentUser.totalReward = 0;
    }

    /**
    @notice Staking the ASTR reward in ASTR pool.
    @param _pid : pool id
    @param _amount : amount for staking
    @dev Description :
        This function is called from withdrawASTRReward If user choose to stake the 100% reward. In this function
        the amount will be staked in ASTR pool.
    */
    function stakeASTRReward(uint256 _pid, uint256 _amount) private {
        Chef(chefaddr).stakeASTRReward(
            msg.sender,
            Chef(chefaddr).ASTRPoolId(),
            _amount
        );
    }

    /**
    @notice Send the ASTR reward to user account
    @param _pid : pool id
    @param currentUser : current user address
    @param dayCount : day on which user wants to withdraw reward
    @dev Description :
        This function is called from withdrawASTRReward If user choose to withdraw the reward amount. In this function
        the amount will be sent to user account after deducting applicable fee.
    */
    function slashExitFee(
        UserInfo storage currentUser,
        uint256 _pid,
        uint256 dayCount
    ) private {
        PoolInfo memory pool = poolInfo[_pid];
        uint256 totalReward = currentUser.totalReward;
        uint256 block1 = startBlock;
        uint256 block2 =
            pool.lastRewardBlock.sub(
                currentUser.preBlockReward.div(ASTRPerBlock)
            );
        uint256 diffBlock = block2.sub(block1);
        uint256 sfr = uint256(90).sub(dayCount);
        uint256 fee =
            (totalReward.mul(sfr)).div(100).sub(
                (sfr.mul(diffBlock).div(uint256(90).mul(6500).mul(100)))
            );
        if (fee < 0) {
            fee = 0;
        }
        uint256 claimableReward = totalReward.sub(fee);
        if (claimableReward > 0) {
            safeASTRTransfer(msg.sender, claimableReward);
            currentUser.totalReward = 0;
        }
        distributeIndividualReward(_pid, fee);
    }

    /**
    @notice Send the ASTR reward to user account
    @param _pid : pool id
    @param currentUser : current user address
    @param dayCount : day on which user wants to withdraw reward
    @dev Description :
        This function is called from withdrawASTRReward If user choose to withdraw the reward amount. In this function
        the amount will be sent to user account after deducting applicable fee.
    */
    function slashExitFee1(
        UserInfo storage currentUser,
        uint256 _pid,
        uint256 dayCount
    ) private {
        uint256 totalReward = currentUser.totalReward;
        uint256 sfr = uint256(90).sub(dayCount);
        uint256 fee = totalReward.mul(sfr).div(100);
        if (fee < 0) {
            fee = 0;
        }
        uint256 claimableReward = totalReward.sub(fee);
        if (claimableReward > 0) {
            safeASTRTransfer(msg.sender, claimableReward);
            currentUser.totalReward = 0;
        }
        distributeIndividualReward(_pid, fee);
        updateClaimedReward(currentUser, claimableReward);
    }

    function updateClaimedReward(UserInfo storage currentUser, uint256 _amount) private {
        currentUser.totalClaimedReward = currentUser.totalClaimedReward.add(_amount);
        uint256 day = (block.timestamp - currentUser.claimedTimestamp).div(dayseconds);
        if(day == 0) {
            currentUser.claimedToday = currentUser.claimedToday.add(_amount);
        }else{
            currentUser.claimedToday = _amount;
            uint256 todayDaySeconds = block.timestamp % dayseconds;
            currentUser.claimedTimestamp = block.timestamp.sub(todayDaySeconds);
        }
    }

    function getTodayReward(uint256 _pid) external view returns (uint256) {
        UserInfo memory currentUser = userInfo[_pid][msg.sender];
        uint256 day = (block.timestamp - currentUser.claimedTimestamp).div(dayseconds);
        uint256 claimedToday;
        if(day == 0) {
            claimedToday = currentUser.claimedToday;
        }else{
            claimedToday = 0;
        }
        return claimedToday;
    }
}
