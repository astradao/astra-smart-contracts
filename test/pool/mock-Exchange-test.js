const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;
const Astrsample = contract.fromArtifact('Token');
const Timelock = contract.fromArtifact('Timelock');
const Governance = contract.fromArtifact('GovernorAlpha');
const TransferHandler = contract.fromArtifact('MockTransferHandler');
// const TopHolders = contract.fromArtifact('MockTopHolder');
const TestERC20 = contract.fromArtifact('TESTERC20');
const MocKExchange = contract.fromArtifact('MockExchane');
const decimal = new BN(18);
const oneether = (new BN(10)).pow(decimal);
const totalSupply = (new BN(100000)).mul(oneether)
const ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";


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
        this.dai = await TestERC20.new("Dai", "ASTR",18, {from: ownerAddress, gas: 8000000});
        this.astra = await TestERC20.new("Astra", "ASTR",18, {from: ownerAddress, gas: 8000000});
        this.token1 = await TestERC20.new("Token 1", "TOKEN1",18, {from: ownerAddress, gas: 8000000});
        this.token2 = await TestERC20.new("Token 2", "TOKEN2",18, {from: ownerAddress, gas: 8000000});
        this.token3 = await TestERC20.new("Token 3", "TOKEN3",18, {from: ownerAddress, gas: 8000000});
        this.token4 = await TestERC20.new("Token 4", "TOKEN4",18, {from: ownerAddress, gas: 8000000});
        this.mockexchange = await MocKExchange.new(this.token1.address,this.token2.address,this.token3.address,this.token4.address,this.dai.address,this.astra.address,{from:ownerAddress,gas: 8000000});
    });

    describe("Test cases for Mock Exchange test",function(){
        it("Buy rate with Ether/DAI",async function(){
            let data = await this.mockexchange.getExpectedReturn(ETH_ADDRESS,this.dai.address,1000,0,0);
            expect(data[0]).to.be.bignumber.equal(new BN(1000));
        });
        it("Buy rate with first Token",async function(){
            let data = await this.mockexchange.getExpectedReturn(this.dai.address,this.token1.address,1000,0,0);
            expect(data[0]).to.be.bignumber.equal(new BN(1000));
        });
        it("Buy rate with second Token",async function(){
            let data = await this.mockexchange.getExpectedReturn(this.dai.address,this.token2.address,1000,0,0);
            expect(data[0]).to.be.bignumber.equal(new BN(2000));
        });
        it("Buy rate with third Token",async function(){
            let data = await this.mockexchange.getExpectedReturn(this.dai.address,this.token3.address,1000,0,0);
            expect(data[0]).to.be.bignumber.equal(new BN(3000));
        });
        it("Buy rate with fourth Token",async function(){
            let data = await this.mockexchange.getExpectedReturn(this.dai.address,this.token4.address,1000,0,0);
            expect(data[0]).to.be.bignumber.equal(new BN(4000));
        });
        it("Sell rate with first Token",async function(){
            let data = await this.mockexchange.getExpectedReturn(this.token1.address,this.dai.address,1000,0,0);
            expect(data[0]).to.be.bignumber.equal(new BN(1000));
        });
        it("Sell rate with second Token",async function(){
            let data = await this.mockexchange.getExpectedReturn(this.token2.address,this.dai.address,2000,0,0);
            expect(data[0]).to.be.bignumber.equal(new BN(1000));
        });
        it("Sell rate with Third Token",async function(){
            let data = await this.mockexchange.getExpectedReturn(this.token3.address,this.dai.address,3000,0,0);
            expect(data[0]).to.be.bignumber.equal(new BN(1000));
        });
        it("Sell rate with Fourth Token",async function(){
            let data = await this.mockexchange.getExpectedReturn(this.token4.address,this.dai.address,4000,0,0);
            expect(data[0]).to.be.bignumber.equal(new BN(1000));
        });
    })

    describe("Buy/Sell funcitonality for Mock contract",function() {
        beforeEach(async function() {
            await this.dai.transfer(this.mockexchange.address,1000000,{from: ownerAddress, gas: 8000000});
            await this.token1.transfer(this.mockexchange.address,1000000,{from: ownerAddress, gas: 8000000});
            await this.token2.transfer(this.mockexchange.address,1000000,{from: ownerAddress, gas: 8000000});
            await this.token3.transfer(this.mockexchange.address,1000000,{from: ownerAddress, gas: 8000000});
            await this.token4.transfer(this.mockexchange.address,1000000,{from: ownerAddress, gas: 8000000});
        });  
        
        describe("Buy DAI Token",function() {
            beforeEach(async function() {
                await this.mockexchange.swap(ETH_ADDRESS,this.dai.address, 1000,1000,[],0,{from: userAddress1,value:100, gas: 8000000});    
            });        
            it("Successful",async function(){
                // let data = await this.mockexchange.getExpectedReturn(this.dai.address,this.token1.address,1000,0,0);
                expect(await this.dai.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(1000));
            });
        })
        describe("Buy first Token",function() {
            beforeEach(async function() {
                await this.dai.transfer(userAddress1,1000,{from: ownerAddress, gas: 8000000});
                await this.dai.approve(this.mockexchange.address,1000,{from: userAddress1, gas: 8000000});
                await this.mockexchange.swap(this.dai.address,this.token1.address, 1000,1000,[],0,{from: userAddress1, gas: 8000000});    
            });        
            it("Successful",async function(){
                // let data = await this.mockexchange.getExpectedReturn(this.dai.address,this.token1.address,1000,0,0);
                expect(await this.token1.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(1000));
            });
        })
        describe("Buy Second Token",function() {
            beforeEach(async function() {
                await this.dai.transfer(userAddress1,1000,{from: ownerAddress, gas: 8000000});
                await this.dai.approve(this.mockexchange.address,1000,{from: userAddress1, gas: 8000000});
                await this.mockexchange.swap(this.dai.address,this.token2.address, 1000,1000,[],0,{from: userAddress1, gas: 8000000});    
            });        
            it("Successful",async function(){
                // let data = await this.mockexchange.getExpectedReturn(this.dai.address,this.token1.address,1000,0,0);
                expect(await this.token2.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(2000));
            });
        })
        describe("Buy third Token",function() {
            beforeEach(async function() {
                await this.dai.transfer(userAddress1,1000,{from: ownerAddress, gas: 8000000});
                await this.dai.approve(this.mockexchange.address,1000,{from: userAddress1, gas: 8000000});
                await this.mockexchange.swap(this.dai.address,this.token3.address, 1000,1000,[],0,{from: userAddress1, gas: 8000000});    
            });        
            it("Successful",async function(){
                let data =await this.dai.balanceOf(userAddress1);
                console.log(" Check if token Dai token is transfered",data.toString());
                expect(await this.token3.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(3000));
            });
        })
        describe("Buy fourth Token",function() {
            beforeEach(async function() {
                await this.dai.transfer(userAddress1,1000,{from: ownerAddress, gas: 8000000});
                await this.dai.approve(this.mockexchange.address,1000,{from: userAddress1, gas: 8000000});
                await this.mockexchange.swap(this.dai.address,this.token4.address, 1000,1000,[],0,{from: userAddress1, gas: 8000000});    
            });        
            it("Successful",async function(){
                // let data = await this.mockexchange.getExpectedReturn(this.dai.address,this.token1.address,1000,0,0);
                expect(await this.token4.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(4000));
            });
        })
    })

})