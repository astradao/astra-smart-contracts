const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer", deployer.address);

  const SUSHISWAP_ROUTER = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
  const UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
  const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const UNISWAP_V3_QUOTER = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
  const ETH = "0x0000000000000000000000000000000000000000";
  const USDC = "0x07865c6E87B9F70255377e024ace6630C1Eaa37F";
  const DAI = "0x11fE4B6AE13d2a6055C8D9cF65c55bac32B5d844";

  const UniversalERC20 = await ethers.getContractFactory(
    "main/version-6/swapv2.sol:UniversalERC20"
  );
  const universalERC20 = await UniversalERC20.deploy();
  await universalERC20.deployed();
  console.log("UniversalERC20", universalERC20.address)

  const SwapV2 = await ethers.getContractFactory("SwapV2", {
    libraries: {
      UniversalERC20: universalERC20.address,
    },
  });

  const swapV2 = await upgrades.deployProxy(
    SwapV2,
    [
      SUSHISWAP_ROUTER,
      UNISWAP_V2_ROUTER,
      UNISWAP_V3_ROUTER,
      UNISWAP_V3_QUOTER,
      [ETH, DAI, USDC],
    ],
    { unsafeAllowLinkedLibraries: true }
  );

  await swapV2.deployed();

  console.log("SwapV2", swapV2.address);
}

main();
