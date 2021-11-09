
const Astra = artifacts.require('Token');
const Pool = artifacts.require('PoolV1');
const TransferHandler = artifacts.require('TransferHandler'); 
const Oracle = artifacts.require('DAAORacle');
const PoolConfiguration  =  artifacts.require('PoolConfiguration');
const ItokenDeployer = artifacts.require('itokendeployer');
const Itoken = artifacts.require('itoken');
const MasterChef = artifacts.require('MasterChef');
const Timelock = artifacts.require('TimelockMock');
const Governance = artifacts.require('GovernorAlphaMock');

// address public EXCHANGE_CONTRACT = 0x5e676a2Ed7CBe15119EBe7E96e1BB0f3d157206F;
// address public WETH_ADDRESS = 0x7816fBBEd2C321c24bdB2e2477AF965Efafb7aC0;
// address public baseStableCoin = 0xc6196e00Fd2970BD91777AADd387E08574cDf92a;
const { BN } = require('@openzeppelin/test-helpers');
const rewardamount = new BN("1000000000000000000");
const startblock = 23063177;
const endblock = 33063177;
const RouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const perBlockReward = (new BN(10)).mul((new BN(10)).pow((new BN(18))))
const URL = "TEST_URL"

async function deployInitialcontracts(deployer) {
  console.log("---- Deploying Initial contracts ----");
  let deployerAddress = deployer.networks[deployer.network].from;
  
  await deployer.deploy(Astra,{ from: deployerAddress});
  console.log("Astra Address ",Astra.address);
  
  let AstraInstance = await Astra.deployed();
  await AstraInstance.initialize(deployerAddress, { from: deployerAddress });
  
  await deployer.deploy(TransferHandler,Astra.address,RouterAddress,{ from: deployerAddress});
  console.log("TransferHandler Address ",TransferHandler.address);

  await AstraInstance.setTransferHandler(TransferHandler.address, { from: deployerAddress });

  await deployer.deploy(Oracle, {from: deployerAddress});
  let OracleInstance = await Oracle.deployed();
  await OracleInstance.initialize({ from: deployerAddress });
  console.log("Oracle Address ",Oracle.address);

  await deployer.deploy(ItokenDeployer, {from: deployerAddress});
  console.log("ItokenDeployer Address ",ItokenDeployer.address);
  await deployer.deploy(MasterChef,{ from: deployerAddress});
  let MasterChefInstance = await MasterChef.deployed();
  await MasterChefInstance.initialize(Astra.address, deployerAddress, perBlockReward, 26947832, 46930769, { from: deployerAddress});

  await deployer.deploy(PoolConfiguration, {from: deployerAddress})
  let PoolConfigurationInstance = await PoolConfiguration.deployed();
  await PoolConfigurationInstance.initialize(Astra.address, { from: deployerAddress });
  console.log("PoolConfiguration Address ",PoolConfiguration.address);

  await deployer.deploy(Pool,{from:deployerAddress});
  let PoolInstance = await Pool.deployed();
  await PoolInstance.initialize(Astra.address,PoolConfiguration.address,ItokenDeployer.address,MasterChef.address, { from: deployerAddress });
  console.log("Pool Address ",Pool.address);

  await deployer.deploy(Timelock,deployerAddress,120,{from:deployerAddress});
  console.log("Timelock Address ",Timelock.address);

  await deployer.deploy(Governance,{from:deployerAddress});
  let GovernanceInstance = await Governance.deployed();
  await GovernanceInstance.initialize(Timelock.address,Astra.address,MasterChef.address, { from: deployerAddress });

  console.log("Governance Address ",Governance.address);

  let PoolConfInstance = await PoolConfiguration.deployed();
  await PoolConfInstance.setOracleaddress(Oracle.address,{ from: deployerAddress })

  let IdeployerInstance = await ItokenDeployer.deployed();
  await IdeployerInstance.addDaaAdress(Pool.address,{ from: deployerAddress })

  
}

module.exports = function(deployer) {
  // console.log("Deployer Details",deployer);
  deployer.then(async() => {
    switch (deployer.network) {
      case 'kovan':
        await deployInitialcontracts(deployer);
        break;
      case 'kovan-fork':
          await deployInitialcontracts(deployer);
          break;
      default:
        throw("Unsupported network");
    }
  })
};
