const ether = require("@openzeppelin/test-helpers/src/ether");
const { expect } = require("chai");
const { upgrades } = require("hardhat");
const { check } = require("prettier");
const { time } = require("../../Util");
const { encodeParameters } = require("../../Util/Ethereum");


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

const BallotTypes = {
    Ballot: [
      { name: "proposalId", type: "uint256" },
      { name: "support", type: "bool" },
    ],
  };
  
  let chainId;
  let ballotDomain;
  
  function generateVoteSignature(proposalId, support, signature) {
    const { r, s, v } = ethers.utils.splitSignature(signature);
    const object = {proposalId, support, v, r, s};
    return object;
  }
  
  function generateDelegateSignature(delegatee, nonce, expiry, signature) {
    const { r, s, v } = ethers.utils.splitSignature(signature);
    const object = {delegatee, nonce, expiry , v, r, s};
    return object;
  }
  

describe("Governance gas less voting", function () {
  let AstraContract;
  let ChefContract;
  let TimelockContract;
  let GovernanceContract;
  let BatchVoteContract;
  let astra;
  let chef;
  let timelock;
  let governance;
  let batch;
  let owner;
  let addr1;
  let addr2;
  let addrs;
  const BASE_AMOUNT = 5000000000;
  const TOTAL_Reward = 10000;

  beforeEach(async function () {
    // Get the ContractFactory and Signers here.
    AstraContract = await ethers.getContractFactory("Token");
    ChefContract = await ethers.getContractFactory("MasterChefV2");
    TimelockContract = await ethers.getContractFactory("Timelock");
    GovernanceContract = await ethers.getContractFactory("GovernorAlphaMock");
    BatchVoteContract = await ethers.getContractFactory("BatchVote");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    astra = await upgrades.deployProxy(AstraContract, [owner.address]);
    await astra.deployed();

    const startBlock = parseInt(await time.latestBlock()) + 20;
    const endBlock = startBlock + 100;

    // timelock =  await TimelockContract.deploy(owner.address,120);
    // chef = await ChefContract.deploy(astra.address, owner.address, 1000, endBlock, startBlock );
    chef = await upgrades.deployProxy(ChefContract, [
      astra.address,
      startBlock,
      endBlock,
      convertToWei(TOTAL_Reward),
    ]);
    timelock = await TimelockContract.deploy(owner.address,120);
    await timelock.deployed()
    governance = await upgrades.deployProxy(GovernanceContract, [
        timelock.address,
        astra.address,
        chef.address
      ]);
    await governance.deployed();
    batch = await upgrades.deployProxy(BatchVoteContract, [
        governance.address,
      ]);
    await batch.deployed();
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
    // await  chef.add(100, astra.address, true)
    await chef.connect(addr1).deposit( convertToWei(100), 12, 0, false);
    await chef.connect(addr2).deposit( convertToWei(200), 12, 0, false);
    await chef.whitelistDepositContract(governance.address, true)
    chainId = addr1.provider._network.chainId;
    ballotDomain = {
        name: "ASTRA Governor Alpha",
        chainId,
        verifyingContract: governance.address,
    };

});

  describe("Deployment", function () {
    it("Should set the right owner Astra token", async function () {
      expect(await astra.owner()).to.equal(owner.address);
      await expect(
        astra.connect(addr1).setSellLimitTime(900)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Propose", function () {
    var callDatas, targets, values, signatures, description;
    var originalquorom = 30;
    beforeEach(async function () {
      targets = [governance.address];
      values = [0];
      signatures = ["updateQuorumValue(uint256)"];
      callDatas = [encodeParameters(["uint256"], [originalquorom])];
      description = "Update Quorumvalue to 3 percentage";
      await astra.approve(governance.address, convertToWei(BASE_AMOUNT));
      time.increase(2592000);
      await governance.propose(
        targets,
        values,
        signatures,
        callDatas,
        description,
        true
      );
      await time.advanceBlock();
    });

    it("Propose created successfully", async function () {
      expect(await governance.proposalCount()).to.be.equal(1);
    });

    it("Voted without signature ", async function () {
        await governance.connect(addr1).castVote(1, true);
        var votes = await governance.proposals(1);
        expect(votes[5]).to.be.equal('180000000000000000000');
    });

    it("Caste Vote by signature", async function () {
        const proposalId = 1;
        const support = true;
        const message = { proposalId, support }
  
        const signature = await addr1._signTypedData(ballotDomain, BallotTypes, message);
  
        const { r, s, v } = ethers.utils.splitSignature(signature);
        await time.advanceBlock();
        await expect(governance.castVoteBySig(proposalId, support, v, r, s))
          .to.emit(governance, "VoteCast")
          .withArgs(addr1.address, 1, true, "180000000000000000000");
        const prop = await governance.proposals(1);
        expect(prop.forVotes).to.be.equal("180000000000000000000");
    });

    it("Batch vote using muliple users signature", async function () {
        const proposalId = 1;
        let support = true;
        let message = { proposalId, support };
        const batchSigntaures = [];
  
        signature = await addr2._signTypedData(
          ballotDomain,
          BallotTypes,
          message
        );
        let obj = generateVoteSignature(proposalId, support, signature);
        batchSigntaures.push(obj);
  
        support = false;
        message = { proposalId, support };
        signature = await addr1._signTypedData(
          ballotDomain,
          BallotTypes,
          message
        );
        obj = generateVoteSignature(proposalId, support, signature);
        batchSigntaures.push(obj);
  
        await time.advanceBlock();
        await batch.castVoteBySigs(batchSigntaures);
        const prop = await governance.proposals(1);
        expect(prop.forVotes).to.be.equal("360000000000000000000");
        expect(prop.againstVotes).to.be.equal("180000000000000000000");
      });

})


});
