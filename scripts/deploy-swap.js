const { ethers, upgrades } = require("hardhat");
const { BN } = require('@openzeppelin/test-helpers');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer address", deployer.address);

  const sushiswapRouter = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
  const uniswapRouterV2 = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
  const uniswapRouterV3 = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const quoterV3 = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"

  const LibraryContract = await ethers.getContractFactory("UniversalERC20");
  const Library = await LibraryContract.deploy();
  console.log("Library address" ,Library.address)
  const SwapDeployerContract = await ethers.getContractFactory("Swap",{
    libraries: {
      UniversalERC20: Library.address
    }
  });
  const SwapDeployer = await upgrades.deployProxy(SwapDeployerContract,[deployer.address,sushiswapRouter,uniswapRouterV2,uniswapRouterV3,quoterV3],{ unsafeAllow: ['delegatecall','external-library-linking'] });
  console.log("Swap address" ,SwapDeployer.address)
}

main();
