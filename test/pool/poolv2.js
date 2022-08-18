const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { parse } = require('dotenv');
const { signTypedData } = require('eth-sig-util');
const URL = "TEST_URL";

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;
const Astrsample = contract.fromArtifact('Token');
const Timelock = contract.fromArtifact('Timelock');
const Governance = contract.fromArtifact('GovernorAlpha');
const TestERC20 = contract.fromArtifact('TESTERC20');
const MocKExchange = contract.fromArtifact('MockExchangeUniswap');
const PoolChef = contract.fromArtifact('MasterChef');
const Oracle = contract.fromArtifact('DAAORacle');
const Pool = contract.fromArtifact('PoolV2');
const PoolConfiguration  =  contract.fromArtifact('PoolConfiguration');
const ItokenDeployer = contract.fromArtifact('itokendeployer');
const Itoken = contract.fromArtifact('itoken');

const decimal = new BN(18);
const oneether = (new BN(10)).pow(decimal);
const rewarddecimal = new BN(14);
const onerewardpoint =  (new BN(10)).pow(rewarddecimal)
const onerewardpointusdt = (new BN(10)).pow((new BN(2)))
const onerewardpointusdc = (new BN(10)).pow((new BN(20)))
const totalSupply = (new BN(1000)).mul(oneether)
const totalSupplyusdt = (new BN(1000)).mul((new BN(10)).pow((new BN(6))))
const totalSupplyusdc = (new BN(1000)).mul((new BN(10)).pow((new BN(24))))
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const rewardamount = new BN("1000000000000000000");
const startblock = 0;
const endblock = 5000;


const {
    encodeParameters
  } = require('../../Util/Ethereum');
// const MockImplA = contract.fromArtifact('MockImplA');
// const MockImplB = contract.fromArtifact('MockImplB');

const VOTE_PERIOD = 9;
const EXPIRATION = 3;
const EMERGENCY_COMMIT_PERIOD = 6;

const UNDECIDED = new BN(0);
const APPROVE = new BN(1);
const REJECT = new BN(2);

const INITIAL_STAKE_MULTIPLE = new BN(10).pow(new BN(6));
describe('DAA', function () {
    const [ ownerAddress, userAddress1, userAddress2, userAddress3 ] = accounts;
    beforeEach(async function() {
        this.astra = await TestERC20.new("Astra", "ASTR",18, {from: ownerAddress, gas: 8000000});
        this.poolchef = await PoolChef.new({from: ownerAddress, gas: 8000000});
        await this.poolchef.initialize(this.astra.address, ownerAddress,rewardamount,startblock,endblock,{from: ownerAddress, gas: 8000000})
        await this.poolchef.addVault("6", { from: ownerAddress })
        this.dai = await TestERC20.new("Dai", "ASTR",18, {from: ownerAddress, gas: 8000000});
        this.usdt = await TestERC20.new("USDT", "USDT",6, {from: ownerAddress, gas: 8000000});
        this.usdc = await TestERC20.new("USDC", "USDC",24, {from: ownerAddress, gas: 8000000});
        this.weth = await TestERC20.new("Weth", "WETH",18, {from: ownerAddress, gas: 8000000});
        this.token1 = await TestERC20.new("Token 1", "TOKEN1",18, {from: ownerAddress, gas: 8000000});
        this.token2 = await TestERC20.new("Token 2", "TOKEN2",18, {from: ownerAddress, gas: 8000000});
        this.token3 = await TestERC20.new("Token 3", "TOKEN3",18, {from: ownerAddress, gas: 8000000});
        this.token4 = await TestERC20.new("Token 4", "TOKEN4",18, {from: ownerAddress, gas: 8000000});
        this.Oracle = await Oracle.new( {from: ownerAddress, gas: 8000000});
        this.Oracle.initialize({from: ownerAddress, gas: 8000000})
        this.mockexchange = await MocKExchange.new(this.token1.address,this.token2.address,this.token3.address,this.token4.address,this.dai.address,this.astra.address,{from:ownerAddress,gas: 8000000});
        this.ideployer = await ItokenDeployer.new( {from: ownerAddress, gas: 8000000});
        this.poolconfiguration = await PoolConfiguration.new({from: ownerAddress,gas: 8000000})
        this.poolconfiguration.initialize(this.astra.address,{from: ownerAddress, gas: 8000000})
        this.pool = await Pool.new({from: ownerAddress, gas: 8000000});
        await this.pool.initialize(this.astra.address,this.poolconfiguration.address,this.ideployer.address,this.poolchef.address,this.mockexchange.address, this.weth.address, this.dai.address,{from:ownerAddress,gas: 8000000});
        await this.poolchef.setDaaAddress(this.pool.address, { from: ownerAddress })
        await this.poolchef.add(this.astra.address, { from: ownerAddress })
        await this.ideployer.addDaaAdress(this.pool.address,{from: ownerAddress, gas: 8000000});
        await this.dai.transfer(this.mockexchange.address,totalSupply,{from: ownerAddress, gas: 8000000});
        await this.usdt.transfer(this.mockexchange.address,totalSupplyusdt,{from: ownerAddress, gas: 8000000});
        await this.usdc.transfer(this.mockexchange.address,totalSupplyusdc,{from: ownerAddress, gas: 8000000});
        await this.token1.transfer(this.mockexchange.address,totalSupply,{from: ownerAddress, gas: 8000000});
        await this.token2.transfer(this.mockexchange.address,totalSupply,{from: ownerAddress, gas: 8000000});
        await this.token3.transfer(this.mockexchange.address,totalSupply,{from: ownerAddress, gas: 8000000});
        await this.token4.transfer(this.mockexchange.address,totalSupply,{from: ownerAddress, gas: 8000000});
        await this.astra.transfer(this.mockexchange.address,totalSupply,{from: ownerAddress, gas: 8000000});
    });
    describe("Configuration Test",function(){
        describe("Update the DAO contract address",function(){
            it("Should Revert if non whitelist manager tries to update the DAO contract address", async function () {
                await expectRevert(this.poolconfiguration.whitelistDAOaddress(ownerAddress,{from:userAddress1}),"Manager only");
            });
            it("Should update the DAO contract address", async function () {
                await this.poolconfiguration.whitelistDAOaddress(userAddress1,{from: ownerAddress})
                expect(await this.poolconfiguration.enabledDAO(userAddress1)).to.be.equal(true);
            });
            it("Should not update the DAO contract address twice", async function () {
                await this.poolconfiguration.whitelistDAOaddress(userAddress1,{from: ownerAddress})
                await expectRevert(this.poolconfiguration.whitelistDAOaddress(userAddress1,{from: ownerAddress}),"whitelistDAOaddress: Already whitelisted");
            });
            it("Should disable the DAO contract address", async function () {
                await this.poolconfiguration.whitelistDAOaddress(userAddress1,{from: ownerAddress});
                await this.poolconfiguration.removeDAOaddress(userAddress1,{from: ownerAddress});
                expect(await this.poolconfiguration.enabledDAO(userAddress1)).to.be.equal(false);
            });
        }) 

        describe("Update the Oracle contract address",function(){
            it("Should Revert if non whitelist manager tries to update the  contract address", async function () {
                await expectRevert(this.poolconfiguration.setOracleaddress(ownerAddress,{from:userAddress1}),"Manager only");
            });
            it("Should update the Oracle contract address", async function () {
                await this.poolconfiguration.setOracleaddress(userAddress1,{from: ownerAddress})
                expect(await this.poolconfiguration.Oraclecontract()).to.be.equal(userAddress1);
            });
            it("Should not update the Oracle contract address twice", async function () {
                await this.poolconfiguration.setOracleaddress(userAddress1,{from: ownerAddress})
                await expectRevert(this.poolconfiguration.setOracleaddress(userAddress1,{from: ownerAddress}),"setOracleaddress: Already set");
            });
            it("Should update the Oracle contract address", async function () {
                await this.poolconfiguration.setOracleaddress(userAddress1,{from: ownerAddress})
                await this.poolconfiguration.setOracleaddress(userAddress2,{from: ownerAddress})
                expect(await this.poolconfiguration.Oraclecontract()).to.be.equal(userAddress2);
            });
        }) 


        describe("Update the Whitelist Manager",function(){
            it("Owner should be manager", async function () {
                 expect(await this.poolconfiguration.managerAddresses()).to.be.equal(ownerAddress);
            });
            it("Only manager can update manager address", async function () {
                await expectRevert(this.poolconfiguration.updatewhitelistmanager(userAddress2,{from:userAddress1}),"Manager only");
            });
            it("Should update the manager address", async function () {
                await this.poolconfiguration.updatewhitelistmanager(userAddress2,{from:ownerAddress})
                expect(await this.poolconfiguration.managerAddresses()).to.be.equal(userAddress2);
            });
            it("Should not update the manager address twice", async function () {
                await this.poolconfiguration.updatewhitelistmanager(userAddress2,{from:ownerAddress})
                await expectRevert(this.poolconfiguration.updatewhitelistmanager(userAddress2,{from:userAddress2}),"updatewhitelistmanager: Already Manager")
            });
        })

    })

    describe("DAO functionality test",function(){
        beforeEach(async function() {
            await this.poolconfiguration.whitelistDAOaddress(userAddress1,{from: ownerAddress})
        })
        describe("Check Initial Rate",function(){       
            it("Performance fees should fee 2 percent", async function () {
                expect(await this.poolconfiguration.performancefees()).to.be.bignumber.equal(new BN(20));
            });
            it("Slippage rate should fee 10 percent", async function () {
                expect(await this.poolconfiguration.slippagerate()).to.be.bignumber.equal(new BN(10));
            });
        });
        describe("Update the Performance fees",function(){       
            it("Performance fees should fee 25 percent", async function () {
                let value = new BN(25);
                await this.poolconfiguration.updatePerfees(value,{from:userAddress1})
                expect(await this.poolconfiguration.performancefees()).to.be.bignumber.equal(value);
            });
            it("Should Revert if function called by not DAO contract/Address", async function () {
                await expectRevert(this.poolconfiguration.updatePerfees(25,{from:ownerAddress}),"dao only");
            });
        });
        describe("Update the Slippage rate",function(){       
            it("Slippage rate should fee 15 percent", async function () {
                let value = new BN(15);
                await this.poolconfiguration.updateSlippagerate(value,{from:userAddress1})
                expect(await this.poolconfiguration.slippagerate()).to.be.bignumber.equal(value);
            });
            it("Should Revert if function called by not DAO contract/Address", async function () {
                await expectRevert(this.poolconfiguration.updateSlippagerate(15,{from:ownerAddress}),"dao only");
            });
        });
        describe("Add the new stable coins",function(){       
            it("Add the DAI from stable", async function () {
                let value = new BN(15);
                await this.poolconfiguration.addStable(this.dai.address,{from:userAddress1})
                expect(await this.poolconfiguration.checkStableCoin(this.dai.address)).to.be.equal(true);
            });
            it("Should Revert if function called by not DAO contract/Address", async function () {
                await expectRevert(this.poolconfiguration.addStable(this.dai.address,{from:ownerAddress}),"dao only");
            });
        });
        describe("Remove the stable coin",function(){       
            it("Remove the DAI from stable coins", async function () {
                let value = new BN(15);
                await this.poolconfiguration.addStable(this.dai.address,{from:userAddress1})
                await this.poolconfiguration.removeStable(this.dai.address,{from:userAddress1})
                expect(await this.poolconfiguration.checkStableCoin(this.dai.address)).to.be.equal(false);
            });
            it("Should Revert if function called by not DAO contract/Address", async function () {
                await expectRevert(this.poolconfiguration.removeStable(this.dai.address,{from:ownerAddress}),"dao only");
            });
        });
    })

    describe("Deposit in Pool",function(){
        beforeEach(async function() {
            await this.poolconfiguration.setOracleaddress(this.Oracle.address,{from:ownerAddress,gas: 8000000});
            let tokens = [this.token1.address,this.token2.address]
            let weight = [2,2];
            let rebal= 1;
            let threshold=  new BN("30000000000000000");  
            await this.Oracle.whitelistaddress(ownerAddress,{from:ownerAddress,gas: 8000000})
            await this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:ownerAddress,gas: 8000000})
            await this.poolconfiguration.whitelistDAOaddress(userAddress1,{from: ownerAddress})
            await this.poolconfiguration.addStable(this.dai.address,{from:userAddress1})
            await this.pool.addPublicPool([],[],0,0,"","","",{from:ownerAddress,gas: 8000000});
            var itokenaddress = await this.ideployer.getcoin(0);
            // var itokenaddress = await this.ideployer.totalItokens();
            // console.log("Itoken address ",parseInt(itokenaddress));
            this.itoken = await Itoken.at(itokenaddress);
            let ibalance = await this.itoken.balanceOf(userAddress1);
            await this.pool.poolIn([],[],0,{from:userAddress1,value:10000000000000000,gas: 8000000});
            // console.log("Balance ",parseInt(ibalance));
        });

        describe("Check Initial Token details",function(){
            it("Pool should have DAI balance",async function(){
                expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(100)).mul(onerewardpoint));
            })
            it("Pool should zero Token 1 balance",async function(){
                expect(await this.token1.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
            })
            it("Pool should zero Token 2 balance",async function(){
                expect(await this.token2.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
            })
            it("Pool should zero Token 3 balance",async function(){
                expect(await this.token3.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
            })
            it("Pool should zero Token 4 balance",async function(){
                expect(await this.token4.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
            })
            it("User should zero 0 itoken balance",async function(){
                expect(await this.token4.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
            })
            it("Check description",async function(){
                let data = await this.pool.poolInfo(0);
                expect(data.description).to.be.equal("Test description");
            })
        })
        describe("Check Multiple Pool",function(){
            beforeEach(async function() {
                let tokens = [this.token1.address,this.token2.address]
                let weight = [2,2];
                let rebal= 1;
                let threshold=  new BN("100000000000000000");  
                await this.pool.addPublicPool(tokens, weight,threshold,rebal,"Second Itoken","ITOKEN2","Test Description multiple",{from:ownerAddress,gas: 8000000});
                var itokenaddress = await this.ideployer.getcoin(1);
                // var itokenaddress = await this.ideployer.totalItokens();
                // console.log("Itoken address ",parseInt(itokenaddress));
                this.itokensecond = await Itoken.at(itokenaddress);
                let ibalance = await this.itoken.balanceOf(userAddress1);
                await this.pool.poolIn([],[],1,{from:userAddress1,value:10000000000000000,gas: 8000000});
                // console.log("Balance ",parseInt(ibalance));
            });

            it("Check Itoken 2 Name",async function(){
                expect(await this.itokensecond.name()).to.be.equal("Second Itoken");
            })

            it("Check IToken 2 symbol",async function(){
                expect(await this.itokensecond.symbol()).to.be.equal("ITOKEN2");
            })
            it("User 1 should have IToken 2 balance",async function(){
                expect(await this.itokensecond.balanceOf(userAddress1)).to.be.bignumber.equal((new BN(100)).mul(onerewardpoint));
            })

            it("Check description",async function(){
                let data = await this.pool.poolInfo(1);
                expect(data.description).to.be.equal("Test Description multiple");
            })

            it("Deposit with second User",async function(){
                await this.pool.poolIn([],[],1,{from:userAddress2,value:10000000000000000,gas: 8000000});
                expect(await this.itokensecond.balanceOf(userAddress2)).to.be.bignumber.equal((new BN(100)).mul(onerewardpoint));
            })

            it("Check DAI balance of Pool",async function(){
                expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(200)).mul(onerewardpoint));
            })
            
        })

        describe("Check Multiple Stabe coin deposit",function(){
            describe("Deposit using stable coins",function(){  
                beforeEach(async function(){
                    await this.dai.transfer(userAddress1,(new BN(100)).mul(onerewardpoint),{from: ownerAddress, gas: 8000000});
                    await this.usdt.transfer(userAddress1,(new BN(100)).mul(onerewardpointusdt),{from: ownerAddress, gas: 8000000});
                    await this.usdc.transfer(userAddress1,(new BN(100)).mul(onerewardpointusdc),{from: ownerAddress, gas: 8000000});
                })
                it("Should be able to deposit DAI", async function () {
                    let tokens = [this.dai.address]
                    let amount = [(new BN(100)).mul(onerewardpoint)]
                    await this.dai.approve(this.pool.address,(new BN(100)).mul(onerewardpoint),{from: userAddress1, gas: 8000000});
                    // await this.poolconfiguration.addStable(this.usdc.address,{from:ownerAddress});
                    await this.pool.poolIn(tokens,amount,0,{from:userAddress1,gas: 8000000});
                    expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(200)).mul(onerewardpoint));

                });
                it("Should be able to deposit USDT", async function () {
                    let tokens = [this.usdt.address]
                    let amount = [(new BN(100)).mul(onerewardpointusdt)]
                    await this.usdt.approve(this.pool.address,(new BN(100)).mul(onerewardpointusdt),{from: userAddress1, gas: 8000000});
                    let allowance = await this.usdt.allowance(userAddress1,this.pool.address);
                    let balance = await this.usdt.balanceOf(userAddress1);
                    console.log("Allowance ",parseInt(allowance));
                    console.log("Amount    ",parseInt(amount[0]));
                    console.log("Balance   ",parseInt(balance));
                    await this.poolconfiguration.addStable(this.usdt.address,{from:userAddress1});
                    await this.pool.poolIn(tokens,amount,0,{from:userAddress1,gas: 8000000});
                    expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(200)).mul(onerewardpoint));
                });
                it("Should be able to deposit USDC", async function () {
                    let tokens = [this.usdc.address]
                    let amount = [(new BN(100)).mul(onerewardpointusdc)]
                    await this.usdc.approve(this.pool.address,(new BN(100)).mul(onerewardpointusdc),{from: userAddress1, gas: 8000000});

                    await this.poolconfiguration.addStable(this.usdc.address,{from:userAddress1});
                    await this.pool.poolIn(tokens,amount,0,{from:userAddress1,gas: 8000000});
                    expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(200)).mul(onerewardpoint));

                });
                
            });
            describe("Update the Pool ",function(){     
                beforeEach(async function(){
                    await this.pool.poolIn([],[],0,{from:userAddress1,value:20000000000000000,gas: 8000000});
                    let tokens = [this.token3.address,this.token4.address]
                    let weight = [2,2];
                    let rebal= 1;
                    let threshold= 10;
                    await this.Oracle.UpdatePoolConfiguration(tokens,weight,0,threshold,rebal,{from:ownerAddress,gas: 8000000})
                    await this.pool.updatePool([],[],0,0, 0,{from:ownerAddress,gas: 8000000});    
                })  
                it("Pool should have  zero DAI balance",async function(){
                    expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                })
                it("Pool should zero Token 3 balance",async function(){
                    expect(await this.token3.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(450)).mul(onerewardpoint));
                })
                it("Pool should zero Token 4 balance",async function(){
                    expect(await this.token4.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(600)).mul(onerewardpoint));
                })
            });
        })

        describe("Deposit Stable coin in Pool",function(){
            beforeEach(async function() {
                let value = (new BN(100)).mul(onerewardpoint)
                await this.dai.transfer(userAddress1,value,{from: ownerAddress, gas: 8000000});
                await this.dai.approve(this.pool.address,value,{from: userAddress1, gas: 8000000});
                let tokens = [this.dai.address];
                let amount = [value]
                await this.pool.poolIn(tokens,amount,0,{from:userAddress1,gas: 8000000});
                let Balance3 = await this.itoken.balanceOf(userAddress1);
                console.log("Balance 3 stable coin",parseInt(Balance3));
            });
            describe("Check Token Balance after stable supply",function(){
                it("Pool should have  DAI balance",async function(){
                    expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(200)).mul(onerewardpoint));
                })
            })
        })
        describe("Withdraw before threshold is reached.",function(){
            beforeEach(async function() {
                let value = (new BN(100)).mul(onerewardpoint)
                await this.itoken.approve(this.pool.address,value,{from:userAddress1,gas: 8000000})
                await this.pool.withdraw(0,false,false,value,{from:userAddress1,gas: 8000000});
            });

            describe("Check Token Balance",function(){
                it("Pool should have  zero DAI balance",async function(){
                    expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                })
                it("User should have the DAI Token",async function(){
                    expect(await this.dai.balanceOf(userAddress1)).to.be.bignumber.equal((new BN(98)).mul(onerewardpoint));
                })
                
            }) 

        })
        describe("Buy token once threshold is reached in Pool",function(){
            beforeEach(async function() {
                await this.pool.poolIn([],[],0,{from:userAddress1,value:20000000000000000,gas: 8000000});
            });
            describe("Check Token Balance",function(){
                it("Pool should have  zero DAI balance",async function(){
                    expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                })
                it("Pool should Token 1 balance",async function(){
                    expect(await this.token1.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(150)).mul(onerewardpoint));
                })
                it("Pool should Token 2 balance",async function(){
                    expect(await this.token2.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(300)).mul(onerewardpoint));
                })
                it("Pool should zero Token 3 balance",async function(){
                    expect(await this.token3.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                })
                it("Pool should zero Token 4 balance",async function(){
                    expect(await this.token4.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                })
            })
            describe("Should Withdraw from Pool on threshold is reached",function(){
                it("Selling pool tokens",async function(){
                    let value = (new BN(300)).mul(onerewardpoint)
                    await this.pool.withdraw(0,true,false,value,{from:userAddress1,gas: 8000000});
                    console.log("Successfull withdrawn");
                })
            })
        })
        describe("Withdraw After threshold is reached.",function(){
            beforeEach(async function() {
                let value = (new BN(300)).mul(onerewardpoint)
                // let PoolValue = await this.pool.getPoolValue(0);
                // let totalsupply = await this.itoken.totalSupply();
                // let totalPoolBalance = await this.pool.totalPoolbalance(0);
                // let getItoken = await this.pool.getItokenValue(totalsupply,PoolValue,value,totalPoolBalance)
                // let BBalance3 = await this.itoken.balanceOf(userAddress1);
                
                // console.log("Pool value"+ getItoken );
                // console.log("Before Balance 3",parseInt(BBalance3));
                await this.pool.poolIn([],[],0,{from:userAddress1,value:20000000000000000,gas: 8000000});
                await this.pool.withdraw(0,true,false,value,{from:userAddress1,gas: 8000000});
            });

            describe("Check Token Balance",function(){
                it("Pool should have  zero DAI balance",async function(){
                    expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                })
                it("Pool should Token 1 balance",async function(){
                    expect(await this.token1.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                })
                it("Pool should Token 2 balance",async function(){
                    expect(await this.token2.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                })
                it("User should have the DAI Token",async function(){
                    expect(await this.dai.balanceOf(userAddress1)).to.be.bignumber.equal((new BN(294)).mul(onerewardpoint));
                })
                
            }) 
            
        })
        describe("Rebalance in Pool",function(){
            beforeEach(async function() {
                await this.pool.poolIn([],[],0,{from:userAddress1,value:20000000000000000,gas: 8000000});
                let tokens = [this.token3.address,this.token4.address]
                let weight = [2,2];
                let rebal= 1;
                let threshold= 10;
                await this.Oracle.UpdatePoolConfiguration(tokens,weight,0,threshold,rebal,{from:ownerAddress,gas: 8000000})
                await this.pool.updatePool([],[],0,0, 0,{from:ownerAddress,gas: 8000000});
            });
            describe("Check Token Balance",function(){
                it("Pool should have  zero DAI balance",async function(){
                    expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                })
                it("Pool should Token 1 balance",async function(){
                    expect(await this.token1.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                })
                it("Pool should Token 2 balance",async function(){
                    expect(await this.token2.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                })
                it("Pool should zero Token 3 balance",async function(){
                    expect(await this.token3.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(450)).mul(onerewardpoint));
                })
                it("Pool should zero Token 4 balance",async function(){
                    expect(await this.token4.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(600)).mul(onerewardpoint));
                })
                // it("Total Pool balance",async function(){
                //     let totalPoolBalance = await this.pool.totalPoolbalance(0);
                //     let BBalance3 = await this.itoken.balanceOf(userAddress1);
                //     console.log("Pool balance ",parseInt(totalPoolBalance));
                //     console.log("User Itoken balance", parseInt(BBalance3));
                //     expect(await this.token4.balanceOf(this.pool.address)).to.be.bignumber.equal((new BN(588)).mul(onerewardpoint));
                // })
            })

            describe("Withdraw Pool",function(){
                beforeEach(async function() {
                    let value = (new BN(300)).mul(onerewardpoint)
                    await this.pool.withdraw(0,false,false,value,{from:userAddress1,gas: 8000000});
                });

                describe("Check Token Balance",function(){
                    it("Pool should have  zero DAI balance",async function(){
                        expect(await this.dai.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                    })
                    it("Pool should Token 1 balance",async function(){
                        expect(await this.token1.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                    })
                    it("Pool should Token 2 balance",async function(){
                        expect(await this.token2.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                    })
                    it("Pool should zero Token 3 balance",async function(){
                        expect(await this.token3.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                    })
                    it("Pool should zero Token 4 balance",async function(){
                        expect(await this.token4.balanceOf(this.pool.address)).to.be.bignumber.equal(new BN(0));
                    })
                    it("User should have the DAI Token",async function(){
                        expect(await this.dai.balanceOf(userAddress1)).to.be.bignumber.equal((new BN(294)).mul(onerewardpoint));
                    })
                    
                })                
            })
            
        })
    })

})