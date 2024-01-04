const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { check } = require("prettier");
const { time } = require("../../utils");

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

describe("Itoken staking", function () {
  let AstraContract;
  let ChefContract;
  let TimelockContract;
  let GovernanceContract;
  let astra;
  let chef;
  let timelock;
  let governance;
  let owner;
  let addr1;
  let addr2;
  let addrs;
  const BASE_AMOUNT = 1000000;
  const TOTAL_Reward = 10000;
  const REDUCE_AMOUNT = 100;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    itokenContract = await ethers.getContractFactory("itoken");
    AstraContract = await ethers.getContractFactory("AstraDAOToken");
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

    poolConfiguration = await upgrades.deployProxy(PoolConfiguration, [
      astra.address,
    ]);
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

    pool = await upgrades.deployProxy(
      Pool,
      [
        astra.address,
        poolConfiguration.address,
        itokenDeployer.address,
        addr1.address,
        addr1.address,
        addr1.address,
        baseCoin.address,
      ],
      { useDeployedImplementation: false }
    );
    await pool.deployed();
    await payment.setdaaAddress(pool.address);

    await itokenDeployer.addDaaAdress(pool.address);

    await pool.addPublicPool(
      [astra.address, baseCoin.address],
      [2, 2],
      convertToWei(10000000000),
      100,
      "First Itoken",
      "ITOKEN1",
      "Test Description"
    );
    let itokenDeployed = await itokenDeployer.getcoin(0);
    itoken = await itokenContract.attach(itokenDeployed);
    await baseCoin.approve(pool.address, convertToWei(BASE_AMOUNT));
    await baseCoin.transfer(addr1.address, convertToWei(BASE_AMOUNT));
    await baseCoin
      .connect(addr1)
      .approve(pool.address, convertToWei(BASE_AMOUNT));
    await baseCoin.transfer(addr2.address, convertToWei(BASE_AMOUNT));
    await baseCoin
      .connect(addr2)
      .approve(pool.address, convertToWei(BASE_AMOUNT));
    await baseCoin.transfer(addrs[0].address, convertToWei(BASE_AMOUNT));
    await baseCoin
      .connect(addrs[0])
      .approve(pool.address, convertToWei(BASE_AMOUNT));
    await pool.poolIn([baseCoin.address], [convertToWei(BASE_AMOUNT)], 0);

    const startBlock = parseInt(await time.latestBlock()) + 20;
    const endBlock = startBlock + 100;

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
    await itokenstaking.deployed();
    await itoken.addChefAddress(itokenstaking.address);
    await itokenstaking.addItoken(itoken.address, 0);

    governance = await GovernanceContract.deploy();
    await itokenstaking.setGovernanceAddress(governance.address);

    await itoken
      .connect(owner)
      .approve(itokenstaking.address, convertToWei(BASE_AMOUNT));

    await pool
      .connect(addr1)
      .poolIn([baseCoin.address], [convertToWei(BASE_AMOUNT)], 0);
    await itoken
      .connect(addr1)
      .approve(itokenstaking.address, convertToWei(BASE_AMOUNT));

    await pool
      .connect(addr2)
      .poolIn([baseCoin.address], [convertToWei(BASE_AMOUNT)], 0);
    await itoken
      .connect(addr2)
      .approve(itokenstaking.address, convertToWei(BASE_AMOUNT));

    await pool
      .connect(addrs[0])
      .poolIn([baseCoin.address], [convertToWei(BASE_AMOUNT)], 0);
    await itoken
      .connect(addrs[0])
      .approve(itokenstaking.address, convertToWei(BASE_AMOUNT));

    await astra
      .connect(owner)
      .transfer(itokenstaking.address, convertToWei(TOTAL_Reward));
  });

  describe("Deployment", function () {
    it("Should set the right owner Astra token", async function () {
      expect(await astra.owner()).to.equal(owner.address);
      await expect(
        astra.connect(addr1).setSellLimitTime(900)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Decrease reward rate", function () {
    beforeEach(async function () {
      await itokenstaking
        .connect(owner)
        .whitelistDistributionAddress(addr2.address, true);
    });
    it("Only owner can whitelist distibutor address address", async function () {
      await expect(
        itokenstaking
          .connect(addr1)
          .whitelistDistributionAddress(addr1.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Non whitelisted should not be able to distribute", async function () {
      await expect(
        itokenstaking.connect(addr1).decreaseRewardRate(convertToWei(100))
      ).to.be.revertedWith("Not eligible");
    });

    it("Call should get the descreased amount back", async function () {
      let userBalanceBeforeDecreasingReward = await astra.balanceOf(
        addr2.address
      );
      await itokenstaking
        .connect(addr2)
        .decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      let userBalanceAfterDecreasingReward = await astra.balanceOf(
        addr2.address
      );
      let decreasedReward = convertToEther(
        differenceOfLargeNumbers(
          userBalanceAfterDecreasingReward,
          userBalanceBeforeDecreasingReward
        )
      );
      expect(compareNumber(decreasedReward, REDUCE_AMOUNT)).to.equal(true);
    });

    it("Per block rewards should be updated correctly", async function () {
      await itokenstaking
        .connect(addr2)
        .decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = convertToEther(await itokenstaking.astraPerBlock());
      expect(
        compareNumber(perblock, (TOTAL_Reward - REDUCE_AMOUNT) / 100)
      ).to.equal(true);
    });

    it("Decrease rewards", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 17);
      await itokenstaking.connect(addr1).deposit(0, convertToWei(100), 0);
      let perblock = parseInt(await chef.astraPerBlock());
      await itokenstaking
        .connect(addr2)
        .decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(
        compareNumber(finalRewards, TOTAL_Reward - REDUCE_AMOUNT)
      ).to.equal(true);
    });

    it("Decrease rewards in between staking", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 17);
      await itokenstaking.connect(addr1).deposit(0, convertToWei(100), 0);
      let perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 50);
      await itokenstaking
        .connect(addr2)
        .decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(
        compareNumber(finalRewards, TOTAL_Reward - REDUCE_AMOUNT)
      ).to.equal(true);
    });

    it("Decrease rewards for multiple users", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 17);
      await itokenstaking.connect(addr1).deposit(0, convertToWei(100), 0);
      await itokenstaking.connect(addr2).deposit(0, convertToWei(500), 0);
      let perblock = parseInt(await chef.astraPerBlock());
      await itokenstaking
        .connect(addr2)
        .decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let firstUserbeforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let firstUserAfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewardsFirstUSer = convertToEther(
        differenceOfLargeNumbers(
          firstUserAfterClaimBalance,
          firstUserbeforeClaimBalance
        )
      );

      let secondUserbeforeClaimBalance = await astra.balanceOf(addr2.address);
      await itokenstaking.connect(addr2).claimAstra();
      let secondUserAfterClaimBalance = await astra.balanceOf(addr2.address);
      let finalRewardsSecondUser = convertToEther(
        differenceOfLargeNumbers(
          secondUserAfterClaimBalance,
          secondUserbeforeClaimBalance
        )
      );
      expect(
        compareNumber(
          finalRewardsFirstUSer + finalRewardsSecondUser,
          TOTAL_Reward - REDUCE_AMOUNT
        )
      ).to.equal(true);
    });

    it("Decrease rewards in between staking multiple users", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 17);
      await itokenstaking.connect(addr1).deposit(0, convertToWei(100), 0);
      await itokenstaking.connect(addr2).deposit(0, convertToWei(500), 0);
      let perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 50);
      await itokenstaking
        .connect(addr2)
        .decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let firstUserbeforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).claimAstra();
      let firstUserAfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewardsFirstUSer = convertToEther(
        differenceOfLargeNumbers(
          firstUserAfterClaimBalance,
          firstUserbeforeClaimBalance
        )
      );

      let secondUserbeforeClaimBalance = await astra.balanceOf(addr2.address);
      await itokenstaking.connect(addr2).claimAstra();
      let secondUserAfterClaimBalance = await astra.balanceOf(addr2.address);
      let finalRewardsSecondUser = convertToEther(
        differenceOfLargeNumbers(
          secondUserAfterClaimBalance,
          secondUserbeforeClaimBalance
        )
      );
      expect(
        compareNumber(
          finalRewardsFirstUSer + finalRewardsSecondUser,
          TOTAL_Reward - REDUCE_AMOUNT
        )
      ).to.equal(true);
    });

    it("Decrease rewards for multiple users with withdraw", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 17);
      await itokenstaking.connect(addr1).deposit(0, convertToWei(100), 0);
      await itokenstaking.connect(addr2).deposit(0, convertToWei(500), 0);
      let perblock = parseInt(await chef.astraPerBlock());
      await itokenstaking
        .connect(addr2)
        .decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());

      await itokenstaking.connect(addr1).withdraw(0, false);
      await itokenstaking.connect(addr2).withdraw(0, false);
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let firstUserbeforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).withdraw(0, false);
      let firstUserAfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewardsFirstUSer = convertToEther(
        differenceOfLargeNumbers(
          firstUserAfterClaimBalance,
          firstUserbeforeClaimBalance
        )
      );

      let secondUserbeforeClaimBalance = await astra.balanceOf(addr2.address);
      await itokenstaking.connect(addr2).withdraw(0, false);
      let secondUserAfterClaimBalance = await astra.balanceOf(addr2.address);
      let finalRewardsSecondUser = convertToEther(
        differenceOfLargeNumbers(
          secondUserAfterClaimBalance,
          secondUserbeforeClaimBalance
        )
      );
      expect(
        compareNumber(
          finalRewardsFirstUSer + finalRewardsSecondUser,
          TOTAL_Reward - REDUCE_AMOUNT
        )
      ).to.equal(true);
    });

    it("Decrease rewards in between staking for multiple users with withdraw", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 17);
      await itokenstaking.connect(addr1).deposit(0, convertToWei(100), 0);
      await itokenstaking.connect(addr2).deposit(0, convertToWei(500), 0);
      let perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 50);
      await itokenstaking
        .connect(addr2)
        .decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());

      await itokenstaking.connect(addr1).withdraw(0, false);
      await itokenstaking.connect(addr2).withdraw(0, false);
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let firstUserbeforeClaimBalance = await astra.balanceOf(addr1.address);
      await itokenstaking.connect(addr1).withdraw(0, false);
      let firstUserAfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewardsFirstUSer = convertToEther(
        differenceOfLargeNumbers(
          firstUserAfterClaimBalance,
          firstUserbeforeClaimBalance
        )
      );

      let secondUserbeforeClaimBalance = await astra.balanceOf(addr2.address);
      await itokenstaking.connect(addr2).withdraw(0, false);
      let secondUserAfterClaimBalance = await astra.balanceOf(addr2.address);
      let finalRewardsSecondUser = convertToEther(
        differenceOfLargeNumbers(
          secondUserAfterClaimBalance,
          secondUserbeforeClaimBalance
        )
      );
      expect(
        compareNumber(
          finalRewardsFirstUSer + finalRewardsSecondUser,
          TOTAL_Reward - REDUCE_AMOUNT
        )
      ).to.equal(true);
    });
  });
});
