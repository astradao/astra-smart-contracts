Setup 
1. Install latest Nodejs version and truffle.

2. Clone the project in your working directory.

3. Run command from terminal "npm run install" to install all the dependencies.

4. Complie contract "npm run compile".

5. Run test "npm run mocha".

6. Deploy "npx hardhat --network kovan run scripts/deploy.js". Before running this command please set private key and infura id in hardhat configuration file.


Contracts Files

Astra/Itoken staking: version-6/chef.sol

Lp token staking: version-6/lm-pool.sol

Lp token staking(Uniswap version 3): version-6/lm-pool-erc721.sol

Astra: version-6/astr.sol

Indices pool: version-5/poolv2.sol

Uniswap/Sushiswap Aggregator: version-6/swap.sol

Indices pool configuration: version-5/poolConfiguration.sol

Payment: version-5/indicespayment.sol

Governance: version-5/governance.sol

Oracle: version-5/Oracle.sol

Itoken: version-5/itoken.sol

Vesting: version-6/treasury-vesting.sol