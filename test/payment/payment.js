const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;

const Astrsample = contract.fromArtifact('Token');
const TestERC20 = contract.fromArtifact('TESTERC20');
const MocKExchange = contract.fromArtifact('MockExchangeUniswap');

const Payment = contract.fromArtifact('IndicesPayment');
const PoolConfiguration  =  contract.fromArtifact('PoolConfiguration');


const {
    address,
    minerStart,
    minerStop,
    unlockedAccount,
    mineBlock
} = require('../../Util/Ethereum');
const EIP712 = require('../../Util/EIP712');

const zeroaddress = "0x0000000000000000000000000000000000000000";
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const decimal = new BN(18);
const oneether = (new BN(10)).pow(decimal);
const totalSupply = (new BN(1000)).mul(oneether)
const totalSupplyusdt = (new BN(1000)).mul((new BN(10)).pow((new BN(6))))
const totalSupplyusdc = (new BN(1000)).mul((new BN(10)).pow((new BN(24))))

describe('Initializing', function () {
    const [ ownerAddress, userAddress1, userAddress2, userAddress3 ] = accounts;
    beforeEach(async function() {
        this.astra = await Astrsample.new({ from: ownerAddress, gas: 8000000 });
        await this.astra.initialize(ownerAddress, { from: ownerAddress });
        this.dai = await TestERC20.new("Dai", "ASTR",18, {from: ownerAddress, gas: 8000000});
        this.usdt = await TestERC20.new("USDT", "USDT",6, {from: ownerAddress, gas: 8000000});
        this.usdc = await TestERC20.new("USDC", "USDC",24, {from: ownerAddress, gas: 8000000});
        this.weth = await TestERC20.new("Weth", "WETH",18, {from: ownerAddress, gas: 8000000});
        this.token1 = await TestERC20.new("Token 1", "TOKEN1",18, {from: ownerAddress, gas: 8000000});
        this.token2 = await TestERC20.new("Token 2", "TOKEN2",18, {from: ownerAddress, gas: 8000000});
        this.token3 = await TestERC20.new("Token 3", "TOKEN3",18, {from: ownerAddress, gas: 8000000});
        this.token4 = await TestERC20.new("Token 4", "TOKEN4",18, {from: ownerAddress, gas: 8000000});
        this.mockexchange = await MocKExchange.new(this.token1.address,this.token2.address,this.token3.address,this.token4.address,this.dai.address,this.astra.address,{from:ownerAddress,gas: 8000000});
        this.poolconfiguration = await PoolConfiguration.new({from: ownerAddress,gas: 8000000})
        this.poolconfiguration.initialize(this.astra.address,{from: ownerAddress, gas: 8000000})
        this.payment = await Payment.new({from: ownerAddress, gas: 8000000});
        await this.payment.initialize(this.astra.address,this.poolconfiguration.address,this.mockexchange.address,userAddress3,{from:ownerAddress,gas: 8000000});
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
        describe("Set amount",function(){
            it("Set amount with non owner address",async function(){
                await expectRevert(this.payment.setAstraAmount(500,{from:userAddress1}),"Ownable: caller is not the owner");
            })
            it("Set amount by owner",async function(){
                // setAstraAmount
                await this.payment.setAstraAmount(500,{from:ownerAddress})
                expect(await this.payment.astraAmount()).to.be.bignumber.equal(new BN(500));
            })  
        })
        describe("Set Treasury",function(){
            it("Set Address with non owner address",async function(){
                await expectRevert(this.payment.setTreasury(userAddress1,{from:userAddress1}),"Ownable: caller is not the owner");
            })
            it("Set Treasury by owner",async function(){
                await this.payment.setTreasury(userAddress1,{from:ownerAddress})
                expect(await this.payment.treasury()).to.be.equal(userAddress1);
            })  
        })
        describe("Pay in Astra",function(){
            it("Should Revert if user try to pay less than 500", async function () {
                await expectRevert(this.payment.deposit(this.astra.address,500,{from:userAddress1}),"Not enough amount");
            });
            it("Should revert if user dont have balance", async function () {
                await expectRevert(this.payment.deposit(this.astra.address,(new BN(600)).mul(oneether),{from:userAddress1}),"Not enough balance");
            });
            it("Deposit", async function () {
                await this.astra.approve(this.payment.address,totalSupply,{from:ownerAddress})
                await this.payment.deposit(this.astra.address,(new BN(600)).mul(oneether),{from:ownerAddress});
                expect(await this.payment.depositedAmount(ownerAddress)).to.be.bignumber.equal((new BN(600)).mul(oneether));
            });
        }) 

        describe("Pay in Ether",function(){
            it("Should revert if user try to withdraw", async function () {
                await expectRevert(this.payment.deposit(ETH_ADDRESS,0,{value:20000000000000000,from:userAddress1}),"Not enough amount");
            });  
            it("Deposit", async function () {
                await this.payment.setAstraAmount(500000,{from:ownerAddress})
                await this.payment.deposit(ETH_ADDRESS,0,{value:500000,from:userAddress1})
                expect(await this.payment.depositedAmount(userAddress1)).to.be.bignumber.equal(new BN(500000));
            });
        })

        describe("Pay in Stable coin",function(){
            it("Should Revert if user try to pay less than 500", async function () {
                await this.poolconfiguration.whitelistDAOaddress(ownerAddress,{from:ownerAddress})
                await this.poolconfiguration.addStable(this.dai.address,{from:ownerAddress})
                await this.dai.approve(this.payment.address,totalSupply,{from:ownerAddress})
                await expectRevert(this.payment.deposit(this.dai.address,500,{from:ownerAddress}),"Not enough amount");
            });
            it("Should revert if user try to withdraw", async function () {
                await this.poolconfiguration.whitelistDAOaddress(ownerAddress,{from:ownerAddress})
                await this.poolconfiguration.addStable(this.dai.address,{from:ownerAddress})
                await expectRevert(this.payment.deposit(this.dai.address,(new BN(600)).mul(oneether),{from:userAddress1}),"Not enough balance");
            });
            it("Deposit", async function () {
                await this.poolconfiguration.whitelistDAOaddress(ownerAddress,{from:ownerAddress})
                await this.poolconfiguration.addStable(this.dai.address,{from:ownerAddress})
                await this.dai.approve(this.payment.address,totalSupply,{from:ownerAddress})
                await this.payment.deposit(this.dai.address,(new BN(600)).mul(oneether),{from:ownerAddress});
                expect(await this.payment.depositedAmount(ownerAddress)).to.be.bignumber.equal((new BN(600)).mul(oneether));
            });
        })
    })
})