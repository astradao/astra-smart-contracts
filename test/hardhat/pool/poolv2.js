const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const Address = require("../../utils/Address.json");
const {
  abi: ERC20ABI,
} = require("@openzeppelin/contracts/build/contracts/ERC20.json");

const {
  abi: itokenABI,
} = require("../../../artifacts/src/itoken.sol/itoken.json");

const TOP_DAI_HOLDER = "0x075e72a5eDf65F0A5f44699c7654C1a76941Ddc8";
const TOP_USDC_HOLDER = "0xda9ce944a37d218c3302f6b82a094844c6eceb17";
const TOP_ASTRA_HOLDER = "0x710D3282d1c04bd7f1a13eB47bC2b6B9bBb4052A"

let swap,
  chef,
  poolConfiguration,
  pool,
  itokenDeployer,
  aaveToken,
  apeToken,
  astraToken,
  itoken,
  daiToken,
  usdcToken;
let owner, addr1, addr2, addrs, daiHolder, usdcHolder, astraHolder;
let PoolConfiguration, Pool, ItokenDeployer, payment;

const URL = "TEST_URL";

describe("Indices", () => {
  const erc20Token = (tokenAddress) =>
    ethers.getContractAt(ERC20ABI, tokenAddress, owner);

  const erc20iToken = (tokenAddress) =>
    ethers.getContractAt(itokenABI, tokenAddress, owner);
  
  const deployProxy = async (name, args, opts) => {
      const Contract = await ethers.getContractFactory(name);
      const contract = await upgrades.deployProxy(Contract, args, opts);
      return contract.deployed();
    };
  before(async () => {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    const UniversalERC20 = await ethers.getContractFactory(
      "src/swapv2.sol:UniversalERC20"
    );
    const ChefContract = await ethers.getContractFactory("MasterChefV2");
    PoolConfiguration = await ethers.getContractFactory("PoolConfiguration");
    Pool = await ethers.getContractFactory("PoolV2");
    ItokenDeployer = await ethers.getContractFactory("itokendeployer");

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
    await swap.deployed();
    await swap.setTokensPath([Address.ETH, Address.DAI, Address.USDC]);

    let latestBlock = await ethers.provider.getBlock("latest");
    console.log("Latest block", latestBlock.number);
    chef = await upgrades.deployProxy(ChefContract, [
      Address.ASTRA,
      latestBlock.number,
      latestBlock.number + 1000,
      "10000000000000000000",
    ]);
    await chef.deployed();


    aaveToken = await erc20Token(Address.AAVE);
    apeToken = await erc20Token(Address.APE_COIN);
    astraToken = await erc20Token(Address.ASTRA);
    daiToken = await erc20Token(Address.DAI);
    usdcToken = await erc20Token(Address.USDC);
    daiHolder = await ethers.getImpersonatedSigner(TOP_DAI_HOLDER);
    astraHolder = await ethers.getImpersonatedSigner(TOP_ASTRA_HOLDER);
    daiToken
      .connect(daiHolder)
      .transfer(addr2.address, ethers.utils.parseUnits("100000", 18));

    usdcHolder = await ethers.getImpersonatedSigner(TOP_USDC_HOLDER);
    usdcToken
      .connect(usdcHolder)
      .transfer(addr2.address, ethers.utils.parseUnits("100000", 6));
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

    it("Should set right tokens", async () => {
      addr1;
      expect(await swap.tokens(0)).to.equal(Address.ETH);
      expect(await swap.tokens(1)).to.equal(Address.DAI);
      expect(await swap.tokens(2)).to.equal(Address.USDC);
    });

    it("Should set owner to deployer", async () => {
      expect(await swap.owner()).to.equal(owner.address);
    });
  });

  describe("Configuration Test", function () {
    this.beforeEach(async () => {
      poolConfiguration = await upgrades.deployProxy(PoolConfiguration, [
        Address.ASTRA,
      ]);
      await poolConfiguration.deployed();
      payment = await deployProxy("IndicesPayment", [
        Address.ASTRA,
        poolConfiguration.address,
        addrs[0].address,
        addrs[0].address,
      ]);
      await payment.deployed();
      await payment.setAstraAmount(0);
      await poolConfiguration.setPaymentAddress(payment.address);
    });
    describe("Update the DAO contract address", function () {
      it("Should Revert if non whitelist admin tries to update the DAO contract address", async function () {
        await expect(
          poolConfiguration.whitelistDAOaddress(owner.address),
          "Admin only"
        );
      });
      it("Should update the DAO contract address", async function () {
        await poolConfiguration.whitelistDAOaddress(addr1.address);
        expect(await poolConfiguration.checkDao(addr1.address)).to.be.equal(
          true
        );
      });
      it("Should not update the DAO contract address twice", async function () {
        await poolConfiguration.whitelistDAOaddress(addr1.address);
        await expect(
          poolConfiguration.whitelistDAOaddress(addr1.address)
        ).to.revertedWith("whitelistDAOaddress: Already whitelisted");
      });
      it("Should disable the DAO contract address", async function () {
        await poolConfiguration.whitelistDAOaddress(addr1.address);
        await poolConfiguration.whitelistDAOaddress(addr2.address);
        expect(await poolConfiguration.checkDao(addr1.address)).to.be.equal(
          false
        );
      });
    });


    describe("Update the Whitelist Admin", function () {
      it("Owner should be admin", async function () {
        expect(await poolConfiguration.adminAddress()).to.be.equal(
          owner.address
        );
      });
      it("Only admin can update admin address", async function () {
        await expect(
          poolConfiguration.connect(addr2).updateadmin(addr1.address)
        ).to.revertedWith("Admin only");
      });
      it("Should update the admin address", async function () {
        await poolConfiguration.updateadmin(addr2.address);
        expect(await poolConfiguration.adminAddress()).to.be.equal(
          addr2.address
        );
      });
      it("Should not update the admin address twice", async function () {
        await poolConfiguration.updateadmin(addr2.address);
        await expect(
          poolConfiguration.connect(addr2).updateadmin(addr2.address)
        ).to.revertedWith("updateadmin: Already admin");
      });
    });

    describe("DAO functionality test", function () {
      beforeEach(async function () {
        await poolConfiguration.whitelistDAOaddress(addr1.address);
      });
      describe("Check Initial Rate", function () {
        it("Performance fees should fee 2 percent", async function () {
          expect(await poolConfiguration.performancefees()).to.be.equal(20);
        });
        it("Slippage rate should fee 10 percent", async function () {
          expect(await poolConfiguration.slippagerate()).to.be.equal(10);
        });
      });
      describe("Update the Performance fees", function () {
        it("Performance fees should fee 25 percent", async function () {
          await poolConfiguration.connect(addr1).updatePerfees(25);
          expect(await poolConfiguration.performancefees()).to.be.equal(25);
        });
        it("Should Revert if function called by not DAO contract/Address", async function () {
          await expect(poolConfiguration.updatePerfees(25)).to.be.revertedWith(
            "dao only"
          );
        });
      });
      describe("Update the Slippage rate", function () {
        it("Slippage rate should fee 15 percent", async function () {
          await poolConfiguration.connect(addr1).updateSlippagerate(15);
          expect(await poolConfiguration.slippagerate()).to.be.equal(15);
        });
        it("Should Revert if function called by not DAO contract/Address", async function () {
          await expect(
            poolConfiguration.updateSlippagerate(15)
          ).to.be.revertedWith("dao only");
        });
      });
      describe("Add the new stable coins", function () {
        it("Add the DAI from stable", async function () {
          await poolConfiguration.connect(addr1).addStable(Address.DAI);
          expect(
            await poolConfiguration.checkStableCoin(Address.DAI)
          ).to.be.equal(true);
        });
        it("Should Revert if function called by not DAO contract/Address", async function () {
          await expect(
            poolConfiguration.addStable(Address.DAI)
          ).to.be.revertedWith("dao only");
        });
      });
      describe("Remove the stable coin", function () {
        it("Remove the DAI from stable", async function () {
          await poolConfiguration.connect(addr1).addStable(Address.DAI);
          await poolConfiguration.connect(addr1).removeStable(Address.DAI);

          expect(
            await poolConfiguration.checkStableCoin(Address.DAI)
          ).to.be.equal(false);
        });
        it("Should Revert if function called by not DAO contract/Address", async function () {
          await expect(
            poolConfiguration.removeStable(Address.DAI)
          ).to.be.revertedWith("dao only");
        });
      });
    });
  });

  describe("Black list functionality", () => {
    beforeEach(async function(){
      itokenDeployer = await ItokenDeployer.deploy();
      await itokenDeployer.deployed();

      poolConfiguration = await upgrades.deployProxy(PoolConfiguration,[Address.ASTRA]);
      await poolConfiguration.deployed();

      payment = await deployProxy("IndicesPayment", [
        Address.ASTRA,
        poolConfiguration.address,
        addrs[0].address,
        addrs[0].address,
      ]);
      await payment.deployed();
      await payment.setAstraAmount(0);
      await poolConfiguration.setPaymentAddress(payment.address);

      pool = await upgrades.deployProxy(Pool,[Address.ASTRA,poolConfiguration.address,itokenDeployer.address,chef.address,swap.address, Address.WETH, Address.DAI], {useDeployedImplementation:false});
      await pool.deployed();
      await payment.setdaaAddress(pool.address);

      await chef.whitelistDepositContract(pool.address,true);
      await itokenDeployer.addDaaAdress(pool.address);

      await pool.addPublicPool([Address.APE_COIN,Address.ASTRA], [2,2],100,100,"First Itoken","ITOKEN1","Test Description");
      let itokenAddress = (await pool.poolInfo(0))['itokenaddr'];
      itoken = await erc20iToken(itokenAddress);
      // await itoken.addChefAddress(pool.address);
      await poolConfiguration.updateBlackListStatus(addr1.address,true);
      await poolConfiguration.setTreasuryAddress(addr2.address);
      await poolConfiguration.whitelistDAOaddress(owner.address);
      await poolConfiguration.addStable(Address.DAI);
    })

    it("Black listed user cannot add new pool", async () =>{
      await expect(pool.connect(addr1).addPublicPool([Address.APE_COIN,Address.ASTRA], [2,2],100,100,"Second Itoken","ITOKEN2","Test Description")
      ).to.revertedWith("EO1");
    })

    it("Black listed user cannot do rebalance of pool", async () =>{
      await daiToken.connect(daiHolder).approve(pool.address, ethers.utils.parseUnits('1000', 18));
      await pool.connect(daiHolder).poolIn([Address.DAI],[ethers.utils.parseUnits('100', 18)],0);
      await poolConfiguration.updateBlackListStatus(owner.address,true);
      await expect(pool.updatePool([Address.AAVE,Address.ASTRA],[2,2],0,0, 0)).to.revertedWith("EO1");
    })

    it("Non-Blacklisted user can do rebalance new pool", async () =>{
      await daiToken.connect(daiHolder).approve(pool.address, ethers.utils.parseUnits('1000', 18));
      await pool.connect(daiHolder).poolIn([Address.DAI],[ethers.utils.parseUnits('100', 18)],0);
      await pool.updatePool([Address.AAVE,Address.ASTRA],[2,2],0,0, 0);
    })

    it("Black listed cannot deposit in pool", async () =>{
      await expect(pool.connect(addr1).poolIn([],[],0,{value: ethers.utils.parseUnits('1', 18)})
      ).to.revertedWith("EO1");
    })

    it("Non-Blacklisted user can add new pool", async () =>{
      await pool.connect(addr2).addPublicPool([Address.APE_COIN,Address.ASTRA], [2,2],100,100,"Second Itoken","ITOKEN2","Test Description");
      expect((await pool.poolInfo(1))['owner']).to.be.equal(addr2.address);
    })

    it("Non-Blacklisted can deposit in pool", async () =>{
      await daiToken.connect(daiHolder).transfer(addr2.address, ethers.utils.parseUnits('1000', 18));
      await daiToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('1000', 18));
      await pool.connect(addr2).poolIn([Address.DAI],[ethers.utils.parseUnits('100', 18)],0);
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('100', 18));
    })

    it("Non-Blacklisted can withdraw in pool", async () =>{
      await daiToken.connect(daiHolder).approve(pool.address, ethers.utils.parseUnits('1000', 18));
      await pool.connect(daiHolder).poolIn([Address.DAI],[ethers.utils.parseUnits('100', 18)],0);
      let itokenBalance = await itoken.balanceOf(daiHolder.address)
      await pool.connect(daiHolder).withdraw(0, false, false, itokenBalance);
      itokenBalance = await itoken.balanceOf(daiHolder.address)
      expect(itokenBalance).to.be.equal(0);
    })

    it("Black listed cannot withdraw in pool", async () =>{
      await daiToken.connect(daiHolder).approve(pool.address, ethers.utils.parseUnits('1000', 18));
      await pool.connect(daiHolder).poolIn([Address.DAI],[ethers.utils.parseUnits('100', 18)],0);
      let itokenBalance = await itoken.balanceOf(daiHolder.address)
      await poolConfiguration.updateBlackListStatus(daiHolder.address,true);
      await expect(pool.connect(daiHolder).withdraw(0, false, false, itokenBalance)
      ).to.revertedWith("EO1");
    })
  })

  describe("Add public pool and update chef address functionality", () => {
    beforeEach(async function(){
      itokenDeployer = await ItokenDeployer.deploy();
      await itokenDeployer.deployed();

      poolConfiguration = await upgrades.deployProxy(PoolConfiguration,[Address.ASTRA]);
      await poolConfiguration.deployed();

      payment = await deployProxy("IndicesPayment", [
        Address.ASTRA,
        poolConfiguration.address,
        addrs[0].address,
        addrs[0].address,
      ]);
      await payment.deployed();
      await payment.setAstraAmount(0);
      await poolConfiguration.setPaymentAddress(payment.address);

      pool = await upgrades.deployProxy(Pool,[Address.ASTRA,poolConfiguration.address,itokenDeployer.address,chef.address,swap.address, Address.WETH, Address.DAI], {useDeployedImplementation:false});
      await pool.deployed();
      await payment.setdaaAddress(pool.address);

      await chef.whitelistDepositContract(pool.address,true);
      await itokenDeployer.addDaaAdress(pool.address);

      await pool.addPublicPool([Address.APE_COIN,Address.ASTRA], [2,2],100,100,"First Itoken","ITOKEN1","Test Description");
      let itokenAddress = (await pool.poolInfo(0))['itokenaddr'];
      itoken = await erc20iToken(itokenAddress);
      // await itoken.addChefAddress(pool.address);
      await poolConfiguration.updateBlackListStatus(addr1.address,true);
      await poolConfiguration.setTreasuryAddress(addr2.address);
      await poolConfiguration.whitelistDAOaddress(owner.address);
      await poolConfiguration.addStable(Address.DAI);
    })

    it("Should Revert if non admin tries to update the Chef contract address", async function () {
      await expect(
        pool.connect(astraHolder.address).updatPoolChefAddress(astraHolder),
        "E04"
      );
    });

    it("Should update the Chef contract address", async function () {
      await pool.updatPoolChefAddress(astraHolder.address);
      expect(await pool.poolChef()).to.be.equal(astraHolder.address);
    });

    it("Should not be able to add pool if user didn't deposit astra", async () =>{
      await payment.setAstraAmount(100);
      await expect(pool.connect(owner).addPublicPool([Address.APE_COIN], [2,2],100,100,"Second Itoken","ITOKEN2","Test Description")
      ).to.revertedWith("Not enough balance");
    })

    it("User can create pool after paying amount", async () =>{
      astraHolder
      await astraToken.connect(astraHolder).approve(payment.address,1000);
      await payment.setAstraAmount(100);
      await payment.connect(astraHolder).deposit(astraToken.address,100);

      await pool.connect(astraHolder).addPublicPool([Address.AAVE,Address.ASTRA], [2,2],100,100,"Second Itoken","ITOKEN2","Test Description");
      expect(await itokenDeployer.totalItokens()).to.be.equal(2);
    })

    it("User can create pool with base stable coin after paying amount", async () =>{
      astraHolder
      await astraToken.connect(astraHolder).approve(payment.address,1000);
      await payment.setAstraAmount(100);
      await payment.connect(astraHolder).deposit(astraToken.address,100);

      await pool.connect(astraHolder).addPublicPool([Address.AAVE,Address.DAI], [2,2],100,100,"Second Itoken","ITOKEN2","Test Description");
      expect(await itokenDeployer.totalItokens()).to.be.equal(2);
    })

    it("Should not be able to add pool with wrong confiugration", async () =>{
      await expect(pool.connect(owner).addPublicPool([Address.APE_COIN], [2,2],100,100,"Second Itoken","ITOKEN2","Test Description")
      ).to.revertedWith("E06");
    })

    it("Number of tokens in pool cannot exceed more than confirgured number", async () =>{
      await poolConfiguration.updateMaxToken(2);
      await expect(pool.connect(owner).addPublicPool([Address.APE_COIN,Address.ASTRA, Address.AAVE], [2,2,2],100,100,"Second Itoken","ITOKEN2","Test Description")
      ).to.revertedWith("E16");
    })

    it("Itoken should be deployed correctly", async () =>{
      expect(await itoken.name()).to.be.equal("First Itoken");
      expect(await itoken.symbol()).to.be.equal("ITOKEN1");
    })

    it("User can create multiple pool", async () =>{
      await pool.addPublicPool([Address.AAVE,Address.ASTRA], [2,2],100,100,"Second Itoken","ITOKEN2","Test Description");
      expect(await itokenDeployer.totalItokens()).to.be.equal(2);
    })

    it("Index owner should be implemented correctly", async () =>{
      await pool.connect(addr2).addPublicPool([Address.AAVE,Address.ASTRA], [2,2],100,100,"Second Itoken","ITOKEN2","Test Description");
      expect((await pool.poolInfo(0))['owner']).to.be.equal(owner.address);
      expect((await pool.poolInfo(1))['owner']).to.be.equal(addr2.address);
    })

    it("Cannot send the tokens array empty", async () =>{
      await expect(pool.addPublicPool([], [],0,0,"","","")
      ).to.revertedWith("E15");

    })
  })

  describe("Deposit in index", () => {
    beforeEach(async function(){
      itokenDeployer = await ItokenDeployer.deploy();
      await itokenDeployer.deployed();

      poolConfiguration = await upgrades.deployProxy(PoolConfiguration,[Address.ASTRA]);
      await poolConfiguration.deployed();

      payment = await deployProxy("IndicesPayment", [
        Address.ASTRA,
        poolConfiguration.address,
        addrs[0].address,
        addrs[0].address,
      ]);
      await payment.deployed();
      await payment.setAstraAmount(0);
      await poolConfiguration.setPaymentAddress(payment.address);

      pool = await upgrades.deployProxy(Pool,[Address.ASTRA,poolConfiguration.address,itokenDeployer.address,chef.address,swap.address, Address.WETH, Address.DAI], {useDeployedImplementation:false});
      await pool.deployed();
      await payment.setdaaAddress(pool.address);

      await chef.whitelistDepositContract(pool.address,true);
      await itokenDeployer.addDaaAdress(pool.address);

      await pool.addPublicPool([Address.APE_COIN,Address.ASTRA], [2,2],ethers.utils.parseUnits('1000', 18),100,"First Itoken","ITOKEN1","Test Description");
      await pool.addPublicPool([Address.APE_COIN,Address.DAI], [2,2],ethers.utils.parseUnits('0.01', 18),100,"Second Itoken","ITOKEN2","Test Description Base Stablecoin");
      let itokenAddress = (await pool.poolInfo(0))['itokenaddr'];
      itoken = await erc20iToken(itokenAddress);
      itokenAddress = (await pool.poolInfo(1))['itokenaddr'];
      itoken1 = await erc20iToken(itokenAddress);
      // await itoken.addChefAddress(pool.address);
      await poolConfiguration.updateBlackListStatus(addr1.address,true);
      await poolConfiguration.setTreasuryAddress(addr2.address);
      await poolConfiguration.whitelistDAOaddress(owner.address);
      await poolConfiguration.addStable(Address.DAI);
    })

    it("Should be able to add deposit via ether", async () =>{
      //Test value might change due to mainnet
      let tx = await pool.poolIn([],[],0,{value:ethers.utils.parseUnits('0.1', 18)});
      expect(await daiToken.balanceOf(pool.address)).to.be.equal('117373967841229126398');
    })

    it("Should be able to add deposit via supported stable coin", async () =>{
      await daiToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('10000', 18));
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('100', 18)],0);
      expect(await daiToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('100', 18));
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('100', 18));

    })
    
    it("Should be able to add deposit via supported stable coin in index with stablecoin", async () =>{
      await daiToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('10000', 18));
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('100', 18)],1);
      expect(await daiToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('50', 18));
      expect(await itoken1.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('100', 18));

    })

    it("Should be able to add deposit via supported stable coin other than base stable coin", async () =>{
      await poolConfiguration.addStable(Address.USDC);
      await usdcToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('10000', 6));
      await pool.connect(addr2).poolIn([usdcToken.address],[ethers.utils.parseUnits('100', 6)],0);
      expect(await daiToken.balanceOf(pool.address)).to.be.equal('99740953689859947583');
      expect(await itoken.balanceOf(addr2.address)).to.be.equal('99740953689859947583');
    })

    it("Should be not be able to add deposit other than supported stable coin", async () =>{
      await usdcToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('10000', 6));
      await expect(pool.connect(addr2).poolIn([usdcToken.address],[ethers.utils.parseUnits('100', 6)],0)
      ).to.revertedWith("E10");
    })

    it("User should not be able to deposit in non active pool", async () =>{

      await pool.setPoolStatus(false, 0);
      await expect(pool.connect(addr2).poolIn([usdcToken.address],[ethers.utils.parseUnits('100', 6)],0)
      ).to.revertedWith("Inactive");

    })

  })

  describe("Withdraw in index", () => {
    beforeEach(async function(){
      itokenDeployer = await ItokenDeployer.deploy();
      await itokenDeployer.deployed();

      poolConfiguration = await upgrades.deployProxy(PoolConfiguration,[Address.ASTRA]);
      await poolConfiguration.deployed();

      payment = await deployProxy("IndicesPayment", [
        Address.ASTRA,
        poolConfiguration.address,
        addrs[0].address,
        addrs[0].address,
      ]);
      await payment.deployed();
      await payment.setAstraAmount(0);
      await poolConfiguration.setPaymentAddress(payment.address);

      pool = await upgrades.deployProxy(Pool,[Address.ASTRA,poolConfiguration.address,itokenDeployer.address,chef.address,swap.address, Address.WETH, Address.DAI], {useDeployedImplementation:false});
      await pool.deployed();
      await payment.setdaaAddress(pool.address);

      await chef.whitelistDepositContract(pool.address,true);
      await itokenDeployer.addDaaAdress(pool.address);

      await pool.addPublicPool([Address.APE_COIN,Address.ASTRA], [2,2],ethers.utils.parseUnits('1000', 18),100,"First Itoken","ITOKEN1","Test Description");
      let itokenAddress = (await pool.poolInfo(0))['itokenaddr'];
      itoken = await erc20iToken(itokenAddress);
      // await itoken.addChefAddress(pool.address);
      await poolConfiguration.updateBlackListStatus(addr1.address,true);
      await poolConfiguration.setTreasuryAddress(addrs[0].address);
      await poolConfiguration.whitelistDAOaddress(owner.address);
      await poolConfiguration.addStable(Address.DAI);
    })

    it("Should be able to do the partial withdraw", async () =>{
      await daiToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('10000', 18));
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('100', 18)],0);
      await pool.connect(addr2).withdraw(0, false, false, ethers.utils.parseUnits('10', 18));
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('90', 18));
    })

    it("Should be able to withdraw the complete amount and exit fees", async () =>{
      //Test return value might change due to mainnet
      await daiToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('10000', 18));
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('100', 18)],0);
      await pool.connect(addr2).withdraw(0, false, false, ethers.utils.parseUnits('100', 18));
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('0', 18));
      expect(await astraToken.balanceOf(addrs[0].address)).to.be.equal('2813887166681194494481945');

    })

    it("User should be able to withdraw after rebalance", async () =>{
      await daiToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('10000', 18));
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('1000', 18)],0);
      await pool.updatePool([Address.AAVE,Address.ASTRA],[2,2],0,0, 0);
      await pool.connect(addr2).withdraw(0, false, false, ethers.utils.parseUnits('1000', 18));
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('0', 18));

    })

  })

  describe("Buy token from indices and rebalancing", () => {
    beforeEach(async function(){

      itokenDeployer = await ItokenDeployer.deploy();
      await itokenDeployer.deployed();

      poolConfiguration = await upgrades.deployProxy(PoolConfiguration,[Address.ASTRA]);
      await poolConfiguration.deployed();

      payment = await deployProxy("IndicesPayment", [
        Address.ASTRA,
        poolConfiguration.address,
        addrs[0].address,
        addrs[0].address,
      ]);
      await payment.deployed();
      await payment.setAstraAmount(0);
      await poolConfiguration.setPaymentAddress(payment.address);

      pool = await upgrades.deployProxy(Pool,[Address.ASTRA,poolConfiguration.address,itokenDeployer.address,chef.address,swap.address, Address.WETH, Address.DAI], {useDeployedImplementation:false});
      await pool.deployed();
      await payment.setdaaAddress(pool.address);

      await chef.whitelistDepositContract(pool.address,true);
      await itokenDeployer.addDaaAdress(pool.address);

      await pool.addPublicPool([Address.APE_COIN,Address.ASTRA], [2,2],ethers.utils.parseUnits('1000', 18),100,"First Itoken","ITOKEN1","Test Description");
      let itokenAddress = (await pool.poolInfo(0))['itokenaddr'];
      itoken = await erc20iToken(itokenAddress);
      // await itoken.addChefAddress(pool.address);
      await poolConfiguration.updateBlackListStatus(addr1.address,true);
      await poolConfiguration.setTreasuryAddress(addrs[0].address);
      await poolConfiguration.whitelistDAOaddress(owner.address);
      await poolConfiguration.addStable(Address.DAI);
      await pool.poolIn([],[],0,{value:ethers.utils.parseUnits('1', 18)});
    })

    it("Rebalance", async () =>{
        //Test values might change due to mainnet
        let tx = await pool.updatePool([Address.AAVE,Address.ASTRA],[2,2],0,0, 0);
        expect(await aaveToken.balanceOf(pool.address)).to.equal('10077717093453696081');
        expect(await astraToken.balanceOf(pool.address)).to.be.equal('4074222237713489955971629620');
        expect(await apeToken.balanceOf(pool.address)).to.be.equal('0');

    })

    it("Rebalance with base stablecoin", async () =>{
      //Test values might change due to mainnet
      let tx = await pool.updatePool([Address.AAVE,Address.DAI],[2,2],0,0, 0);
      expect(await aaveToken.balanceOf(pool.address)).to.equal('10077717093453696081');
      expect(await astraToken.balanceOf(pool.address)).to.be.equal('0');
      expect(await daiToken.balanceOf(pool.address)).to.be.equal('579849069369265800763');
      expect(await apeToken.balanceOf(pool.address)).to.be.equal('0');

  })

    it("At Withdraw contract", async () =>{
        let totalBalance = await itoken.balanceOf(owner.address);
        await pool.withdraw(0,false,false,totalBalance);
        expect(await aaveToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('0', 18));
        expect(await astraToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('0', 18));
        expect(await apeToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('0', 18));

    })

    it("Performance fees", async () =>{

      let amountIn = ethers.utils.parseUnits('20', 18)
      await swap.swapFromBestExchange(Address.ETH, Address.APE_COIN, amountIn, 1, {
        value: amountIn,
      });

      await swap.connect(addr1).swapFromBestExchange(Address.ETH, Address.ASTRA, amountIn, 1, {
        value: amountIn,
      });
      let totalBalance = await itoken.balanceOf(owner.address);
      await pool.withdraw(0,false,false,totalBalance);
      expect(await astraToken.balanceOf(addrs[0].address)).to.be.equal('42742405195009700053581638');
    })
  })

  describe("Multiple indices pool and rebalance", () => {
    beforeEach(async function(){

      itokenDeployer = await ItokenDeployer.deploy();
      await itokenDeployer.deployed();

      poolConfiguration = await upgrades.deployProxy(PoolConfiguration,[Address.ASTRA]);
      await poolConfiguration.deployed();

      payment = await deployProxy("IndicesPayment", [
        Address.ASTRA,
        poolConfiguration.address,
        addrs[0].address,
        addrs[0].address,
      ]);
      await payment.deployed();
      await payment.setAstraAmount(0);
      await poolConfiguration.setPaymentAddress(payment.address);

      let time = Math.round((new Date()).getTime() / 1000) + 86400;
      pool = await upgrades.deployProxy(Pool,[Address.ASTRA,poolConfiguration.address,itokenDeployer.address,chef.address,swap.address, Address.WETH, Address.DAI], {useDeployedImplementation:false});
      await pool.deployed();
      await payment.setdaaAddress(pool.address);

      await chef.whitelistDepositContract(pool.address,true);
      await itokenDeployer.addDaaAdress(pool.address);

      await pool.addPublicPool([Address.APE_COIN,Address.ASTRA], [2,2],ethers.utils.parseUnits('1000', 18),100,"First Itoken","ITOKEN1","Test Description");
      await pool.addPublicPool([Address.APE_COIN,Address.AAVE], [2,2],ethers.utils.parseUnits('1000', 18),time,"Second Itoken","ITOKEN2","Test Description");

      let itokenAddress = (await pool.poolInfo(0))['itokenaddr'];
      itoken = await erc20iToken(itokenAddress);
      // await itoken.addChefAddress(pool.address);
      await poolConfiguration.updateBlackListStatus(addr1.address,true);
      await poolConfiguration.setTreasuryAddress(addrs[0].address);
      await poolConfiguration.whitelistDAOaddress(owner.address);
      await poolConfiguration.addStable(Address.DAI);
    })

    it("Should be able to add deposit via supported stable coin", async () =>{
      await daiToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('10000', 18));
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('100', 18)],0);
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('100', 18)],1);
      expect(await daiToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('200', 18));
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('100', 18));
      let itokenAddress = (await pool.poolInfo(1))['itokenaddr'];
      itoken = await erc20iToken(itokenAddress);
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('100', 18))
    })

    it("Withdrawal should be working fine before buying tokens", async () =>{
      await daiToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('10000', 18));
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('100', 18)],0);
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('100', 18)],1);
      expect(await daiToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('200', 18));
      await pool.connect(addr2).withdraw(0,false,false, ethers.utils.parseUnits('100', 18))
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('0', 18));
      let itokenAddress = (await pool.poolInfo(1))['itokenaddr'];
      itoken = await erc20iToken(itokenAddress);
      await pool.connect(addr2).withdraw(1,false,false, ethers.utils.parseUnits('100', 18))
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('0', 18))
      expect(await daiToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('0', 18))
    })

    it("Withdrawal should be working fine after buying tokens", async () =>{
      await daiToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('1000000', 18));
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('10000', 18)],0);
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('10000', 18)],1);
      expect(await daiToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('0', 18));
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('10000', 18));
      await pool.connect(addr2).withdraw(0,false,false, ethers.utils.parseUnits('10000', 18))
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('0', 18));
      
      let itokenAddress = (await pool.poolInfo(1))['itokenaddr'];
      itoken = await erc20iToken(itokenAddress);
      
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('10000', 18))
      await pool.connect(addr2).withdraw(1,false,false, ethers.utils.parseUnits('10000', 18))
      expect(await itoken.balanceOf(addr2.address)).to.be.equal(ethers.utils.parseUnits('0', 18))
      expect(await aaveToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('0', 18));
      expect(await astraToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('0', 18));
      expect(await apeToken.balanceOf(pool.address)).to.be.equal(ethers.utils.parseUnits('0', 18));
    })

    it("Should not be able to do the rebalance before threshold reached", async () =>{
      await expect(pool.updatePool([Address.USDC,Address.ASTRA],[2,2],0,0, 0)).to.be.revertedWith('E14');
    })

    it("Should not be able to do the rebalance before rebalance time reached", async () =>{
      await expect(pool.connect(addrs[0]).updatePool([Address.USDC,Address.ASTRA],[2,2],0,0, 1)).to.be.revertedWith('E12');

    })

    it("Should not be able to do the rebalance with wrong confirguration", async () =>{
      await daiToken.connect(addr2).approve(pool.address, ethers.utils.parseUnits('1000000', 18));
      await pool.connect(addr2).poolIn([daiToken.address],[ethers.utils.parseUnits('2000', 18)],0);
      await expect(pool.updatePool([Address.USDC],[2,2],0,0, 0)).to.be.revertedWith('E02');
    })

    it("Non owner should not be able to do the rebalance", async () =>{
      await expect(pool.connect(addrs[0]).updatePool([Address.USDC,Address.ASTRA],[2,2],0,0, 0)).to.be.revertedWith('E13');
    })

    it("Should not add more than supported token ", async () =>{
      await poolConfiguration.updateMaxToken(2);
      await expect(pool.connect(owner).updatePool([Address.APE_COIN,Address.ASTRA, Address.AAVE], [2,2,2],0,0,0)
      ).to.revertedWith("E16");
    })


  })
});
