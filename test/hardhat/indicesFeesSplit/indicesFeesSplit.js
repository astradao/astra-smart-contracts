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

describe("Split contract", function () {
  let AstraContract;
  let ChefContract;
  let TimelockContract;
  let GovernanceContract;
  let SplitContract;
  let astra;
  let chef;
  let split;
  let timelock;
  let governance;
  let owner;
  let addr1;
  let addr2;
  let addrs;
  const BASE_AMOUNT = 1000000;
  const TOTAL_Reward = 10000;
  const FEES_Amount = 50000;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    AstraContract = await ethers.getContractFactory("AstraDAOToken");
    ChefContract = await ethers.getContractFactory("MasterChefV2");
    SplitContract = await ethers.getContractFactory("IndicesSplit");
    // TimelockContract = await ethers.getContractFactory("TimelockMock");
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

    split = await upgrades.deployProxy(SplitContract, [
      astra.address,
      addr2.address,
      chef.address,
      2000,
      convertToWei(1)
    ])
    await split.deployed();

    await astra.connect(owner).approve(chef.address, BASE_AMOUNT);

    await astra.transfer(addr1.address, convertToWei(BASE_AMOUNT));
    await astra.connect(addr1).approve(chef.address, convertToWei(BASE_AMOUNT));

    await astra.transfer(chef.address, convertToWei(TOTAL_Reward));
    await astra.transfer(split.address, convertToWei(FEES_Amount));
  });

  describe("Deployment", function () {
    it("Should set the right owner Astra token", async function () {
      expect(await astra.owner()).to.equal(owner.address);
      await expect(
        astra.connect(addr1).setSellLimitTime(900)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Configuration of the contract", function () {
    it("Only owner can update the threshold", async function () {
      await expect(
        split.connect(addr1).updateThresholdValue(900)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("Only owner can update the percentage", async function () {
      await expect(
        split.connect(addr1).updatePercentage(900)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Only owner can update the treasury address", async function () {
      await expect(
        split.connect(addr1).updateTreasuryAddresss(addr2.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Only owner can update the chef address", async function () {
      await expect(
        split.connect(addr1).updateChefAddresss(addr2.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

  });

  describe("Check upkeep conditions", function () {
    beforeEach(async function () {
      await chef.connect(owner).whitelistDistributionAddress(split.address, true)
      await split.connect(owner).updateThresholdValue(convertToWei(2*FEES_Amount));
    });

    it("Should revert if threshold is not reached", async function () {
      await expect(
        split.connect(addr1).performUpkeep([])
      ).to.be.revertedWith("Threshold not reached");
    });

    it("check upkeep should revert false if threshold not reached", async function () {
      let upkeep = await split.checkUpkeep([]); 
      expect(upkeep['upkeepNeeded']).to.equal(false);
    });

    it("Should distribute once threshold is reached", async function () {
      await astra.transfer(split.address, convertToWei(FEES_Amount));
      await split.performUpkeep([]);
      let perblock = convertToEther(await chef.astraPerBlock()); 
      let addr2Balance = convertToEther(await astra.balanceOf(addr2.address));

      expect(compareNumber(perblock, 3*TOTAL_Reward/100)).to.equal(true);
      expect(compareNumber(addr2Balance, 2*80*FEES_Amount/100)).to.equal(true);

    });
  
  });

  describe("Distribute additional rewards", function () {
    beforeEach(async function () {
      await chef.connect(owner).whitelistDistributionAddress(split.address, true)
    });
    it("Only owner can whitelist distibutor address address", async function () {
      await expect(
        chef.connect(addr1).whitelistDistributionAddress(addr1.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Non whitelisted should not be able to distribute", async function () {
      await expect(
        chef
          .connect(addr1)
          .distributeAdditionalReward(convertToWei(100))
      ).to.be.revertedWith("Not eligible");
    });

    it("Should revert if threshold is not reached", async function () {
      await split.connect(owner).updateThresholdValue(convertToWei(2*FEES_Amount));
      await expect(
        split.connect(addr1).distribute()
      ).to.be.revertedWith("Threshold not reached");
    });

    it("Distribute based on updated percentage", async function () {
      await split.connect(owner).updatePercentage(4000);
      await split.distribute();
      let perblock = convertToEther(await chef.astraPerBlock()); 
      let addr2Balance = convertToEther(await astra.balanceOf(addr2.address));

      expect(compareNumber(perblock, 3*TOTAL_Reward/100)).to.equal(true);
      expect(compareNumber(addr2Balance, 60*FEES_Amount/100)).to.equal(true);

    });

    it("Per block rewards should be updated correctly", async function () {
      await split.distribute();
      let perblock = convertToEther(await chef.astraPerBlock()); 
      let addr2Balance = convertToEther(await astra.balanceOf(addr2.address));

      expect(compareNumber(perblock, 2*TOTAL_Reward/100)).to.equal(true);
      expect(compareNumber(addr2Balance, 80*FEES_Amount/100)).to.equal(true);

    });

    it("Distribute rewards multiple times", async function () {
      await split.distribute();
      await astra.transfer(split.address, convertToWei(FEES_Amount));
      await split.distribute();
      await astra.transfer(split.address, convertToWei(FEES_Amount));
      await split.distribute();
      await astra.transfer(split.address, convertToWei(FEES_Amount));
      await split.distribute();
      let perblock = convertToEther(await chef.astraPerBlock()); 
      let addr2Balance = convertToEther(await astra.balanceOf(addr2.address));
      expect(compareNumber(perblock, 5*TOTAL_Reward/100)).to.equal(true);
      expect(compareNumber(addr2Balance, 4*80*FEES_Amount/100)).to.equal(true);
    });

    it("Distribute rewards multiple times with different amount", async function () {
      await split.distribute();
      await astra.transfer(split.address, convertToWei(FEES_Amount));
      await split.distribute();
      await astra.transfer(split.address, convertToWei(2*FEES_Amount));
      await split.distribute();
      await astra.transfer(split.address, convertToWei(3*FEES_Amount));
      await split.distribute();
      let perblock = convertToEther(await chef.astraPerBlock()); 
      let addr2Balance = convertToEther(await astra.balanceOf(addr2.address));
      expect(compareNumber(perblock, 8*TOTAL_Reward/100)).to.equal(true);
      expect(compareNumber(addr2Balance, 7*80*FEES_Amount/100)).to.equal(true);
    });
  
  });


});
