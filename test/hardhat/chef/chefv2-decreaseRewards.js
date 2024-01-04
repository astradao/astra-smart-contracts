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

describe("Chef", function () {
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
    AstraContract = await ethers.getContractFactory("AstraDAOToken");
    ChefContract = await ethers.getContractFactory("MasterChefV2");
    GovernanceContract = await ethers.getContractFactory("GovernanceMock");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    astra = await upgrades.deployProxy(AstraContract, [owner.address]);
    await astra.deployed();

    const startBlock = parseInt(await time.latestBlock()) + 20;
    const endBlock = startBlock + 100;

    chef = await upgrades.deployProxy(ChefContract, [
      astra.address,
      startBlock,
      endBlock,
      convertToWei(TOTAL_Reward),
    ]);
    governance = await GovernanceContract.deploy();
    await chef.setGovernanceAddress(governance.address);

    await astra.connect(owner).approve(chef.address, BASE_AMOUNT);

    await astra.transfer(addr1.address, convertToWei(BASE_AMOUNT));
    await astra.connect(addr1).approve(chef.address, convertToWei(BASE_AMOUNT));

    await astra.transfer(addr2.address, convertToWei(BASE_AMOUNT));
    await astra.connect(addr2).approve(chef.address, convertToWei(BASE_AMOUNT));

    await astra.transfer(addrs[0].address, convertToWei(BASE_AMOUNT));
    await astra
      .connect(addrs[0])
      .approve(chef.address, convertToWei(BASE_AMOUNT));

    await astra.transfer(chef.address, convertToWei(TOTAL_Reward));
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
      await chef
        .connect(owner)
        .whitelistDistributionAddress(addr2.address, true);
    });
    it("Only owner can whitelist distibutor address address", async function () {
      await expect(
        chef.connect(addr1).whitelistDistributionAddress(addr1.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Non whitelisted should not be able to distribute", async function () {
      await expect(
        chef.connect(addr1).decreaseRewardRate(convertToWei(100))
      ).to.be.revertedWith("Not eligible");
    });

    it("Call should get the descreased amount back", async function () {
      let userBalanceBeforeDecreasingReward = await astra.balanceOf(
        addr2.address
      );
      await chef.connect(addr2).decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
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
      perblock = convertToEther(await chef.astraPerBlock());
      await chef.connect(addr2).decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = convertToEther(await chef.astraPerBlock());
      expect(
        compareNumber(perblock, (TOTAL_Reward - REDUCE_AMOUNT) / 100)
      ).to.equal(true);
    });

    it("Decrease rewards", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 17);
      await chef.connect(addr1).deposit(convertToWei(100), 0, 0, false);
      let perblock = parseInt(await chef.astraPerBlock());
      await chef.connect(addr2).decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).claimAstra();
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
      await chef.connect(addr1).deposit(convertToWei(100), 0, 0, false);
      let perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 50);
      await chef.connect(addr2).decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).claimAstra();
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
      await chef.connect(addr1).deposit(convertToWei(100), 0, 0, false);
      await chef.connect(addr2).deposit(convertToWei(500), 0, 0, false);
      let perblock = parseInt(await chef.astraPerBlock());
      await chef.connect(addr2).decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let firstUserbeforeClaimBalance = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).claimAstra();
      let firstUserAfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewardsFirstUSer = convertToEther(
        differenceOfLargeNumbers(
          firstUserAfterClaimBalance,
          firstUserbeforeClaimBalance
        )
      );

      let secondUserbeforeClaimBalance = await astra.balanceOf(addr2.address);
      await chef.connect(addr2).claimAstra();
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

    it("Decrease rewards in between staking for multiple users", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 17);
      await chef.connect(addr1).deposit(convertToWei(100), 0, 0, false);
      await chef.connect(addr2).deposit(convertToWei(500), 0, 0, false);
      let perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 50);
      await chef.connect(addr2).decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let firstUserbeforeClaimBalance = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).claimAstra();
      let firstUserAfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewardsFirstUSer = convertToEther(
        differenceOfLargeNumbers(
          firstUserAfterClaimBalance,
          firstUserbeforeClaimBalance
        )
      );

      let secondUserbeforeClaimBalance = await astra.balanceOf(addr2.address);
      await chef.connect(addr2).claimAstra();
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
      await chef.connect(addr1).deposit(convertToWei(100), 0, 0, false);
      await chef.connect(addr2).deposit(convertToWei(500), 0, 0, false);
      let perblock = parseInt(await chef.astraPerBlock());
      await chef.connect(addr2).decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());

      await chef.connect(addr1).withdraw(false);
      await chef.connect(addr2).withdraw(false);
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let firstUserbeforeClaimBalance = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).withdraw(false);
      let firstUserAfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewardsFirstUSer = convertToEther(
        differenceOfLargeNumbers(
          firstUserAfterClaimBalance,
          firstUserbeforeClaimBalance
        )
      );

      let secondUserbeforeClaimBalance = await astra.balanceOf(addr2.address);
      await chef.connect(addr2).withdraw(false);
      let secondUserAfterClaimBalance = await astra.balanceOf(addr2.address);
      let finalRewardsSecondUser = convertToEther(
        differenceOfLargeNumbers(
          secondUserAfterClaimBalance,
          secondUserbeforeClaimBalance
        )
      );

      expect(
        compareNumber(
          finalRewardsFirstUSer + finalRewardsSecondUser - 600,
          TOTAL_Reward - REDUCE_AMOUNT
        )
      ).to.equal(true);
    });

    it("Decrease rewards in between staking for multiple users with withdraw", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 17);
      await chef.connect(addr1).deposit(convertToWei(100), 0, 0, false);
      await chef.connect(addr2).deposit(convertToWei(500), 0, 0, false);
      let perblock = parseInt(await chef.astraPerBlock());
      await time.advanceBlockTo(latestBlock + 50);
      await chef.connect(addr2).decreaseRewardRate(convertToWei(REDUCE_AMOUNT));
      perblock = parseInt(await chef.astraPerBlock());

      await chef.connect(addr1).withdraw(false);
      await chef.connect(addr2).withdraw(false);
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let firstUserbeforeClaimBalance = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).withdraw(false);
      let firstUserAfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewardsFirstUSer = convertToEther(
        differenceOfLargeNumbers(
          firstUserAfterClaimBalance,
          firstUserbeforeClaimBalance
        )
      );

      let secondUserbeforeClaimBalance = await astra.balanceOf(addr2.address);
      await chef.connect(addr2).withdraw(false);
      let secondUserAfterClaimBalance = await astra.balanceOf(addr2.address);
      let finalRewardsSecondUser = convertToEther(
        differenceOfLargeNumbers(
          secondUserAfterClaimBalance,
          secondUserbeforeClaimBalance
        )
      );

      expect(
        compareNumber(
          finalRewardsFirstUSer + finalRewardsSecondUser - 600,
          TOTAL_Reward - REDUCE_AMOUNT
        )
      ).to.equal(true);
    });
  });
});
