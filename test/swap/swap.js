const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;
const Universal = contract.fromArtifact('UniversalERC20');
const TestERC20 = contract.fromArtifact('TESTERC20');
const mockSwap = contract.fromArtifact('mockUniswap');
const swapContract = contract.fromArtifact('mockSwap');

const {
    encodeParameters
} = require('../../Util/Ethereum');

describe('Uniswap/Sushiswap', function () {
    const [ownerAddress, userAddress1, userAddress2, userAddress3, userAddress4, userAddress5, userAddress6] = accounts;
    beforeEach(async function () {
        this.universalLibrary = await Universal.new({from: ownerAddress, gas: 8000000 });
        await swapContract.detectNetwork();
        await swapContract.link('UniversalERC20',this.universalLibrary.address)
        this.dai = await TestERC20.new("Dai", "DAI", 18, {from: ownerAddress, gas: 8000000 });
        this.uni = await TestERC20.new("Uniswap", "UNI", 18, {from: ownerAddress, gas: 8000000 });
        this.bal = await TestERC20.new("Balancer", "BAL", 18, {from: ownerAddress, gas: 8000000});
        this.mockSwap = await mockSwap.new(this.dai.address, this.uni.address, this.bal.address, {from: ownerAddress, gas: 8000000});
        this.swap = await swapContract.new( {from: ownerAddress, gas: 8000000});
        this.swap.initialize(ownerAddress, this.mockSwap.address, this.mockSwap.address,this.mockSwap.address,this.mockSwap.address, {from: ownerAddress, gas: 8000000})

    });

    describe('Exchanges', function() {
        it("Should revert for the similar exchange", async function() {
            await expectRevert(this.swap.getBestExchangeRate(this.dai.address,this.dai.address,1000),"Both tokens are same");
        })
        it("Get amount with DAI/UNI exchange", async function() {
            await this.swap.getBestExchangeRate(this.dai.address,this.uni.address,1000);
            let data = await this.swap.swapResult();
            expect(data).to.be.bignumber.equal(new BN(1000));
        })
        it("Get Index with DAI/UNI exchange", async function() {
            await this.swap.getBestExchangeRate(this.dai.address,this.uni.address,1000);
            let data = await this.swap.swapResultIndex();
            expect(data).to.be.bignumber.equal(new BN(1));
        })
        it("Get best amount from uniswap version 3", async function() {
            await this.dai.transfer(this.mockSwap.address,3000,{from:ownerAddress})
            await this.swap.getBestExchangeRate(this.dai.address,this.uni.address,1000);
            let data = await this.swap.swapResult();
            expect(data).to.be.bignumber.equal(new BN(2000));
        })
        it("Get Index of uniswap version 3", async function() {
            await this.dai.transfer(this.mockSwap.address,3000,{from:ownerAddress})
            await this.swap.getBestExchangeRate(this.dai.address,this.uni.address,1000);
            let data = await this.swap.swapResultIndex();
            expect(data).to.be.bignumber.equal(new BN(3));
        })

        it("Should revert in case pair don't exist", async function() {
            await expectRevert(this.swap.getBestExchangeRate(ownerAddress,userAddress1,1000),"Pair doesn't exist");

        })
        it("Should revert if user try to swap tokens after no liquidity", async function() {
            await expectRevert(this.swap.swapFromBestExchange(this.dai.address,this.dai.address,1000,1000,0),"Not enough liquidity in available swaps");
        })

        it("Should revert if user try to swap tokens from not listed exchange", async function() {
            await expectRevert(this.swap.swapFromBestExchange(this.dai.address,this.dai.address,1000,1000,4),"No more swaps available");
        })


    });

})
