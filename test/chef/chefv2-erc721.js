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

describe("Chef staking with merged staking", function () {
  let AstraContract;
  let ChefContract;
  let TimelockContract;
  let GovernanceContract;
  let UtilityContract;
  let utility;
  let astra;
  let chef;
  let timelock;
  let governance;
  let nft;
  let TestERC721Contract;
  let owner;
  let addr1;
  let addr2;
  let addrs;
  const BASE_AMOUNT = 1000000;
  const TOTAL_Reward = 10000;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    AstraContract = await ethers.getContractFactory("Token");
    ChefContract = await ethers.getContractFactory("MasterChefV2");
    GovernanceContract = await ethers.getContractFactory("GovernanceMock");
    TestERC721Contract = await ethers.getContractFactory('sampleNFTToken');
    UtilityContract = await ethers.getContractFactory('UniswapV3PositionUtilityMock');

    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    astra = await upgrades.deployProxy(AstraContract, [owner.address]);
    await astra.deployed();

    const startBlock = parseInt(await time.latestBlock()) + 30;
    const endBlock = startBlock + 100;
    
    utility = await UtilityContract.deploy();
    await utility.deployed();

    nft = await TestERC721Contract.deploy();
    await nft.deployed();

    // timelock =  await TimelockContract.deploy(owner.address,120);
    // chef = await ChefContract.deploy(astra.address, owner.address, 1000, endBlock, startBlock );
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

    await nft.connect(owner).setApprovalForAll(chef.address, true);
    await nft.connect(addr2).setApprovalForAll(chef.address, true);
    await nft.connect(addr1).setApprovalForAll(chef.address, true);
    await nft.connect(addrs[0]).setApprovalForAll(chef.address, true);
    await nft.setTokens(astra.address,nft.address);
    await chef.setUtilityContractAddress(utility.address);
    await chef.addUniswapVersion3(nft.address, astra.address,nft.address,3000, false);

  });

  describe("Deployment", function () {
    it("Should set the right owner Astra token", async function () {
      expect(await astra.owner()).to.equal(owner.address);
      await expect(
        astra.connect(addr1).setSellLimitTime(900)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Slashing fees", function () {
    beforeEach(async function () {
      // await chef.connect(owner).add(100, astra.address, true);
      await nft.connect(owner).safeMint(addr1.address, 100);
      await chef.connect(addr1).deposit( 0, 0, 100, true);
    });

    it("Users rewards should be slashed if they try to claim before 90 days time period.", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).claimAstra();
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
      await chef.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, (TOTAL_Reward * 20) / 100)).to.equal(
        true
      );
    });
    it("Slashing fees should adjust in other users rewards", async function () {
      await chef.connect(addr2).deposit( convertToWei(100), 0, 0, false);
      const latestBlock = parseInt(await time.latestBlock());
      await time.increase("864000");
      await time.advanceBlockTo(latestBlock + 27);

      let beforeClaimBalanceFirstUser = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).claimAstra();
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
        await chef.pendingAstra( addr1.address)
      );
      let user2Reward = convertToEther(
        await chef.pendingAstra( addr2.address)
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
      await chef.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward)).to.equal(true);
    });
  });

  describe("Withdraw functionality", function () {
    beforeEach(async function () {
      // await chef.connect(owner).add(100, astra.address, true);
      await nft.connect(owner).safeMint(addr1.address, 100);
      await chef.connect(addr1).deposit( 0, 0, 100, true);
      await chef.connect(addr2).deposit( convertToWei(100), 0, 0, false);
    });

    it("Other user should get reward afte withdraw", async function () {
      let latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 24);
      await chef.connect(addr1).withdraw( true);
      await time.increase("31536000");
      let beforeStakeDepositAmount = convertToEther(
        (await chef.userInfo(0, addr1.address))["amount"]
      );
      
      await chef.connect(addr1).withdraw(false);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 124);

      let afterStakeDepositAmount = convertToEther(
        (await chef.userInfo(0, addr1.address))["amount"]
      );

      let firstUserReward = convertToEther(
        await chef.pendingAstra( addr1.address)
      );
      let secondUserReward = convertToEther(
        await chef.pendingAstra( addr2.address)
      );
      // At 1000 reward it was restaked
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
      await chef.connect(addr1).withdraw( true);
      await time.increase("31536000");
      expect(await nft.ownerOf(100)).to.be.equal(chef.address);
      await chef.connect(addr1).withdraw(false);
      expect(await nft.ownerOf(100)).to.be.equal(addr1.address);
    });

    it("User should not be able to withdraw before cooldown", async function () {
      let latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 23);
      await chef.connect(addr1).withdraw( true);
      await expect(chef.connect(addr1).withdraw(false)).to.be.revertedWith("withdraw: cooldown period");
    });

    it("User can withdraw anytime after withdraw time", async function () {
      let latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 23);
      await chef.connect(addr1).withdraw( true);
      await time.increase("3153600000");
      await chef.connect(addr1).withdraw(false);
      expect(await nft.ownerOf(100)).to.be.equal(addr1.address);
    });


  });

  describe("Reward distribution single without any multiplier", function () {
    beforeEach(async function () {
      // await chef.connect(owner).add(100, astra.address, true);
      await nft.connect(owner).safeMint(addr1.address, 100);
      await chef.connect(addr1).deposit( convertToWei(0), 0, 100, true);
    });

    it("Check reward after 10 blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 18);
      let userReward = await chef.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), 1000)).to.equal(true);
    });

    it("Check reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      let userReward = await chef.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), TOTAL_Reward)).to.equal(
        true
      );
    });
    it("Claim reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward)).to.equal(true);
    });
  });

  describe("Reward distribution single with vault multiplier", function () {
    beforeEach(async function () {
      // await chef.connect(owner).add(100, astra.address, true);
      await nft.connect(owner).safeMint(addr1.address, 100);
      await chef
        .connect(addr1)
        .deposit( 0, 12, 100, true);
    });

    it("Check reward after 10 blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 18);
      let userReward = await chef.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), 1000)).to.equal(true);
    });

    it("Check reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      let userReward = await chef.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), TOTAL_Reward)).to.equal(
        true
      );
    });
    it("Claim reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward)).to.equal(true);
    });
  });

  describe("Reward distribution single with staking score multiplier", function () {
    beforeEach(async function () {
      // await chef.connect(owner).add(100, astra.address, true);
      await nft.connect(owner).safeMint(addr1.address, 800000);
      await chef
        .connect(addr1)
        .deposit( 0, 0, 800000, true);
    });

    it("Check reward after 10 blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 17);
      await time.increase("5184000");
      let userReward = await chef.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), 1000)).to.equal(true);
    });

    it("Check reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("5184000");
      let userReward = await chef.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), TOTAL_Reward)).to.equal(
        true
      );
    });
    it("Claim reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward)).to.equal(true);
    });
  });

  describe("Reward distribution single with both staking score and vault multiplier", function () {
    beforeEach(async function () {
      // await chef.connect(owner).add(100, astra.address, true);
         await nft.connect(owner).safeMint(addr1.address, 800000);

      await chef
        .connect(addr1)
        .deposit( 0, 12, 800000, true);
    });

    it("Check reward after 10 blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 18);
      let userReward = await chef.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), 1000)).to.equal(true);
    });

    it("Check reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      let userReward = await chef.pendingAstra( addr1.address);
      expect(compareNumber(convertToEther(userReward), TOTAL_Reward)).to.equal(
        true
      );
    });
    it("Claim reward after End blocks for single user", async function () {
      const latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");
      let beforeClaimBalance = await astra.balanceOf(addr1.address);
      await chef.connect(addr1).claimAstra();
      let AfterClaimBalance = await astra.balanceOf(addr1.address);
      let finalRewards = convertToEther(
        differenceOfLargeNumbers(AfterClaimBalance, beforeClaimBalance)
      );
      expect(compareNumber(finalRewards, TOTAL_Reward)).to.equal(true);
    });
  });

  describe("Reward distribution with multiple user and both lm staking only", function () {
    beforeEach(async function () {
      // await chef.connect(owner).add(100, astra.address, true);
      await nft.connect(owner).safeMint(addr1.address, 800000);
      await nft.connect(owner).safeMint(addr2.address, 300000);
      await nft.connect(owner).safeMint(addrs[0].address, 100000);
      await nft.connect(owner).safeMint(addr1.address, 100);
      await nft.connect(owner).safeMint(addr2.address, 300);
      await nft.connect(owner).safeMint(addrs[0].address, 400);
      await nft.connect(owner).safeMint(addr1.address, 1000);
      await nft.connect(owner).safeMint(addr2.address, 2000);
      await nft.connect(owner).safeMint(addrs[0].address, 3000);
    });


    it("Check with same multiplier but different deposit amount", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await chef
        .connect(addr1)
        .deposit( 0, 12, 100, true);
      await chef
        .connect(addr2)
        .deposit( 0, 12, 300, true);
      await chef
        .connect(addrs[0])
        .deposit( 0, 12, 400, true);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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

      await chef
        .connect(addr1)
        .deposit( 0, 0, 800000, true);
      await chef
        .connect(addr2)
        .deposit( 0, 12, 300000, true);
      await chef
        .connect(addrs[0])
        .deposit( 0, 6, 100000, true);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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

      await chef
        .connect(addr1)
        .deposit( 0, 12, 1000, true);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 30);
      await chef
        .connect(addr2)
        .deposit( 0, 12, 2000, true);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 20);
      await chef
        .connect(addrs[0])
        .deposit( 0, 12, 3000, true);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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

  describe("Reward distribution with multiple user and both lm and astra staking", function () {
    beforeEach(async function () {
      // await chef.connect(owner).add(100, astra.address, true);
      await nft.connect(owner).safeMint(addr1.address, 800000);
      await nft.connect(owner).safeMint(addr1.address, 100);
      await nft.connect(owner).safeMint(addr1.address, 1000);
      await nft.connect(owner).safeMint(addr1.address, 300000);

    });

    it("Check with same multiplier and same deposit amount", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await chef
        .connect(addr1)
        .deposit( 0, 12, 800000, true);
      await chef
        .connect(addr2)
        .deposit( ethers.utils.parseUnits("800000", 18), 12, 0, false);
      await chef
        .connect(addrs[0])
        .deposit( ethers.utils.parseUnits("800000", 18), 12, 0, false);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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

    it("Check with same multiplier but different deposit amount", async function () {
      let latestBlock = parseInt(await time.latestBlock());

      await chef
        .connect(addr1)
        .deposit( 0, 12, 100, true);
      await chef
        .connect(addr2)
        .deposit( ethers.utils.parseUnits("300", 18), 12, 0, false);
      await chef
        .connect(addrs[0])
        .deposit( ethers.utils.parseUnits("400", 18), 12, 0, false);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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

      await chef
        .connect(addr1)
        .deposit( 0, 6, 800000, true);
      await chef
        .connect(addr2)
        .deposit( ethers.utils.parseUnits("800000", 18), 12, 0, false);
      await chef
        .connect(addrs[0])
        .deposit( ethers.utils.parseUnits("800000", 18), 0, 0, false);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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

      await chef
        .connect(addr1)
        .deposit( 0, 0, 300000, true);
      await chef
        .connect(addr2)
        .deposit( ethers.utils.parseUnits("800000", 18), 12, 0, false);
      await chef
        .connect(addrs[0])
        .deposit( ethers.utils.parseUnits("100000", 18), 6, 0, false);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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

      await chef
        .connect(addr1)
        .deposit( 0, 0, 300000, true);
      await chef
        .connect(addr2)
        .deposit( ethers.utils.parseUnits("800000", 18), 12, 0, false);
      await chef
        .connect(addrs[0])
        .deposit( ethers.utils.parseUnits("100000", 18), 6, 0, false);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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

      await chef
        .connect(addr1)
        .deposit( 0, 12, 800000, true);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 30);
      await chef
        .connect(addr2)
        .deposit( ethers.utils.parseUnits("800000", 18), 12, 0, false);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 20);
      await chef
        .connect(addrs[0])
        .deposit( ethers.utils.parseUnits("800000", 18), 12, 0, false);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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

      await chef
        .connect(addr1)
        .deposit( 0, 12, 1000, true);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 30);
      await chef
        .connect(addr2)
        .deposit( ethers.utils.parseUnits("2000", 18), 12, 0, false);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 20);
      await chef
        .connect(addrs[0])
        .deposit( ethers.utils.parseUnits("3000", 18), 12, 0, false);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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

      await chef
        .connect(addr1)
        .deposit( 0, 0, 1000, true);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 30);
      await chef
        .connect(addr2)
        .deposit( ethers.utils.parseUnits("2000", 18), 12, 0, false);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 20);
      await chef
        .connect(addrs[0])
        .deposit( ethers.utils.parseUnits("3000", 18), 6, 0, false);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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

      await chef
        .connect(addr1)
        .deposit( 0, 0, 1000, true);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 30);
      await chef
        .connect(addr2)
        .deposit( ethers.utils.parseUnits("1000", 18), 12, 0, false);
      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 20);
      await chef
        .connect(addrs[0])
        .deposit( ethers.utils.parseUnits("1000", 18), 6, 0, false);

      latestBlock = parseInt(await time.latestBlock());
      await time.advanceBlockTo(latestBlock + 120);
      await time.increase("7776000");

      let user1BeforeClaimBalance = await astra.balanceOf(addr1.address);
      let user2BeforeClaimBalance = await astra.balanceOf(addr2.address);
      let user3BeforeClaimBalance = await astra.balanceOf(addrs[0].address);

      await chef.connect(addr1).claimAstra();
      await chef.connect(addr2).claimAstra();
      await chef.connect(addrs[0]).claimAstra();

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
