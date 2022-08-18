const { ethers, upgrades } = require("hardhat");
const { BN } = require('@openzeppelin/test-helpers');

async function main() {

  // Testnet Address
  const exchangeAddress = "0x393563704217Fae16450b92F2C00bF0f520EF3A2";
  const wethAddress = "0x7816fBBEd2C321c24bdB2e2477AF965Efafb7aC0";
  const stableAddress = "0xc6196e00Fd2970BD91777AADd387E08574cDf92a";

  // Mainnet Addresses
  // const exchangeAddress = "0x50FDA034C0Ce7a8f7EFDAebDA7Aa7cA21CC1267e";
  // const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  // const stableAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

  const [deployer] = await ethers.getSigners();
  console.log("Deployer address", deployer.address);

  // const AstraAddress = "0x6Ba79f45e657d8498528ed7347902547030097a7";
  const RouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

  const AstraContract = await ethers.getContractFactory("Token");
  const Astra = await upgrades.deployProxy(AstraContract, [deployer.address]);
  await Astra.deployed();
  console.log("Astra deployed to:", Astra.address);

  const ChefContract = await ethers.getContractFactory("MasterChef");
  const Chef = await upgrades.deployProxy(ChefContract, [Astra.address,"80000000000000000000",31685163, 36326163]);
  await Chef.deployed();
  console.log("Chef deployed to:", Chef.address);

  const LPContract = await ethers.getContractFactory("LmPool");
  const LP = await upgrades.deployProxy(LPContract, [Astra.address,"80000000000000000000",31685163, 36326163]);
  await LP.deployed();
  console.log("LM  deployed to:", LP.address);

  const LMV3Contract = await ethers.getContractFactory("LmPoolV3");
  const V3 = await upgrades.deployProxy(LMV3Contract, [Astra.address,"80000000000000000000",31685163, 36326163]);
  await V3.deployed();
  console.log("V3 staking deployed to:", V3.address);

  const vestingContract = await ethers.getContractFactory("TokenVesting");
  const vesting = await upgrades.deployProxy(
    vestingContract,
    [Astra.address,120]
  );
  await vesting.deployed();
  console.log("Vesting deployed to:", vesting.address);

  const ItokenDeployerContract = await ethers.getContractFactory("itokendeployer");
  const ItokenDeployer = await ItokenDeployerContract.deploy();
  console.log("Itoken address" ,ItokenDeployer.address)

  const OracleContract = await ethers.getContractFactory("DAAORacle");
  const Oracle = await upgrades.deployProxy(OracleContract);
  await Oracle.deployed();
  console.log("Oracle address" ,Oracle.address)

  const PoolConfContract = await ethers.getContractFactory("PoolConfiguration");
  const PoolConf = await upgrades.deployProxy(PoolConfContract, [Astra.address]);
  await PoolConf.deployed();
  console.log("PoolConf deployed to:", PoolConf.address);

  const PoolV2Contract = await ethers.getContractFactory("PoolV2");
  const PoolV2 = await upgrades.deployProxy(PoolV2Contract, [Astra.address,PoolConf.address,ItokenDeployer.address,Chef.address,exchangeAddress,wethAddress,stableAddress]);
  await PoolV2.deployed();
  console.log("Indices pool deployed to:", PoolV1.address);

  const TimelockContract = await ethers.getContractFactory("Timelock");
  const Timelock = await TimelockContract.deploy(deployer.address,172800);
  console.log("Timelock address" ,Timelock.address)

  const GovernanceContract = await ethers.getContractFactory("GovernorAlpha");
  const Governance = await upgrades.deployProxy(GovernanceContract, [Timelock.address,Astra.address,Chef.address]);
  await Governance.deployed();
  console.log("GovernorAlpha deployed to:", Governance.address);
}

main();
