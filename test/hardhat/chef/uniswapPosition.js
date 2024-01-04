const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");

const positionManger = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const astraAddress = "0x7E9c15C43f0D6C4a12E6bdfF7c7D55D0f80e3E23";
const uniswapV3Factory = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

describe("Check position manager", () => {
  let uniswapUtlilityContract;
  let uniswaputil;
  let owner, addr1, addr2, addrs;
  

  before(async () => {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    uniswapUtlilityContract = await ethers.getContractFactory("UniswapV3PositionUtility");
    uniswaputil = await uniswapUtlilityContract.deploy();
    await uniswaputil.deployed();
    await uniswaputil.setUniswapPositionManager(positionManger);
    await uniswaputil.setUniswapFactory(uniswapV3Factory);
    await uniswaputil.setAstraContract(astraAddress);
  });

  describe("Only owner can update configuration", function () {
    it("Only owner can set position manager address", async function () {
      await expect(
        uniswaputil.connect(addr1).setUniswapPositionManager(positionManger)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("Only owner can set factory contract address", async function () {
      await expect(
        uniswaputil.connect(addr1).setUniswapFactory(uniswapV3Factory)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("Only owner can set astra contract address", async function () {
      await expect(
        uniswaputil.connect(addr1).setAstraContract(astraAddress)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Check amount in astra", () => {
    it("Should get correct amount from uniswap", async () => {
        let amount = await uniswaputil.getAstraAmount(340153);
        // This value is fetched from mainnet. It might change please refer to this link.
        // https://app.uniswap.org/#/pool/340153
        expect(amount).to.be.equal("36306269896819977217337504");
    });
    it("Should revert if not an astra pool", async () => {
      await expect( uniswaputil.getAstraAmount(325623)).to.be.revertedWith("not astra pool");
    });

    it("Should get the value of token at second position", async () => {
      await uniswaputil.setAstraContract(wethAddress);
      let amount = await uniswaputil.getAstraAmount(100);
      expect(amount).to.be.equal(5000000000000000);
    })
  });
});
