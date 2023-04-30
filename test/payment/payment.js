const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const {
  abi: ERC20ABI,
} = require("@openzeppelin/contracts/build/contracts/ERC20.json");
const Address = require("../../Util/Address.json");
const Holder = require("../../Util/Holders.json");

describe("Payment", () => {
  let owner, addr1, addr2, addrs;
  let astra, dai, usdt, usdc;
  let token1, token2, token3, token4;
  let swapV2, poolConfiguration, payment;

  const totalSupply = ethers.utils.parseUnits("1000", 18);
  const totalSupplyUsdt = ethers.utils.parseUnits("10000", 6);
  const totalSupplyUsdc = ethers.utils.parseUnits("10000", 6);

  const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

  const getSigner = async (address) => {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [address],
    });
    return ethers.getSigner(address);
  };

  const erc20TokenAt = (tokenAddress) =>
    ethers.getContractAt(ERC20ABI, tokenAddress, owner);

  const deploy = async (name, ...constructorArgs) => {
    const Contract = await ethers.getContractFactory(name);
    const contract = await Contract.deploy(...constructorArgs);
    return contract.deployed();
  };

  const deployProxy = async (name, args, opts) => {
    const Contract = await ethers.getContractFactory(name);
    const contract = await upgrades.deployProxy(Contract, args, opts);
    return contract.deployed();
  };

  const deployERC20Token = async (
    name = "Mock Token",
    symbol = "MTKN",
    decimals = 18
  ) => {
    const ERC20Token = await ethers.getContractFactory("TESTERC20");
    const erc20Token = await ERC20Token.deploy(name, symbol, decimals);
    return erc20Token.deployed();
  };

  before(async () => {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    astra = await erc20TokenAt(Address.ASTRA);
    dai = await erc20TokenAt(Address.DAI);
    usdt = await erc20TokenAt(Address.USDT);
    usdc = await erc20TokenAt(Address.USDC);

    token1 = await deployERC20Token();
    token2 = await deployERC20Token();
    token3 = await deployERC20Token();
    token4 = await deployERC20Token();

    const UniversalERC20 = await ethers.getContractFactory(
      "main/version-6/swapv2.sol:UniversalERC20"
    );
    const universalERC20 = await UniversalERC20.deploy();
    await universalERC20.deployed();

    const SwapV2 = await ethers.getContractFactory("SwapV2", {
      libraries: {
        UniversalERC20: universalERC20.address,
      },
    });

    swapV2 = await upgrades.deployProxy(
      SwapV2,
      [
        Address.SUSHISWAP_ROUTER,
        Address.UNISWAP_V2_ROUTER,
        Address.UNISWAP_V3_ROUTER,
        Address.UNISWAP_V3_QUOTER
      ],
      { unsafeAllowLinkedLibraries: true }
    );

    await swapV2.deployed();
    await swapV2.setTokensPath([Address.ETH, Address.DAI, Address.USDC]);

  });

  beforeEach(async () => {
    poolConfiguration = await deployProxy("PoolConfiguration", [astra.address]);

    payment = await deployProxy("IndicesPayment", [
      astra.address,
      poolConfiguration.address,
      swapV2.address,
      addrs[0].address,
    ]);

    await astra
      .connect(await getSigner(Holder.ASTRA))
      .transfer(owner.address, ethers.utils.parseUnits("10000", 18));
    await dai
      .connect(await getSigner(Holder.DAI))
      .transfer(owner.address, ethers.utils.parseUnits("10000", 18));
    await usdt
      .connect(await getSigner(Holder.USDT))
      .transfer(owner.address, ethers.utils.parseUnits("10000", 6));
    await usdc
      .connect(await getSigner(Holder.USDC))
      .transfer(owner.address, ethers.utils.parseUnits("10000", 6));

    await astra.transfer(swapV2.address, totalSupply);
    await dai.transfer(swapV2.address, totalSupply);
    await usdt.transfer(swapV2.address, totalSupplyUsdt);
    await usdc.transfer(swapV2.address, totalSupplyUsdc);
    await token1.transfer(swapV2.address, totalSupply);
    await token2.transfer(swapV2.address, totalSupply);
    await token3.transfer(swapV2.address, totalSupply);
    await token4.transfer(swapV2.address, totalSupply);
  });

  describe("Configuration Test", function () {
    describe("Set amount", function () {
      it("Set amount with non owner address", async function () {
        await expect(
          payment.connect(addr1).setAstraAmount(500)
        ).to.revertedWith("Ownable: caller is not the owner");
      });

      it("Set amount by owner", async function () {
        await payment.setAstraAmount(500);
        expect(await payment.astraAmount()).to.equal(500);
      });
    });

    describe("Set Treasury", function () {
      it("Set Address with non owner address", async function () {
        await expect(
          payment.connect(addr1).setTreasury(addr1.address)
        ).to.revertedWith("Ownable: caller is not the owner");
      });

      it("Set Treasury by owner", async function () {
        await payment.setTreasury(addr1.address);
        expect(await payment.treasury()).to.be.equal(addr1.address);
      });
    });

    describe("Pay in Astra", function () {
      it("Should Revert if user try to pay less than 500", async function () {
        await expect(
          payment.connect(addr1).deposit(astra.address, 500)
        ).to.revertedWith("Not enough amount");
      });

      it("Should revert if user don't have balance", async function () {
        const depositAmount = ethers.utils.parseEther("600");
        await payment.setAstraAmount(depositAmount);
        await expect(
          payment.connect(addr1).deposit(astra.address, depositAmount)
        ).to.revertedWith("Not enough balance");
      });

      it("Deposit", async function () {
        await astra.approve(payment.address, totalSupply);

        const depositAmount = ethers.utils.parseEther("600");
        await payment.setAstraAmount(depositAmount);
        await payment.deposit(astra.address, depositAmount);

        expect(await payment.depositedAmount(owner.address)).to.equal(
          depositAmount
        );
      });
    });

    describe("Pay in Ether", function () {
      it("Should revert if user try to withdraw", async function () {
        const depositAmount = ethers.utils.parseEther("0.000000001");
        await expect(
          payment
            .connect(addr1)
            .deposit(ETH_ADDRESS, 0, { value: depositAmount })
        ).to.revertedWith("Not enough amount");
      });

      it("Deposit", async function () {
        await payment.setAstraAmount(500000);
        await payment.connect(addr1).deposit(ETH_ADDRESS, 0, { value: 500000 });
        expect(await payment.depositedAmount(addr1.address)).to.equal(
          4153362383881742
        );
      });
    });

    describe("Pay in Stable coin", function () {
      it("Should Revert if user try to pay less than 500", async function () {
        const astraAmount = ethers.utils.parseEther("5000000000");
        await payment.setAstraAmount(astraAmount);
        await poolConfiguration.whitelistDAOaddress(owner.address);
        await poolConfiguration.addStable(dai.address);
        await dai.approve(payment.address, totalSupply);
        const depositAmount = ethers.utils.parseUnits("1", 18);
        await expect(
          payment.deposit(dai.address, depositAmount)
        ).to.revertedWith("Not enough amount");
      });

      it("Should revert if user try to withdraw", async function () {
        await poolConfiguration.whitelistDAOaddress(owner.address);
        await poolConfiguration.addStable(dai.address);

        const depositAmount = ethers.utils.parseEther("600");
        await expect(
          payment.connect(addr1).deposit(dai.address, depositAmount)
        ).to.revertedWith("Not enough balance");
      });

      it("Deposit", async function () {
        await poolConfiguration.whitelistDAOaddress(owner.address);
        await poolConfiguration.addStable(dai.address);
        await dai.approve(payment.address, totalSupply);

        const depositAmount = ethers.utils.parseEther("600");
        await payment.setAstraAmount(depositAmount);
        await payment.deposit(dai.address, depositAmount);

        expect(await payment.depositedAmount(owner.address)).to.equal(
          "4215482595008996052084274339"
        );
      });
    });
  });
});
