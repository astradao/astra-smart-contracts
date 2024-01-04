require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
require("@openzeppelin/hardhat-upgrades");
require("@nomiclabs/hardhat-etherscan");

// Testnet
const { ALCHEMY_API_KEY, TEST_PRIVATE_KEY, ETHERSCAN_API_KEY, POLYGONSCAN_API_KEY, BSCSCAN_API_KEY } = process.env;
// Mainnet
const { DEPLOYER_PRIVATE_KEY, ARBISCAN_API_KEY, ARBITRUM_RPC_URL } = process.env;

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      blockGasLimit: 10000000,
      forking: {
        url: ARBITRUM_RPC_URL,
        blockNumber: 16045262,
      },
    },
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      accounts: [TEST_PRIVATE_KEY],
    },
    ganache: {
      url: "http://127.0.0.1:7545",
    },
    polygonMumbai: {
      url: "https://rpc-mumbai.maticvigil.com",
      accounts: [TEST_PRIVATE_KEY],
    },
    arbitrumGoerli: {
      url: "https://goerli-rollup.arbitrum.io/rpc",
      accounts: [TEST_PRIVATE_KEY],
    },
    bscTestnet: {
      url: "https://endpoints.omniatech.io/v1/bsc/testnet/public",
      accounts: [TEST_PRIVATE_KEY],
    },
    arbitrumOne: {
      url: ARBITRUM_RPC_URL,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      bscTestnet: BSCSCAN_API_KEY,
      polygonMumbai: POLYGONSCAN_API_KEY,
      arbitrumOne: ARBISCAN_API_KEY,
    }
  },
  solidity: {
    compilers: [
      {
        version: "0.7.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.0",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.1",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.2",
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
    sources: "./src",
    tests: "./test/hardhat",
    scripts: "./script/hardhat",
  },
};