const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { check } = require("prettier");
const { time } = require("../../Util");

function compareNumber(firstNumber, secondNumber) {
  return Math.round(firstNumber) == Math.round(secondNumber);
}

function convertToWei(number) {
  return ethers.utils.parseUnits(number.toString(), 18);
}

function convertToEther(number) {
  return parseFloat(ethers.utils.formatEther(number.toString()));
}

function differenceOfLargeNumbers(firstNumber, secondNumber) {
  return (firstNumber - secondNumber).toLocaleString("fullwide", {
    useGrouping: false,
  });
}

describe("iToken staking", function () {
  let itokenContract;
  let itokenDeployerContract;
  let itokenDeployer;
  let AstraContract;
  let astra
  let baseCoin;
  let ChefContract;
  let chef;
  let itokenstakingContract;
  let TimelockContract;
  let GovernanceContract;
  let PoolConfiguration;
  let Pool;
  let poolConfiguration;
  let payment;
  let IndicesPayment;
  let pool;
  let itoken;
  let secondItoken;
  let itokenstaking;
  let timelock;
  let governance;
  let owner;
  let addr1;
  let addr2;
  let addrs;
  const BASE_AMOUNT = 1000000;
  const TOTAL_Reward = 10000;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    itokenContract = await ethers.getContractFactory("itoken");
    AstraContract = await ethers.getContractFactory("Token");
    ChefContract = await ethers.getContractFactory("MasterChefV2");
    PoolConfiguration = await ethers.getContractFactory("PoolConfiguration");
    Pool = await ethers.getContractFactory("PoolV2");
    IndicesPayment = await ethers.getContractFactory("IndicesPayment");

    itokenstakingContract = await ethers.getContractFactory("ItokenStaking");
    itokenDeployerContract = await ethers.getContractFactory("itokendeployer");
    GovernanceContract = await ethers.getContractFactory("GovernanceMock");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    astra = await upgrades.deployProxy(AstraContract, [owner.address]);
    await astra.deployed();

    baseCoin = await upgrades.deployProxy(AstraContract, [owner.address]);
    await baseCoin.deployed();


    poolConfiguration = await upgrades.deployProxy(PoolConfiguration,[astra.address]);
    await poolConfiguration.deployed();

    payment = await upgrades.deployProxy(IndicesPayment, [
      astra.address,
      poolConfiguration.address,
      addrs[0].address,
      addrs[0].address,
    ]);
    await payment.deployed();
    await payment.setAstraAmount(0);
    await poolConfiguration.whitelistDAOaddress(owner.address);
    await poolConfiguration.setPaymentAddress(payment.address);
    await poolConfiguration.addStable(baseCoin.address);

    itokenDeployer = await itokenDeployerContract.deploy();
    itokenDeployer.deployed();

    pool = await upgrades.deployProxy(Pool,[astra.address,poolConfiguration.address,itokenDeployer.address,addr1.address,addr1.address, addr1.address, baseCoin.address], {useDeployedImplementation:false});
    await pool.deployed();
    await payment.setdaaAddress(pool.address);

    
    await itokenDeployer.addDaaAdress(pool.address);
    // await itokenDeployer.createnewitoken("Sample Name", "SampleSymbol")
    // let itokenDeployed = await itokenDeployer.getcoin(0);
    // itoken = await itokenContract.attach(itokenDeployed);

    await pool.addPublicPool([astra.address, baseCoin.address], [2,2],convertToWei(10000000000),100,"First Itoken","ITOKEN1","Test Description");
    let itokenDeployed = await itokenDeployer.getcoin(0);
    itoken = await itokenContract.attach(itokenDeployed);
    // await itoken.mint(owner.address, convertToWei(BASE_AMOUNT))
    await baseCoin.approve(pool.address, convertToWei(BASE_AMOUNT))
    await baseCoin.transfer(addr1.address, convertToWei(BASE_AMOUNT))
    await baseCoin.connect(addr1).approve(pool.address, convertToWei(BASE_AMOUNT))
    await baseCoin.transfer(addr2.address, convertToWei(BASE_AMOUNT))
    await baseCoin.connect(addr2).approve(pool.address, convertToWei(BASE_AMOUNT))
    await baseCoin.transfer(addrs[0].address, convertToWei(BASE_AMOUNT))
    await baseCoin.connect(addrs[0]).approve(pool.address, convertToWei(BASE_AMOUNT))
    await pool.poolIn([baseCoin.address], [convertToWei(BASE_AMOUNT)], 0);
    // await itokenDeployer.createnewitoken("Sample Name 2", "SampleSymbol2")
    // itokenDeployed = await itokenDeployer.getcoin(1);
    // secondItoken = await itokenContract.attach(itokenDeployed);
    
    // await secondItoken.mint(owner.address, convertToWei(1000000000))
    // itoken = await upgrades.deployProxy(itokenContract, [owner.address]);
    // await itoken.deployed();

    const startBlock = parseInt(await time.latestBlock()) + 20;
    const endBlock = startBlock + 100;

    // timelock =  await TimelockContract.deploy(owner.address,120);
    // itokenstaking = await itokenstakingContract.deploy(itoken.address, owner.address, 1000, endBlock, startBlock );
    
    chef = await upgrades.deployProxy(ChefContract, [
        astra.address,
        startBlock,
        endBlock,
        convertToWei(TOTAL_Reward),
      ]);

    itokenstaking = await upgrades.deployProxy(itokenstakingContract, [
      astra.address,
      pool.address,
      startBlock,
      endBlock,
      convertToWei(TOTAL_Reward),
    ]);
    // await itoken.addChefAddress(itokenstaking.address);
    await itokenstaking.deployed();
    await itoken.addChefAddress(itokenstaking.address)
    // await itokenstaking.connect(owner).add(100, false);
    await itokenstaking.addItoken(itoken.address,0);
    
    governance = await GovernanceContract.deploy();
    await itokenstaking.setGovernanceAddress(governance.address);

    await itoken.connect(owner).approve(itokenstaking.address, convertToWei(BASE_AMOUNT));

    await pool.connect(addr1).poolIn([baseCoin.address], [convertToWei(BASE_AMOUNT)], 0);
    await itoken.connect(addr1).approve(itokenstaking.address, convertToWei(BASE_AMOUNT));

    await pool.connect(addr2).poolIn([baseCoin.address], [convertToWei(BASE_AMOUNT)], 0);
    await itoken.connect(addr2).approve(itokenstaking.address, convertToWei(BASE_AMOUNT));

    await pool.connect(addrs[0]).poolIn([baseCoin.address], [convertToWei(BASE_AMOUNT)], 0);
    await itoken
      .connect(addrs[0])
      .approve(itokenstaking.address, convertToWei(BASE_AMOUNT));

    // await itoken.transfer(itokenstaking.address, convertToWei(TOTAL_Reward));
    await astra.connect(owner).transfer(itokenstaking.address, convertToWei(TOTAL_Reward));

  });


  describe("Deposit in different decimal coins", function () {
    beforeEach(async function () {
      await baseCoin.approve(pool.address, convertToWei(BASE_AMOUNT));
      // // await itokenstaking.connect(owner).add(100, itoken.address, true);
    });

    it("Deposit with 6 decimal points", async function () {
      await itokenDeployer.updateDecimalValue(6);
      await pool.addPublicPool([astra.address, baseCoin.address], [2,2],convertToWei(10000000000),100,"First Itoken","ITOKEN1","Test Description");
      let itokenDeployed = await itokenDeployer.getcoin(1);
      itokenTmp = await itokenContract.attach(itokenDeployed);
      await itokenTmp.addChefAddress(itokenstaking.address)
      await pool.poolIn([baseCoin.address], [convertToWei(BASE_AMOUNT)], 1);
      await itokenTmp.approve(itokenstaking.address, convertToWei(BASE_AMOUNT));
      await itoken.approve(itokenstaking.address, convertToWei(BASE_AMOUNT));
      await itokenstaking.addItoken(itokenTmp.address, 1);

      let decimal = await itokenTmp.decimals();
      console.log("itoken balance ",decimal);

      await itokenstaking.connect(addr1).deposit( 0, convertToWei(100), 0);
      await itokenstaking.deposit( 1, convertToWei(100), 0);

      let depositedAmount = await itokenstaking.userInfo(0,owner.address);

      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let beforeClaimBalance = await astra.balanceOf(owner.address);
      await itokenstaking.claimAstra();
      let AfterClaimBalance = await astra.balanceOf(owner.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );

    });

    it("Deposit with 18 decimal points", async function () {

      await itokenDeployer.updateDecimalValue(18);
      await pool.addPublicPool([astra.address, baseCoin.address], [2,2],convertToWei(10000000000),100,"First Itoken","ITOKEN1","Test Description");
      let itokenDeployed = await itokenDeployer.getcoin(1);
      itokenTmp = await itokenContract.attach(itokenDeployed);
      await itokenTmp.addChefAddress(itokenstaking.address)
      await pool.poolIn([baseCoin.address], [convertToWei(BASE_AMOUNT)], 1);
      await itokenTmp.connect(owner).approve(itokenstaking.address, convertToWei(BASE_AMOUNT));
      await itoken.connect(addr1).approve(itokenstaking.address, convertToWei(BASE_AMOUNT));
      await itokenstaking.addItoken(itokenTmp.address, 1);

      let decimal = await itokenTmp.decimals();

      await itokenstaking.connect(addr1).deposit( 0, convertToWei(100), 0);
      await itokenstaking.deposit( 1, convertToWei(100), 0);

      let depositedAmount = await itokenstaking.userInfo(0,owner.address);


      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let beforeClaimBalance = await astra.balanceOf(owner.address);
      await itokenstaking.claimAstra();
      let AfterClaimBalance = await astra.balanceOf(owner.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      
    });    

    it("Only whitelisted should be able deposit", async function () {
      await itokenstaking.connect(owner).whitelistDepositContract(addr2.address, true);
      await itokenstaking
        .connect(addr2)
        .depositWithUserAddress(0, convertToWei(100), 0, addr1.address);
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward)).to.equal(true);
    });
  });

  describe("Slashing fees", function () {
    beforeEach(async function () {
      // // await itokenstaking.connect(owner).add(100, itoken.address, true);
      await itokenstaking.connect(addr1).deposit(0, convertToWei(100), 0);
    });

    it("Users slashing fees parameter should be updated correctly", async function () {
      const latestTime = parseInt(await time.latest());
      expect(await itokenstaking.averageStakedTime(0, addr1.address)).to.equal(latestTime);
    });

    it("Users slashing fees parameter should be updated correctly after multiple deposit", async function () {
      const beforeDepositTime = parseInt(await time.latest());
      await time.increase(1000);
      await itokenstaking.connect(addr1).deposit(0, convertToWei(10000), 0);
      const afterDepositTime = parseInt(await time.latest());
      const averageTime = parseInt(await itokenstaking.averageStakedTime(0, addr1.address))
      // console.log("beforeDepositTime ", beforeDepositTime)
      // console.log("afterDepositTime ", afterDepositTime)
      // console.log("averageTime ", averageTime)
      expect(averageTime).to.equal(afterDepositTime-10);
    });

    it("Users slashing fees parameter should be updated correctly after withdrawal", async function () {
      const beforeDepositTime = parseInt(await time.latest());
      await time.increase(1000);
      await itokenstaking.connect(addr1).deposit(0, convertToWei(10000), 12);
      const afterDepositTime = parseInt(await time.latest());

      await itokenstaking.connect(addr1).withdraw(0, false)
      await time.increase(86401);
      await itokenstaking.connect(addr1).withdraw(0, false)
      const averageTime = parseInt(await itokenstaking.averageStakedTime(0, addr1.address))

      expect(afterDepositTime).to.equal(averageTime);
    });

    it("Users rewards should be slashed if they try to claim before 90 days time period.", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward / 10)).to.equal(true);
    });

    it("Slashing fees should decrease over period of time.", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("864000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, (TOTAL_Reward * 20) / 100)).to.equal(
        true
      );
    });
    it("Slashing fees should adjust in other users rewards", async function () {
      await itokenstaking.connect(addr2).deposit( 0, convertToWei(100), 0);
      const latestBlock = parseInt(await time.latestBlock());
      await time.increase("864000");
      await time.advanceBlockTo(latestBlock + 27);

      let beforeClaimBalanceFirstUser = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalanceFirstUser = await astra.balanceOf(addr1.address);
      let finalRewardsFirstUser = convertToEther(
        differenceOfLargeNumbers(
          AfterClaimBalanceFirstUser,
          beforeClaimBalanceFirstUser
        )
      );

      await time.advanceBlockTo(latestBlock + 127);
      await time.increase("7776000");

      let user1Reward = convertToEther(
        await itokenstaking.pendingAstra(addr1.address)
      );
      let user2Reward = convertToEther(
        await itokenstaking.pendingAstra(addr2.address)
      );

      expect(
        compareNumber(
          user1Reward + user2Reward + finalRewardsFirstUser,
          TOTAL_Reward
        )
      ).to.equal(true);
    });

    it("Slashing fees should be zero after 90 days", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward)).to.equal(true);
    });
  });

  describe("Distribute additional rewards", function () {
    beforeEach(async function () {
      await astra.transfer(addr2.address, convertToWei(BASE_AMOUNT));
      await astra.connect(addr2).approve(itokenstaking.address, convertToWei(BASE_AMOUNT));
      await itokenstaking.connect(owner).whitelistDistributionAddress(addr2.address, true)
    });
    it("Only owner can whitelist distibutor address address", async function () {
      await expect(
        itokenstaking.connect(addr1).whitelistDistributionAddress(addr1.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Non whitelisted should not be able to distribute", async function () {
      await expect(
        itokenstaking
          .connect(addr1)
          .distributeAdditionalReward(convertToWei(100))
      ).to.be.revertedWith("Not eligible");
    });

    it("Per block rewards should be updated correctly", async function () {
      let perblock = convertToEther(await itokenstaking.astraPerBlock()); 
      console.log("perblock", perblock );
      await itokenstaking.connect(addr2).distributeAdditionalReward(convertToWei(TOTAL_Reward));
       perblock = convertToEther(await itokenstaking.astraPerBlock()); 
      console.log("perblock", perblock );
      expect(compareNumber(perblock, 2*TOTAL_Reward/100)).to.equal(true);
    });

    it("Distribute rewards", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 17);
      await itokenstaking.connect(addr1).deposit( 0, convertToWei(100), 0);
      let perblock = parseInt(await chef.astraPerBlock()); 
      // console.log("Before distribution ", perblock);
      await itokenstaking.connect(addr2).distributeAdditionalReward(convertToWei(TOTAL_Reward));
      perblock = parseInt(await chef.astraPerBlock()); 
      // console.log("After distribution ", perblock);
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, 2*TOTAL_Reward)).to.equal(true);

    });  
  });

  describe("Withdraw functionality", function () {
    beforeEach(async function () {
      await itokenstaking.connect(addr1).deposit( 0, convertToWei(100), 0);
      await itokenstaking.connect(addr2).deposit( 0, convertToWei(100), 0);
    });

    it("Other user should get reward after withdraw", async function () {
      let latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 21);
      await itokenstaking.connect(addr1).withdraw( 0, false);
      await time.increase("31536000");
      let beforeStakeDepositAmount = convertToEther(
        (await itokenstaking.userInfo(0, addr1.address))["amount"]
      );
      
      await itokenstaking.connect(addr1).withdraw( 0, false);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 124);

      let afterStakeDepositAmount = convertToEther(
        (await itokenstaking.userInfo(0, addr1.address))["amount"]
      );

      let firstUserReward = convertToEther(
        await itokenstaking.pendingAstra( addr1.address)
      );
      let secondUserReward = convertToEther(
        await itokenstaking.pendingAstra( addr2.address)
      );
      
      expect(
        compareNumber(
          afterStakeDepositAmount +
            firstUserReward +
            secondUserReward,
          9000
        )
      ).to.equal(true);
    });

    it("After withdraw user should get proper tokens back", async function () {
      let latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 23);
      let beforeWithdrawBalance = convertToEther(await itoken.balanceOf(addr1.address));
      await itokenstaking.connect(addr1).withdraw( 0, false);
      await time.increase("31536000");
      await itokenstaking.connect(addr1).withdraw( 0, false);
      let AfterWithdrawBalance = convertToEther(await itoken.balanceOf(addr1.address));
      expect(
        compareNumber(
            AfterWithdrawBalance -
            beforeWithdrawBalance,
          100
        )
      ).to.equal(true);      
    });

    it("User should not be able to withdraw before cooldown", async function () {
      let latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 23);
      await itokenstaking.connect(addr1).withdraw( 0, false);
      await expect(itokenstaking.connect(addr1).withdraw( 0, false)).to.be.revertedWith("withdraw: cooldown period");
    });

    it("User can withdraw anytime after withdraw time", async function () {
      let latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 23);
      await itokenstaking.connect(addr1).withdraw( 0, false);

      let beforeWithdrawBalance = convertToEther(await itoken.balanceOf(addr1.address));
      await time.increase("3153600000");
      await itokenstaking.connect(addr1).withdraw( 0, false);
      let AfterWithdrawBalance = convertToEther(await itoken.balanceOf(addr1.address));
      expect(
        compareNumber(
            AfterWithdrawBalance -
            beforeWithdrawBalance,
          100
        )
      ).to.equal(true);   
    });


  });

  describe("Restake functionality", function () {
    beforeEach(async function () {
      // await chef.connect(owner).add(100, astra.address, true);
      await chef.whitelistDepositContract(itokenstaking.address, true);
      await itokenstaking.setAstraStakingContract(chef.address);
      await itokenstaking.connect(addr1).deposit( 0, convertToWei(100), 0);
      await itokenstaking.connect(addr2).deposit( 0, convertToWei(100), 0);
    });

    it("Restake users should get more reward then normal user if intial stake at same time ", async function () {
      let latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 24);
      await time.increase("31536000");
      let beforeStakeDepositAmount = convertToEther(
        (await chef.userInfo(0, addr1.address))["amount"]
      );

      await itokenstaking.connect(addr1).restakeAstraReward();
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 124);

      let afterStakeDepositAmount = convertToEther(
        (await chef.userInfo(0, addr1.address))["amount"]
      );

      let firstUserReward = convertToEther(
        await itokenstaking.pendingAstra( addr1.address)
      );
      let secondUserReward = convertToEther(
        await itokenstaking.pendingAstra( addr2.address)
      );
      // At 1000 reward it was restaked
      expect(
        compareNumber(
          afterStakeDepositAmount -
            beforeStakeDepositAmount +
            firstUserReward +
            secondUserReward,
          TOTAL_Reward
        )
      ).to.equal(true);
    });
  });

  describe("Reward distribution single without any multiplier", function () {
    beforeEach(async function () {
      // // await itokenstaking.connect(owner).add(100, itoken.address, true);
      await itokenstaking.connect(addr1).deposit( 0, convertToWei(100), 0);
    });

    it("Check reward after 10 blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 15);
      let userReward = await itokenstaking.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), 1000)).to.equal(true);
    });

    it("Check reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      let userReward = await itokenstaking.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), TOTAL_Reward)).to.equal(
        true
      );
    });
    it("Claim reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward)).to.equal(true);
    });
  });

  describe("Reward distribution single with vault multiplier", function () {
    beforeEach(async function () {
      // // await itokenstaking.connect(owner).add(100, itoken.address, true);
      await itokenstaking
        .connect(addr1)
        .deposit( 0, ethers.utils.parseUnits("100", 18), 12);
    });

    it("Check reward after 10 blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 15);
      let userReward = await itokenstaking.pendingAstra( addr1.address);
      console.log("Reward ", userReward);
      expect(compareNumber(convertToEther(userReward), 1000)).to.equal(true);
    });

    it("Check reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      let userReward = await itokenstaking.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), TOTAL_Reward)).to.equal(
        true
      );
    });
    it("Claim reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward)).to.equal(true);
    });
  });

  describe("Reward distribution single with staking score multiplier", function () {
    beforeEach(async function () {
      // // await itokenstaking.connect(owner).add(100, itoken.address, true);
      await itokenstaking
        .connect(addr1)
        .deposit( 0, ethers.utils.parseUnits("800000", 18), 0);
    });

    it("Check reward after 10 blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 14);
      await time.increase("5184000");
      let userReward = await itokenstaking.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), 1000)).to.equal(true);
    });

    it("Check reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("5184000");
      let userReward = await itokenstaking.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), TOTAL_Reward)).to.equal(
        true
      );
    });
    it("Claim reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward)).to.equal(true);
    });
  });

  describe("Reward distribution single with both staking score and vault multiplier", function () {
    beforeEach(async function () {
      // // await itokenstaking.connect(owner).add(100, itoken.address, true);
      await itokenstaking
        .connect(addr1)
        .deposit(0, ethers.utils.parseUnits("800000", 18), 12);
    });

    it("Check reward after 10 blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 15);
      let userReward = await itokenstaking.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), 1000)).to.equal(true);
    });

    it("Check reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      let userReward = await itokenstaking.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), TOTAL_Reward)).to.equal(
        true
      );
    });
    it("Claim reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward)).to.equal(true);
    });
  });

  describe("Reward distribution with multiple user", function () {
    beforeEach(async function () {
      // // await itokenstaking.connect(owner).add(100, itoken.address, true);
    });

    it("Check with same multiplier and same deposit amount", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await itokenstaking
        .connect(addr1)
        .deposit(0, ethers.utils.parseUnits("800000", 18), 12);
      await itokenstaking
        .connect(addr2)
        .deposit(0, ethers.utils.parseUnits("800000", 18), 12);
      await itokenstaking
        .connect(addrs[0])
        .deposit(0, ethers.utils.parseUnits("800000", 18), 12);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await itokenstaking.connect(addr1).claimAstra();
      await itokenstaking.connect(addr2).claimAstra();
      await itokenstaking.connect(addrs[0]).claimAstra();

      let user1AfterClaimBalance = await astra.balanceOf(addr1.address);
      let user2AfterClaimBalance = await astra.balanceOf(addr2.address);
      let user3AfterClaimBalance = await astra.balanceOf(addrs[0].address);

      let user1Rewards = convertToEther(
        differenceOfLargeNumbers(
          user1AfterClaimBalance,
          user1BeforeClaimBalance
        )
      );
      let user2Rewards = convertToEther(
        differenceOfLargeNumbers(
          user2AfterClaimBalance,
          user2BeforeClaimBalance
        )
      );
      let user3Rewards = convertToEther(
        differenceOfLargeNumbers(
          user3AfterClaimBalance,
          user3BeforeClaimBalance
        )
      );
      expect(
        compareNumber(user1Rewards + user2Rewards + user3Rewards, TOTAL_Reward)
      ).to.equal(true);
    });

    it("Check with same multiplier but different deposit amount", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await itokenstaking
        .connect(addr1)
        .deposit(0, ethers.utils.parseUnits("100", 18), 12);
      await itokenstaking
        .connect(addr2)
        .deposit(0, ethers.utils.parseUnits("300", 18), 12);
      await itokenstaking
        .connect(addrs[0])
        .deposit(0, ethers.utils.parseUnits("400", 18), 12);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await itokenstaking.connect(addr1).claimAstra();
      await itokenstaking.connect(addr2).claimAstra();
      await itokenstaking.connect(addrs[0]).claimAstra();

      let user1AfterClaimBalance = await astra.balanceOf(addr1.address);
      let user2AfterClaimBalance = await astra.balanceOf(addr2.address);
      let user3AfterClaimBalance = await astra.balanceOf(addrs[0].address);

      let user1Rewards = convertToEther(
        differenceOfLargeNumbers(
          user1AfterClaimBalance,
          user1BeforeClaimBalance
        )
      );
      let user2Rewards = convertToEther(
        differenceOfLargeNumbers(
          user2AfterClaimBalance,
          user2BeforeClaimBalance
        )
      );
      let user3Rewards = convertToEther(
        differenceOfLargeNumbers(
          user3AfterClaimBalance,
          user3BeforeClaimBalance
        )
      );

      // console.log("User balance 1", user1Rewards)
      // console.log("User balance 2", user2Rewards)
      // console.log("User balance 3", user3Rewards)
      expect(
        compareNumber(user1Rewards + user2Rewards + user3Rewards, TOTAL_Reward)
      ).to.equal(true);
    });
    it("Check with different multiplier and same deposit amount", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await itokenstaking
        .connect(addr1)
        .deposit( 0, ethers.utils.parseUnits("800000", 18), 6);
      await itokenstaking
        .connect(addr2)
        .deposit( 0, ethers.utils.parseUnits("800000", 18), 12);
      await itokenstaking
        .connect(addrs[0])
        .deposit( 0, ethers.utils.parseUnits("800000", 18), 0);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await itokenstaking.connect(addr1).claimAstra();
      await itokenstaking.connect(addr2).claimAstra();
      await itokenstaking.connect(addrs[0]).claimAstra();

      let user1AfterClaimBalance = await astra.balanceOf(addr1.address);
      let user2AfterClaimBalance = await astra.balanceOf(addr2.address);
      let user3AfterClaimBalance = await astra.balanceOf(addrs[0].address);

      let user1Rewards = convertToEther(
        differenceOfLargeNumbers(
          user1AfterClaimBalance,
          user1BeforeClaimBalance
        )
      );
      let user2Rewards = convertToEther(
        differenceOfLargeNumbers(
          user2AfterClaimBalance,
          user2BeforeClaimBalance
        )
      );
      let user3Rewards = convertToEther(
        differenceOfLargeNumbers(
          user3AfterClaimBalance,
          user3BeforeClaimBalance
        )
      );

      // console.log("User balance 1", user1Rewards)
      // console.log("User balance 2", user2Rewards)
      // console.log("User balance 3", user3Rewards)
      expect(
        compareNumber(user1Rewards + user2Rewards + user3Rewards, TOTAL_Reward)
      ).to.equal(true);
    });

    it("Check with different multiplier and different deposit amount", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await itokenstaking
        .connect(addr1)
        .deposit( 0, ethers.utils.parseUnits("300000", 18), 0);
      await itokenstaking
        .connect(addr2)
        .deposit( 0, ethers.utils.parseUnits("800000", 18), 12);
      await itokenstaking
        .connect(addrs[0])
        .deposit( 0, ethers.utils.parseUnits("100000", 18), 6);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await itokenstaking.connect(addr1).claimAstra();
      await itokenstaking.connect(addr2).claimAstra();
      await itokenstaking.connect(addrs[0]).claimAstra();

      let user1AfterClaimBalance = await astra.balanceOf(addr1.address);
      let user2AfterClaimBalance = await astra.balanceOf(addr2.address);
      let user3AfterClaimBalance = await astra.balanceOf(addrs[0].address);

      let user1Rewards = convertToEther(
        differenceOfLargeNumbers(
          user1AfterClaimBalance,
          user1BeforeClaimBalance
        )
      );
      let user2Rewards = convertToEther(
        differenceOfLargeNumbers(
          user2AfterClaimBalance,
          user2BeforeClaimBalance
        )
      );
      let user3Rewards = convertToEther(
        differenceOfLargeNumbers(
          user3AfterClaimBalance,
          user3BeforeClaimBalance
        )
      );

      // console.log("User balance 1", user1Rewards)
      // console.log("User balance 2", user2Rewards)
      // console.log("User balance 3", user3Rewards)
      expect(
        compareNumber(user1Rewards + user2Rewards + user3Rewards, TOTAL_Reward)
      ).to.equal(true);
    });

    it("Check with different multiplier and different deposit amount", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await itokenstaking
        .connect(addr1)
        .deposit(0, ethers.utils.parseUnits("300000", 18), 0);
      await itokenstaking
        .connect(addr2)
        .deposit(0, ethers.utils.parseUnits("800000", 18), 12);
      await itokenstaking
        .connect(addrs[0])
        .deposit(0, ethers.utils.parseUnits("100000", 18), 6);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await itokenstaking.connect(addr1).claimAstra();
      await itokenstaking.connect(addr2).claimAstra();
      await itokenstaking.connect(addrs[0]).claimAstra();

      let user1AfterClaimBalance = await astra.balanceOf(addr1.address);
      let user2AfterClaimBalance = await astra.balanceOf(addr2.address);
      let user3AfterClaimBalance = await astra.balanceOf(addrs[0].address);

      let user1Rewards = convertToEther(
        differenceOfLargeNumbers(
          user1AfterClaimBalance,
          user1BeforeClaimBalance
        )
      );
      let user2Rewards = convertToEther(
        differenceOfLargeNumbers(
          user2AfterClaimBalance,
          user2BeforeClaimBalance
        )
      );
      let user3Rewards = convertToEther(
        differenceOfLargeNumbers(
          user3AfterClaimBalance,
          user3BeforeClaimBalance
        )
      );

      // console.log("User balance 1", user1Rewards)
      // console.log("User balance 2", user2Rewards)
      // console.log("User balance 3", user3Rewards)
      expect(
        compareNumber(user1Rewards + user2Rewards + user3Rewards, TOTAL_Reward)
      ).to.equal(true);
    });

    it("Check with same multiplier and same deposit amount at different time", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await itokenstaking
        .connect(addr1)
        .deposit(0, ethers.utils.parseUnits("800000", 18), 12);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 30);
      await itokenstaking
        .connect(addr2)
        .deposit(0, ethers.utils.parseUnits("800000", 18), 12);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 20);
      await itokenstaking
        .connect(addrs[0])
        .deposit(0, ethers.utils.parseUnits("800000", 18), 12);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await itokenstaking.connect(addr1).claimAstra();
      await itokenstaking.connect(addr2).claimAstra();
      await itokenstaking.connect(addrs[0]).claimAstra();

      let user1AfterClaimBalance = await astra.balanceOf(addr1.address);
      let user2AfterClaimBalance = await astra.balanceOf(addr2.address);
      let user3AfterClaimBalance = await astra.balanceOf(addrs[0].address);

      let user1Rewards = convertToEther(
        differenceOfLargeNumbers(
          user1AfterClaimBalance,
          user1BeforeClaimBalance
        )
      );
      let user2Rewards = convertToEther(
        differenceOfLargeNumbers(
          user2AfterClaimBalance,
          user2BeforeClaimBalance
        )
      );
      let user3Rewards = convertToEther(
        differenceOfLargeNumbers(
          user3AfterClaimBalance,
          user3BeforeClaimBalance
        )
      );

      // console.log("User balance 1", user1Rewards)
      // console.log("User balance 2", user2Rewards)
      // console.log("User balance 3", user3Rewards)
      expect(
        compareNumber(user1Rewards + user2Rewards + user3Rewards, TOTAL_Reward)
      ).to.equal(true);
    });

    it("Check with same multiplier and different deposit amount at different time", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await itokenstaking
        .connect(addr1)
        .deposit(0, ethers.utils.parseUnits("1000", 18), 12);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 30);
      await itokenstaking
        .connect(addr2)
        .deposit(0, ethers.utils.parseUnits("2000", 18), 12);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 20);
      await itokenstaking
        .connect(addrs[0])
        .deposit(0, ethers.utils.parseUnits("3000", 18), 12);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await itokenstaking.connect(addr1).claimAstra();
      await itokenstaking.connect(addr2).claimAstra();
      await itokenstaking.connect(addrs[0]).claimAstra();

      let user1AfterClaimBalance = await astra.balanceOf(addr1.address);
      let user2AfterClaimBalance = await astra.balanceOf(addr2.address);
      let user3AfterClaimBalance = await astra.balanceOf(addrs[0].address);

      let user1Rewards = convertToEther(
        differenceOfLargeNumbers(
          user1AfterClaimBalance,
          user1BeforeClaimBalance
        )
      );
      let user2Rewards = convertToEther(
        differenceOfLargeNumbers(
          user2AfterClaimBalance,
          user2BeforeClaimBalance
        )
      );
      let user3Rewards = convertToEther(
        differenceOfLargeNumbers(
          user3AfterClaimBalance,
          user3BeforeClaimBalance
        )
      );

      // console.log("User balance 1", user1Rewards)
      // console.log("User balance 2", user2Rewards)
      // console.log("User balance 3", user3Rewards)
      expect(
        compareNumber(user1Rewards + user2Rewards + user3Rewards, TOTAL_Reward)
      ).to.equal(true);
    });
    it("Check with different multiplier and different deposit amount at different time", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await itokenstaking
        .connect(addr1)
        .deposit(0, ethers.utils.parseUnits("1000", 18), 0);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 30);
      await itokenstaking
        .connect(addr2)
        .deposit(0, ethers.utils.parseUnits("2000", 18), 12);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 20);
      await itokenstaking
        .connect(addrs[0])
        .deposit(0, ethers.utils.parseUnits("3000", 18), 6);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await itokenstaking.connect(addr1).claimAstra();
      await itokenstaking.connect(addr2).claimAstra();
      await itokenstaking.connect(addrs[0]).claimAstra();

      let user1AfterClaimBalance = await astra.balanceOf(addr1.address);
      let user2AfterClaimBalance = await astra.balanceOf(addr2.address);
      let user3AfterClaimBalance = await astra.balanceOf(addrs[0].address);

      let user1Rewards = convertToEther(
        differenceOfLargeNumbers(
          user1AfterClaimBalance,
          user1BeforeClaimBalance
        )
      );
      let user2Rewards = convertToEther(
        differenceOfLargeNumbers(
          user2AfterClaimBalance,
          user2BeforeClaimBalance
        )
      );
      let user3Rewards = convertToEther(
        differenceOfLargeNumbers(
          user3AfterClaimBalance,
          user3BeforeClaimBalance
        )
      );

      // console.log("User balance 1", user1Rewards)
      // console.log("User balance 2", user2Rewards)
      // console.log("User balance 3", user3Rewards)
      expect(
        compareNumber(user1Rewards + user2Rewards + user3Rewards, TOTAL_Reward)
      ).to.equal(true);
    });
    it("Check with different multiplier and same deposit amount at different time", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await itokenstaking
        .connect(addr1)
        .deposit(0, ethers.utils.parseUnits("1000", 18), 0);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 30);
      await itokenstaking
        .connect(addr2)
        .deposit(0, ethers.utils.parseUnits("1000", 18), 12);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 20);
      await itokenstaking
        .connect(addrs[0])
        .deposit(0, ethers.utils.parseUnits("1000", 18), 6);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await itokenstaking.connect(addr1).claimAstra();
      await itokenstaking.connect(addr2).claimAstra();
      await itokenstaking.connect(addrs[0]).claimAstra();

      let user1AfterClaimBalance = await astra.balanceOf(addr1.address);
      let user2AfterClaimBalance = await astra.balanceOf(addr2.address);
      let user3AfterClaimBalance = await astra.balanceOf(addrs[0].address);

      let user1Rewards = convertToEther(
        differenceOfLargeNumbers(
          user1AfterClaimBalance,
          user1BeforeClaimBalance
        )
      );
      let user2Rewards = convertToEther(
        differenceOfLargeNumbers(
          user2AfterClaimBalance,
          user2BeforeClaimBalance
        )
      );
      let user3Rewards = convertToEther(
        differenceOfLargeNumbers(
          user3AfterClaimBalance,
          user3BeforeClaimBalance
        )
      );

      // console.log("User balance 1", user1Rewards)
      // console.log("User balance 2", user2Rewards)
      // console.log("User balance 3", user3Rewards)
      expect(
        compareNumber(user1Rewards + user2Rewards + user3Rewards, TOTAL_Reward)
      ).to.equal(true);
    });
  });
});
