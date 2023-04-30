require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
require("@openzeppelin/hardhat-upgrades");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-truffle5");

const { ALCHEMY_API_KEY, GOERLI_PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      blockGasLimit: 10000000,
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
        blockNumber: 16045262,
      },
    },
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      accounts: [GOERLI_PRIVATE_KEY],
    },
    ganache: {
      url: "http://127.0.0.1:7545",
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  solidity: {
    compilers: [
      {
        version: "0.5.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  paths: {
    sources: "./main",
  },
};
