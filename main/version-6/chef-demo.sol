// File: @openzeppelin/contracts/token/ERC20/IERC20.sol
pragma experimental ABIEncoderV2;

pragma solidity ^0.6.6;

import "./common/SafeMath.sol";
import "./common/IERC20.sol";
import "./common/ERC20.sol";
import "./common/SafeERC20.sol";
import "./upgrade/Ownable.sol";
import "./common/EnumerableSet.sol";
import "./common/Context.sol";
import "./common/Initializable.sol";

// MasterChef is the master of ASTR. He can make ASTR and he is a fair guy.
//
// Note that it's ownable and the owner wields tremendous power. The ownership
// will be transferred to a governance smart contract once ASTR is sufficiently
// distributed and the community can show to govern itself.
//
// Have fun reading it. Hopefully it's bug-free. God bless.

interface Dao {
    function getVotingStatus(address _user) external view returns (bool);
}

contract MasterChef is Ownable {
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
        uint256 accASTRPerShare; // Accumulated ASTRs per share, times 1e12. See below.
        uint256 totalBaseMultiplier; // Total rm count of all user
    }

    // The ASTR TOKEN!
    address public ASTR;
    // Lm pool contract address
    address public lmpooladdr;
    // DAA contract address
    address public daaAddress;
    // DAO contract address
    address public daoAddress;
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
    uint256 public ASTRPoolId;
    uint256 ABP = 6500;

    //highest staked users
    struct HighestAstaStaker {
        uint256 deposited;
        address addr;
    }
    mapping(uint256 => HighestAstaStaker[]) public highestStakerInPool;

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyDaa() {
        require(
            daaAddress == _msgSender(),
            "depositFromDaaAndDAO: caller is not the DAA"
        );
        _;
    }

    modifier onlyDao() {
        require(daoAddress == _msgSender(), "Caller is not the DAO");
        _;
    }

    modifier onlyLmPool() {
        require(lmpooladdr == _msgSender(), "Caller is not the LmPool");
        _;
    }

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

    function getStakerList(uint256 _pid) public view returns (HighestAstaStaker[] memory) {
        return highestStakerInPool[_pid];
    }

    // Add a new lp to the pool. Can only be called by the owner.
    function add(IERC20 _lpToken) public onlyOwner {
        require(lpTokensStatus[_lpToken] != true, "LP token already added");
        if (ASTR == address(_lpToken)) {
            ASTRPoolId = poolInfo.length;
        }
        uint256 lastRewardBlock =
            block.number > startBlock ? block.number : startBlock;
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                lastRewardBlock: lastRewardBlock,
                accASTRPerShare: 0,
                totalBaseMultiplier: 0
            })
        );
        lpTokensStatus[_lpToken] = true;
    }

    function addVault(uint256 val) public onlyOwner {
        vaultList[val] = true;
    }

    // set lm pool address. Can only be called by the owner.
    function setLmPoolAddress(address _lmpooladdr) public onlyOwner {
        lmpooladdr = _lmpooladdr;
    }

    // set DAO address. Can only be called by the owner.
    function setDaoAddress(address _daoAddress) public onlyOwner {
        daoAddress = _daoAddress;
    }

    // set timelock address. Can only be called by the owner.
    function setTimeLockAddress(address _timeLock) public onlyOwner {
        timelock = _timeLock;
    }

    // Update the given pool's ASTR allocation point. Can only be called by the owner.
    // function set(
    //     uint256 _pid,
    //     uint256 _allocPoint,
    //     bool _withUpdate
    // ) public onlyOwner {
    //     require(
    //         msg.sender == owner() || msg.sender == address(timelock),
    //         "Can only be called by the owner/timelock"
    //     );
    //     if (_withUpdate) {
    //         massUpdatePools();
    //     }
    //     totalAllocPoint = totalAllocPoint.sub(poolInfo[_pid].allocPoint).add(
    //         _allocPoint
    //     );
    //     poolInfo[_pid].allocPoint = _allocPoint;
    // }

    function setDaaAddress(address _address) public {
        require(
            msg.sender == owner() || msg.sender == address(timelock),
            "Can only be called by the owner/timelock"
        );
        require(daaAddress != _address, "Already updated");
        daaAddress = _address;
    }

    // Update Reward rate. Can only be called by the timelock contract.
    function updateRewardRate(uint256 _rewardRate) public {
        require(
            msg.sender == address(timelock),
            "Call must come from Timelock"
        );
        require(_rewardRate > 0, "Reward Rate can not be 0");
        // massUpdatePools();
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

    // View function to see pending ASTRs on frontend.
    // function pendingASTR(uint256 _pid, address _user)
    //     external
    //     view
    //     returns (uint256)
    // {
    //     PoolInfo storage pool = poolInfo[_pid];
    //     UserInfo storage user = userInfo[_pid][_user];
    //     uint256 accASTRPerShare = pool.accASTRPerShare;
    //     uint256 PoolEndBlock = block.number;
    //     if (block.number > bonusEndBlock) {
    //         PoolEndBlock = bonusEndBlock;
    //     }

    //     uint256 lpSupply = pool.lpToken.balanceOf(address(this));
    //     if (PoolEndBlock > pool.lastRewardBlock && lpSupply != 0) {
    //         uint256 multiplier =
    //             getMultiplier(pool.lastRewardBlock, PoolEndBlock);

    //         uint256 ASTRReward =
    //             multiplier.mul(ASTRPerBlock).mul(pool.allocPoint).div(
    //                 totalAllocPoint
    //             );
    //         accASTRPerShare = accASTRPerShare.add(
    //             ASTRReward.mul(1e12).div(lpSupply)
    //         );
    //     }
    //     return user.amount.mul(accASTRPerShare).div(1e12).sub(user.rewardDebt);
    // }

    /**
    @notice Reward Multiplier from staked amount
    @param _pid : LM pool id
    @param _user : user account address
    @dev Description :
    Depending on users’ staking scores and whether they’ve decided to move Astra tokens to one of the
    lockups vaults, users will get up to 2.5x higher rewards and voting power
    */
    function getRewardMultiplier(uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        UserInfo storage user = userInfo[_pid][_user];

        //Lockup period
        //12months  Threshold/requirement  Staking/LM rewaryds multiplication xx1.8
        //9months   Threshold/requirement  Staking/LM rewards multiplication  x1.3
        //6months   Threshold/requirement  Staking/LM rewards multiplication  x1.2
        uint256 lockupMultiplier = vaultMultiplier(_pid, _user);

        //staking score threshold
        //800k  Threshold/requirement  Staking/LM rewards multiplication  xx1.7
        //300k  Threshold/requirement  Staking/LM rewards multiplication  x1.3
        //100k  Threshold/requirement  Staking/LM rewards multiplication  x1.2
        uint256 stakingscoreMultiplier = 10;
        uint256 stakingscoreval = stakingScore(_pid, _user);
        uint256 eightk = 800000 * 10**18;
        uint256 threek = 300000 * 10**18;
        uint256 onek = 100000 * 10**18;

        if (stakingscoreval >= eightk) {
            stakingscoreMultiplier = 17;
        } else if (stakingscoreval >= threek) {
            stakingscoreMultiplier = 13;
        } else if (stakingscoreval >= onek) {
            stakingscoreMultiplier = 12;
        }
        // AS RM=RM1+RM2-1
        return stakingscoreMultiplier.add(lockupMultiplier).sub(10);
    }

    function vaultMultiplier(uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        uint256 vaultMul;
        uint256 depositCount;
        uint256 countofstake = userStakingTrack[_pid][_user];
        for (uint256 i = 1; i <= countofstake; i++) {
            StakeInfo memory stkInfo = stakeInfo[_pid][_user][i];
            if (stkInfo.deposit == true) {
                depositCount++;
                if (stkInfo.vault == 12) {
                    vaultMul = vaultMul.add(18);
                } else if (stkInfo.vault == 9) {
                    vaultMul = vaultMul.add(13);
                } else if (stkInfo.vault == 6) {
                    vaultMul = vaultMul.add(11);
                } else {
                    vaultMul = vaultMul.add(10);
                }
            }
        }
        if (depositCount > 0) {
            return vaultMul.div(depositCount);
        } else {
            return 10;
        }
    }

    /**
    @notice PREMIUM PAYOUT BONUS
    @param _pid : LM pool id
    @param _user : user account address
    @dev Description : To calculate PREMIUM PAYOUT BONUS
    */
    function getPremiumPayoutBonus(uint256 _pid, address _user)
        public
        view
        returns (uint256)
    {
        UserInfo storage user = userInfo[_pid][_user];

        //staking score threshold
        uint256 stakingscoreaddition;
        uint256 stakingscorevalue = stakingScore(_pid, _user);
        uint256 eightk = 800000 * 10**18;
        uint256 threek = 300000 * 10**18;
        uint256 onek = 100000 * 10**18;

        //Lockup period
        //12months  Payment conversion bonus  2
        //6months   Payment conversion bonus  1
        //3months  Payment conversion bonus 0.5
        if (stakingscorevalue >= eightk) {
            stakingscoreaddition = 20;
        } else if (stakingscorevalue >= threek) {
            stakingscoreaddition = 10;
        } else if (stakingscorevalue >= onek) {
            stakingscoreaddition = 5;
        }
        return stakingscoreaddition;
    }

    // Update reward vairables for all pools. Be careful of gas spending!
    // function massUpdatePools() public {
    //     uint256 length = poolInfo.length;
    //     for (uint256 pid = 0; pid < length; ++pid) {
    //         updatePool(pid);
    //     }
    // }

    // Update reward variables of the given pool to be up-to-date.
    // function updatePool(uint256 _pid) public {
    //     PoolInfo storage pool = poolInfo[_pid];
    //     if (block.number <= pool.lastRewardBlock) {
    //         return;
    //     }
    //     uint256 lpSupply = pool.lpToken.balanceOf(address(this));
    //     if (lpSupply == 0) {
    //         pool.lastRewardBlock = block.number;
    //         return;
    //     }

    //     uint256 PoolEndBlock = block.number;
    //     if (block.number > bonusEndBlock) {
    //         PoolEndBlock = bonusEndBlock;
    //     }

    //     uint256 multiplier = getMultiplier(pool.lastRewardBlock, PoolEndBlock);

    //     uint256 ASTRReward =
    //         multiplier.mul(ASTRPerBlock).mul(pool.allocPoint).div(
    //             totalAllocPoint
    //         );
    //     // ASTR.rewards(address(this), ASTRReward);
    //     pool.accASTRPerShare = pool.accASTRPerShare.add(
    //         ASTRReward.mul(1e12).div(lpSupply)
    //     );
    //     pool.lastRewardBlock = PoolEndBlock;
    // }

    // Deposit LP tokens to MasterChef for ASTR allocation.
    function deposit(
        uint256 _pid,
        uint256 _amount,
        uint256 vault
    ) public {
        require(vaultList[vault] == true, "no vault");
        PoolInfo storage pool = poolInfo[_pid];
        updateBlockReward(_pid, msg.sender);
        UserInfo storage user = userInfo[_pid][msg.sender];
        addUserAddress(msg.sender, _pid);
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
        // update hishest staker array
        addHighestStakedUser(_pid, user.amount, msg.sender);
        emit Deposit(msg.sender, _pid, _amount);
    }

    // Deposit LP tokens to MasterChef for ASTR allocation.
    function depositFromDaaAndDAO(
        uint256 _pid,
        uint256 _amount,
        uint256 vault,
        address _sender,
        bool isPremium
    ) public onlyDaa {
        require(vaultList[vault] == true, "no vault");
        PoolInfo storage pool = poolInfo[_pid];
        updateBlockReward(_pid, _sender);
        UserInfo storage user = userInfo[_pid][_sender];
        addUserAddress(_sender, _pid);
        if (_amount > 0) {
            uint256 bonusAmount =
                getBonusAmount(_pid, _sender, _amount, isPremium);
            _amount = _amount.add(bonusAmount);
            pool.lpToken.safeTransferFrom(
                address(msg.sender),
                address(this),
                _amount
            );
            user.amount = user.amount.add(_amount);
        }
        //deposit staking score structure update
        userStakingTrack[_pid][_sender] = userStakingTrack[_pid][_sender].add(
            1
        );
        uint256 userstakeid = userStakingTrack[_pid][_sender];
        StakeInfo storage staker = stakeInfo[_pid][_sender][userstakeid];
        staker.amount = _amount;
        staker.totalAmount = user.amount;
        staker.timestamp = block.timestamp;
        staker.vault = vault;
        staker.deposit = true;

        //user timestamp
        user.timestamp = block.timestamp;
        // update hishest staker array
        addHighestStakedUser(_pid, user.amount, _sender);
        emit Deposit(_sender, _pid, _amount);
    }

    function getBonusAmount(
        uint256 _pid,
        address _user,
        uint256 _amount,
        bool isPremium
    ) private view returns (uint256) {
        uint256 ppb;
        if (isPremium) {
            ppb = getPremiumPayoutBonus(_pid, _user).add(20);
        } else {
            ppb = getPremiumPayoutBonus(_pid, _user);
        }
        uint256 bonusAmount = _amount.mul(ppb).div(1000);
        return bonusAmount;
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
        // Claiming ASTR rewards
        withdrawASTRReward(_pid, _withStake);
        uint256 _amount = checkEligibleAmount(_pid, msg.sender, true);
        user.amount = user.amount.sub(_amount);
        user.rewardDebt = user.amount.mul(pool.accASTRPerShare).div(1e12);
        pool.lpToken.safeTransfer(address(msg.sender), _amount);
        //update user cooldown status
        user.cooldown = false;
        user.cooldowntimestamp = 0;
        user.totalUserBaseMul = 0;
        // update hishest staker array
        removeHighestStakedUser(_pid, user.amount, msg.sender);
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
        require(!(_amount > ASTRBal), "Insufficient amount on chef contract");
        IERC20(ASTR).transfer(_to, _amount);
    }

    // Update dev address by the previous dev.
    function dev(address _devaddr) public {
        require(msg.sender == devaddr, "dev: wut?");
        devaddr = _devaddr;
    }

    /**
    @notice staking score from staked amount
    @param _pid :  pool id
    @param _userAddress : user account address
    @dev Description :
    The staking score is calculated using average holdings over the last 60 days.
    The idea of staking score is to recognise the value of a long term holding even if held assets are small. This is illustrated by below example:
    Holder who stakes 1000 tokens for the last 60 days has an average staking score of 1000
    Holder who stakes 60 000 tokens for 1 day, also has average staking score of 1000
    */
    function stakingScore(uint256 _pid, address _userAddress)
        public
        view
        returns (uint256)
    {
        uint256 timeofstakes;
        uint256 amountstaked;
        uint256 daysecondss = 60;
        uint256 daysOfStakingscore = 60;
        UserInfo storage user = userInfo[_pid][_userAddress];
        uint256 countofstake = userStakingTrack[_pid][_userAddress];
        uint256 stakingscorenett = 0;
        uint256 userStakingScores = 0;

        for (uint256 i = 1; i <= countofstake; i++) {
            StakeInfo memory stkInfo = stakeInfo[_pid][_userAddress][i];
            if (stkInfo.deposit == true) {
                timeofstakes = stkInfo.timestamp;
                amountstaked = stkInfo.amount;
                //get staking vault
                uint256 vaultMonth = stkInfo.vault;
                // calculate difference in days
                stakingscorenett = calcstakingscore(
                    timeofstakes,
                    vaultMonth,
                    amountstaked,
                    stakingscorenett,
                    daysOfStakingscore,
                    daysecondss
                );
                userStakingScores = userStakingScores.add(stakingscorenett);
                if (userStakingScores > user.amount) {
                    userStakingScores = user.amount;
                }
            } else {
                userStakingScores = 0;
            }
        }
        return userStakingScores;
    }

    /**
    @notice Staking score calculation
    @param timeofstakes : time of stake
    @param vaultMonth : vault of month
    @param amountstaked : Amount month
    @param stakingscorenett : vault of month
    @param daysOfStakingscore : days Of Stakingscore
    @param daysecondss : day seconds
    @dev Description :The staking score formaula calculation
    */
    function calcstakingscore(
        uint256 timeofstakes,
        uint256 vaultMonth,
        uint256 amountstaked,
        uint256 stakingscorenett,
        uint256 daysOfStakingscore,
        uint256 daysecondss
    ) internal view returns (uint256) {
        uint256 stakeIndays = 0;
        uint256 month = 12;
        // daysOfStakingscore / month (60 / 12) = 5
        uint256 daysByMonthConstant = daysOfStakingscore.div(month);
        uint256 diffInTimestamp = block.timestamp.sub(timeofstakes);
        if (diffInTimestamp > daysecondss) {
            stakeIndays = diffInTimestamp.div(daysecondss);
        } else {
            stakeIndays = 0;
        }

        // This means that if user exceeds the 60 day time period user staking score
        // will remain the same
        if (stakeIndays > 60) {
            stakeIndays = 60;
        }

        //staking score calculation
        if (vaultMonth == 12) {
            if (stakeIndays == 0) {
                amountstaked = amountstaked.mul(stakeIndays);
            }
            stakingscorenett = amountstaked;
        } else {
            // on 0 vault not required calcation to get staking days
            if (vaultMonth != 0) {
                // daysOfStakingscore = daysOfStakingscore.sub(
                // daysOfStakingscore.div(month.div(vaultMonth))
                daysOfStakingscore = daysOfStakingscore.sub(
                    daysByMonthConstant.mul(vaultMonth)
                );
            }
            stakingscorenett = amountstaked.mul(stakeIndays).div(
                daysOfStakingscore
            );
        }
        return stakingscorenett;
    }

    /**
    @notice Manage the all user address wrt to LM pool. its store all the user address
    in a map where key is pool id and value is array of user address.
    @param _pid : pool id
    */
    function addUserAddress(address _user, uint256 _pid) private {
        address[] storage adds = userAddressesInPool[_pid];
        if (userStakingTrack[_pid][_user] == 0) {
            adds.push(_user);
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
            uint256 mul = getRewardMultiplier(ASTRPoolId, adds[i]);
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
                uint256 mul = getRewardMultiplier(ASTRPoolId, adds[i]);
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
    @notice store Highest 100 staked users
    @param _pid : pool id
    @param _amount : amount
    @dev Description :During the first 60 days after Astra network goes live date, DAO governance will be performed by the
    top 100 wallets with the highest amount of staked Astra tokens. After the first 90 days, DAO governors
    will be based on the staking score, without any limitations.
    */
    function addHighestStakedUser(
        uint256 _pid,
        uint256 _amount,
        address user
    ) private {
        uint256 i;
        HighestAstaStaker[] storage higheststaker = highestStakerInPool[_pid];
        //for loop to check if the staking address exist in array
        for (i = 0; i < higheststaker.length; i++) {
            if (higheststaker[i].addr == user) {
                higheststaker[i].deposited = _amount;
                quickSort(_pid, 0, higheststaker.length - 1);
                return;
            }
        }

        if (higheststaker.length < 2) {
            higheststaker.push(HighestAstaStaker(_amount, user));
        } else {
            /** get the index of the current max element **/
            if (higheststaker[0].deposited < _amount) {
                higheststaker[0].deposited = _amount;
                higheststaker[0].addr = user;
            }
        }
        quickSort(_pid, 0, higheststaker.length - 1);
    }

    /**
    @notice Astra staking track the Highest 100 staked users
    @param _pid : pool id
    @param user : user address
    @dev Description :During the first 60 days after Astra network goes live date, DAO governance will be performed by the
    top 100 wallets with the highest amount of staked Astra tokens. 
    */
    function checkHighestStaker(uint256 _pid, address user)
        public
        view
        returns (bool)
    {
        HighestAstaStaker[] storage higheststaker = highestStakerInPool[_pid];
        uint256 i = 0;
        for (i; i < higheststaker.length; i++) {
            if (higheststaker[i].addr == user) {
                return true;
            }
        }
    }

    /**
    @notice check Staking Score For Delegation
    @param _pid : pool id
    @param user : user
    @dev Description :After the first 90 days, DAO governors
      will be based on the staking score.
    */
    function checkStakingScoreForDelegation(uint256 _pid, address user)
        public
        view
        returns (bool)
    {
        uint256 sscore = stakingScore(_pid, user);
        uint256 onek = 100000 * 10**18;
        //Any ecosystem member with a staking score higher than [X] can submit a voting proposal.
        //On doc there not staking score value fixed yet for now taking One hundred K Token
        if (sscore == onek) {
            return true;
        } else {
            return false;
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
    function updateBlockReward(uint256 _pid, address _sender) public {
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
        UserInfo storage currentUser = userInfo[_pid][_sender];
        uint256 totalPoolBaseMul = 0;
        address[] memory adds = userAddressesInPool[_pid];
        for (uint256 i = 0; i < adds.length; i++) {
            UserInfo storage user = userInfo[_pid][adds[i]];
            if (user.amount > 0) {
                uint256 mul = getRewardMultiplier(ASTRPoolId, adds[i]);
                if (_sender != adds[i]) {
                    user.preBlockReward = user.preBlockReward.add(blockReward);
                }
                totalPoolBaseMul = totalPoolBaseMul.add(user.amount.mul(mul));
            }
        }
        updateCurBlockReward(
            currentUser,
            _pid,
            blockReward,
            totalPoolBaseMul,
            _sender
        );
        pool.lastRewardBlock = PoolEndBlock;
    }

    function updateCurBlockReward(
        UserInfo storage currentUser,
        uint256 _pid,
        uint256 blockReward,
        uint256 totalPoolBaseMul,
        address _sender
    ) private {
        uint256 userBaseMul =
            currentUser.amount.mul(getRewardMultiplier(ASTRPoolId, _sender));
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
            uint256 mul = getRewardMultiplier(ASTRPoolId, adds[i]);
            totalPoolBaseMul = totalPoolBaseMul.add(user.amount.mul(mul));
        }
        uint256 userBaseMul =
            currentUser.amount.mul(getRewardMultiplier(ASTRPoolId, msg.sender));
        uint256 totalBlockReward = blockReward.add(currentUser.preBlockReward);
        uint256 sharePercentage = userBaseMul.mul(10000).div(totalPoolBaseMul);
        return
            currentUser.totalReward.add(
                (totalBlockReward.mul(sharePercentage)).div(10000)
            );
    }

    function distributeExitFeeShare(uint256 _amount) public {
        require(_amount > 0, "Amount should not be zero");
        distributeIndividualReward(ASTRPoolId, _amount);
    }

    function quickSort(
        uint256 _pid,
        uint256 left,
        uint256 right
    ) internal {
        HighestAstaStaker[] storage arr = highestStakerInPool[_pid];
        if (left >= right) return;
        uint256 divtwo = 2;
        uint256 p = arr[(left + right) / divtwo].deposited; // p = the pivot element
        uint256 i = left;
        uint256 j = right;
        while (i < j) {
            //  HighestAstaStaker memory a;
            // HighestAstaStaker memory b;
            while (arr[i].deposited < p) ++i;
            while (arr[j].deposited > p) --j; // arr[j] > p means p still to the left, so j > 0
            if (arr[i].deposited > arr[j].deposited) {
                (arr[i].deposited, arr[j].deposited) = (
                    arr[j].deposited,
                    arr[i].deposited
                );
                (arr[i].addr, arr[j].addr) = (arr[j].addr, arr[i].addr);
            } else ++i;
        }
        // Note --j was only done when a[j] > p.  So we know: a[j] == p, a[<j] <= p, a[>j] > p
        if (j > left) quickSort(_pid, left, j - 1); // j > left, so j > 0
        quickSort(_pid, j + 1, right);
    }

    function removeHighestStakedUser(uint256 _pid, uint256 _amount, address user) private {
        HighestAstaStaker[] storage highestStaker = highestStakerInPool[_pid];
        for (uint256 i = 0; i < highestStaker.length; i++) {
            if (highestStaker[i].addr == user) {
                delete highestStaker[i];
                if(_amount > 0) {
                    addHighestStakedUser(_pid, _amount, user);
                }
                return;
            }
        }
    }

    /**
    @notice voting power calculation
    @param _pid : pool id
    @param _user : user address
    @dev Description :Voting power is expressed in voting points (VP). One voting point is equivalent to one staking score
    point. Staking score multipliers apply to voting power.. 
    */
    function votingPower(uint256 _pid, address _user)
        external
        view
        returns (uint256)
    {
        //User get x1.3 from the start for locking funds  on 6 month lockup vault.
        //with pool id and user address call the staking score
        uint256 stakingsScore = stakingScore(_pid, _user);

        //User unlocks additional x1.2 for staking score higher or equal than 100k.
        // Accumulated mulitpliers are now x1.5 (1 + 0.3 + 0.2)
        //User unlocks higher bonus  for staking score higher or equal than 300k.
        //Accumulated mulitpliers are now x1.6 (1 + 0.3 + 0.3)
        uint256 rewardMult = getRewardMultiplier(_pid, _user);
        uint256 votingpower = (stakingsScore.mul(rewardMult)).div(10);
        return votingpower;
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
        // bool isValid = Dao(daoAddress).getVotingStatus(msg.sender);
        // require(isValid==true, "should vote active proposal");
        updateBlockReward(_pid, msg.sender);
        UserInfo storage currentUser = userInfo[_pid][msg.sender];
        if (_withStake) {
            uint256 _amount = currentUser.totalReward;
            _stakeASTRReward(msg.sender, ASTRPoolId, _amount);
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

    function stakeASTRReward(
        address _currUserAddr,
        uint256 _pid,
        uint256 _amount
    ) public onlyLmPool {
        _stakeASTRReward(_currUserAddr, _pid, _amount);
    }

    /**
    @notice Staking the ASTR reward in ASTR pool.
    @param _pid : pool id
    @param _currUserAddr : current user address
    @param _amount : amount for staking
    @dev Description :
        This function is called from withdrawASTRReward If user choose to stake the 100% reward. In this function
        the amount will be staked in ASTR pool.
    */
    function _stakeASTRReward(
        address _currUserAddr,
        uint256 _pid,
        uint256 _amount
    ) private {
        UserInfo storage currentUser = userInfo[_pid][_currUserAddr];
        addUserAddress(_currUserAddr, _pid);
        if (_amount > 0) {
            currentUser.amount = currentUser.amount.add(_amount);
            // staking score structure update
            userStakingTrack[_pid][_currUserAddr] = userStakingTrack[_pid][
                _currUserAddr
            ]
                .add(1);
            uint256 userstakeid = userStakingTrack[_pid][_currUserAddr];
            StakeInfo storage staker =
                stakeInfo[_pid][_currUserAddr][userstakeid];
            staker.amount = _amount;
            staker.totalAmount = currentUser.amount;
            staker.timestamp = block.timestamp;
            staker.vault = 3;
            staker.deposit = true;

            //user timestamp
            currentUser.timestamp = block.timestamp;
        }
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
