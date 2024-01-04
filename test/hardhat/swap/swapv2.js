const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const Address = require("../../utils/Address.json");
const {
  abi: ERC20ABI,
} = require("@openzeppelin/contracts/build/contracts/ERC20.json");

describe("Swap", () => {
  let swap;
  let owner, addr1, addr2, addrs;
  
  const erc20Token = (tokenAddress) =>
    ethers.getContractAt(ERC20ABI, tokenAddress, owner);

  const newERC20Token = async (name = "Mock Token", symbol = "MTKN", decimals = 18) => {
    const ERC20Token = await ethers.getContractFactory("TESTERC20");
    const erc20Token = await ERC20Token.deploy(name, symbol, decimals);
    return erc20Token.deployed();
  }

  before(async () => {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    const UniversalERC20 = await ethers.getContractFactory("src/swapv2.sol:UniversalERC20");
    const universalERC20 = await UniversalERC20.deploy();
    await universalERC20.deployed();

    const Swap = await ethers.getContractFactory("SwapV2", {
      libraries: {
        UniversalERC20: universalERC20.address,
      },
    });

    swap = await upgrades.deployProxy(
      Swap,
      [
        Address.SUSHISWAP_ROUTER,
        Address.UNISWAP_V2_ROUTER,
        Address.UNISWAP_V3_ROUTER,
        Address.UNISWAP_V3_QUOTER,
      ],
      { unsafeAllowLinkedLibraries: true }
    );
    await swap.setTokensPath([Address.ETH, Address.DAI, Address.USDC]);


    await swap.deployed();
  });

  describe("Deployment", () => {
    it("Should set right sushiswap router address", async () => {
      expect(await swap.sushiswapRouter()).to.equal(Address.SUSHISWAP_ROUTER);
    });

    it("Should set right uniswap V2 router address", async () => {
      expect(await swap.uniswapV2Router()).to.equal(Address.UNISWAP_V2_ROUTER);
    });

    it("Should set right uniswap V3 router address", async () => {
      expect(await swap.uniswapV3Router()).to.equal(Address.UNISWAP_V3_ROUTER);
    });

    it("Should set right uniswap V3 quoter address", async () => {
      expect(await swap.uniswapV3Quoter()).to.equal(Address.UNISWAP_V3_QUOTER);
    });

    it("Should set right tokens", async () => {addr1
      expect(await swap.tokens(0)).to.equal(Address.ETH);
      expect(await swap.tokens(1)).to.equal(Address.DAI);
      expect(await swap.tokens(2)).to.equal(Address.USDC);
    });

    it("Should set owner to deployer", async () => {
      expect(await swap.owner()).to.equal(owner.address);
    });
  });

  describe("Swap Rates", () => {
    it("Should return right swap amount and path", async () => {
      const amountIn = ethers.utils.parseUnits("1", 18);
      let [amountOut, path] = await swap.callStatic.getBestExchangeRate(
        Address.DAI,
        Address.USDC,
        amountIn
      );
      amountOut = Number(ethers.utils.formatUnits(amountOut, 6));
      expect(amountOut).to.closeTo(1, 0.1);
      expect(path.length).to.equal(2);
    });

    it("Should return right swap amount and path for path > 2", async () => {
      const amountIn = ethers.utils.parseUnits("1", 18);
      let [amountOut, path] = await swap.callStatic.getBestExchangeRate(
        Address.APE_COIN,
        Address.AAVE,
        amountIn
      );
      amountOut = Number(ethers.utils.formatUnits(amountOut, 18));
      expect(amountOut).to.closeTo(0.05, 0.01);
      expect(path.length).to.equal(3);
    });
  });

  describe("Perform swap", () => {
    it("Should swap eth with token", async () => {
      const amountIn = ethers.utils.parseUnits("1", 18);

      const dai = await erc20Token(Address.DAI);
      const balanceBefore = await dai.balanceOf(owner.address);

      await swap.swapFromBestExchange(Address.ETH, Address.DAI, amountIn, 1, {
        value: amountIn,
      });

      const balanceAfter = await dai.balanceOf(owner.address);
      let amountReceived = balanceAfter.sub(balanceBefore);
      amountReceived = Number(ethers.utils.formatUnits(amountReceived, 18));

      expect(amountReceived).to.closeTo(1173, 10);
    });

    it("Should swap token with token", async () => {
      const amountIn = ethers.utils.parseUnits("10", 18);

      const dai = await erc20Token(Address.DAI);
      const aave = await erc20Token(Address.AAVE);
      const balanceBefore = await aave.balanceOf(owner.address);

      await dai.approve(swap.address, amountIn);
      await swap.swapFromBestExchange(Address.DAI, Address.AAVE, amountIn, 1);

      const balanceAfter = await aave.balanceOf(owner.address);
      let amountReceived = balanceAfter.sub(balanceBefore);
      amountReceived = Number(ethers.utils.formatUnits(amountReceived, 18));

      expect(amountReceived).to.closeTo(0.17, 0.05);
    });

    it("Should swap tokens for path > 2", async () => {
      const amountIn = ethers.utils.parseUnits("0.1", 18);

      const aave = await erc20Token(Address.AAVE);
      const ape = await erc20Token(Address.APE_COIN);
      const balanceBefore = await ape.balanceOf(owner.address);

      await aave.approve(swap.address, amountIn);
      await swap.swapFromBestExchange(
        Address.AAVE,
        Address.APE_COIN,
        amountIn,
        1
      );

      const balanceAfter = await ape.balanceOf(owner.address);
      let amountReceived = balanceAfter.sub(balanceBefore);
      amountReceived = Number(ethers.utils.formatUnits(amountReceived, 18));

      expect(amountReceived).to.closeTo(1.8, 0.1);
    });

    it("Should revert if amountOutMin is greater than amountOut", async () => {
      const amountIn = ethers.utils.parseEther("1");
      const amountOutMin = ethers.utils.parseUnits("1200", 18);

      await expect(swap.swapFromBestExchange(
        Address.ETH,
        Address.DAI,
        amountIn,
        amountOutMin,
        {
          value: amountIn,
        }
      )).to.revertedWith("Swap: Insufficient output amount");
    });

    it("Should revert if amountIn is 0", async () => {
      const amountIn = 0;

      await expect(swap.swapFromBestExchange(
        Address.ETH,
        Address.DAI,
        amountIn,
        1,
        {
          value: amountIn,
        }
      )).to.revertedWith("Swap: Amount too small to swap");
    });
  });

  describe("Reserve Check multiplier", () => {
    it("Should be 2000 initially", async () => {
      expect(await swap.reserveCheckMultiplier()).to.equal(2000);
    });

    it("Should able to update", async () => {
      await swap.updateReserveCheckMultiplier(3000);
      expect(await swap.reserveCheckMultiplier()).to.equal(3000);
    });

    it("Should revert if caller is not owner", async () => {
      await expect(
        swap.connect(addr1).updateReserveCheckMultiplier(3000)
      ).to.revertedWith("Ownable: caller is not the owner");
    });

    it("Should not update to same state", async () => {
      await expect(swap.updateReserveCheckMultiplier(3000)).to.revertedWith(
        "Swap: Same state"
      );
    });
  });

  describe("Negative Scenarios", () => {
    it ("Should return 0 and empty array of path if no pair available", async () => {
      const token = await newERC20Token();
      
      const amountIn = ethers.utils.parseUnits("1", 18);

      let [amountOut, path] = await swap.callStatic.getBestExchangeRate(
        Address.DAI,
        token.address,
        amountIn
      );

      amountOut = Number(ethers.utils.formatUnits(amountOut, 6));
      
      expect(amountOut).to.equal(0);
      expect(path.length).to.equal(0);
    });

    it("Should revert if no pairs available on any exchange", async () => {
      const token = await newERC20Token();
      const amountIn = ethers.utils.parseUnits("1", 18);

      const dai = await erc20Token(Address.DAI);

      await dai.approve(swap.address, amountIn);      
      await expect(
        swap.swapFromBestExchange(dai.address, token.address, amountIn, 1)
      ).to.revertedWith("Swap: Insufficient output amount");  
    });

  });
});
