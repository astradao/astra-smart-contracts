require("@nomiclabs/hardhat-waffle");
require("@openzeppelin/hardhat-upgrades");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-truffle5");

task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});


module.exports = {
  defaultNetwork: "kovan",
  networks: {
    hardhat: {
      blockGasLimit: 10000000,
    },
    kovan: {
      // You need to pass provider.
      url: "https://kovan.infura.io/v3/project_id",
      // You need to pass provider.
      accounts: ["You_Account_Private_Key"],
    },

    mainnet: {
      // You need to pass provider.
      url:"https://mainnet.infura.io/v3/project_id",
      // You need to manually pass the array of private of accounts
      accounts: ["You_Account_Private_Key"],
      gas: 8000000
    },
    ganache: {
      url: "http://127.0.0.1:7545",
    },
  },
  etherscan: {
    // This will used to verify the contract
    // apiKey: "Etherscan_API_KEY"
  },
  solidity: {
    compilers:[
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
      }
    ]

  },
  paths: {
    sources: "./main",
  },
};