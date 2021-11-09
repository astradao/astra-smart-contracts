const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');
const { increase } = require('@openzeppelin/test-helpers/src/time');
const { default: BigNumber } = require('bignumber.js');
const Handler = contract.fromArtifact('TransferHandler');
const WETH9 = contract.fromArtifact('WETH9');
const UniswapV2Pair = contract.fromArtifact('UniswapV2Pair');
const UniswapV2Factory = contract.fromArtifact('UniswapV2Factory');
const UniswapV2Router02 = contract.fromArtifact('UniswapV2Router02');
const Astrsample = contract.fromArtifact('Token');
const TestAstrSample = contract.fromArtifact('TESTERC20');
const MasterChef = contract.fromArtifact('MasterChef');

const zeroaddress = "0x0000000000000000000000000000000000000000";
const decimal = new BN(18);
const oneether = (new BN(10)).pow(decimal);

describe('TransferHandler', function () {
    const [ownerAddress, userAddress1, userAddress2, userAddress3] = accounts;

    beforeEach(async function () {
        this.astra = await Astrsample.new({ from: ownerAddress, gas: 8000000 });
        await this.astra.initialize(ownerAddress, { from: ownerAddress });
        this.factory = await UniswapV2Factory.new(ownerAddress, { from: ownerAddress });
        this.weth = await WETH9.new({ from: ownerAddress });
        await this.weth.deposit({ from: ownerAddress, value: '1000000000000000' })
        this.router = await UniswapV2Router02.new(this.factory.address, this.weth.address, { from: ownerAddress });
        this.handler = await Handler.new(this.astra.address, this.router.address, { from: ownerAddress, gas: 8000000 });
        this.chef = await MasterChef.new({ from: ownerAddress, gas: 8000000 });
        await this.chef.initialize(this.astra.address, ownerAddress, "1000", "0", "100", { from: ownerAddress, gas: 8000000 });
        await this.astra.setTransferHandler(this.handler.address, { from: ownerAddress, gas: 8000000 });
    });


    describe('Initialization values', function () {
        it('uni and hadler pair must same', async function () {
            this.uniWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.weth.address, this.astra.address));
            const pair = await this.handler.tokenUniswapPairASTR();
            expect(this.uniWETHPair.address).to.be.equal(pair);
        });

        it('uni pair must present in trackedPair', async function () {
            this.handlerPair = await this.handler.tokenUniswapPairASTR();
            const status = await this.handler.isPair(this.handlerPair);
            expect(status).to.be.equal(true);
        });

        it('false for wrong pair in trackedPair', async function () {
            const status = await this.handler.isPair(userAddress1);
            expect(status).to.be.equal(false);
        });

        it('wethAddress Address', async function () {
            const weth = await this.handler.wethAddress();
            expect(weth).to.be.equal(this.weth.address);
        });

        it('master chef address will be 0', async function () {
            const chef = await this.handler.MasterChef();
            expect(chef).to.be.equal(zeroaddress);
        });

        it('bonusEndBlock will be 0', async function () {
            const bonusEndBlock = await this.handler.getBonusEndBlock();
            expect(bonusEndBlock).to.be.bignumber.equal(new BN(0));
        });
    });

    describe('addPairToTrack', function () {
        beforeEach(async function () {
            this.testastra = await TestAstrSample.new("TestAstra", "TASTR",18, { from: userAddress1, gas: 8000000 });
        });

        it('Failed when add pair more than one time', async function () {
            const pair = await this.handler.tokenUniswapPairASTR();
            await expectRevert(this.handler.addPairToTrack(pair, { from: ownerAddress }), 'Pair already tracked');
        });

        it('Without Owner', async function () {
            await expectRevert(this.handler.addPairToTrack(userAddress1, { from: userAddress1 }), 'Ownable: caller is not the owner');
        });

        it('With Owner', async function () {
            await this.factory.createPair(this.testastra.address, this.weth.address, { from: ownerAddress });
            this.uniTestWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.weth.address, this.testastra.address));

            await this.handler.addPairToTrack(this.uniTestWETHPair.address, { from: ownerAddress });
            const newPairStatus = await this.handler.isPair(this.uniTestWETHPair.address);
            expect(newPairStatus).to.be.equal(true);

            this.handlerPair = await this.handler.tokenUniswapPairASTR();
            const status = await this.handler.isPair(this.handlerPair);
            expect(status).to.be.equal(true);
        });
    });

    describe('setMasterChefAddress', function () {
        it('Without Owner', async function () {
            await expectRevert(this.handler.setMasterChefAddress(this.chef.address, { from: userAddress1 }), 'Ownable: caller is not the owner');
        });

        it('With Owner', async function () {
            await this.handler.setMasterChefAddress(this.chef.address, { from: ownerAddress });
            const chef = await this.handler.MasterChef();
            expect(chef).to.be.equal(this.chef.address);
        });

        it('bonusEndBlock Owner', async function () {
            await this.handler.setMasterChefAddress(this.chef.address, { from: ownerAddress });
            const bonusEndBlock = await this.handler.getBonusEndBlock();
            expect(bonusEndBlock).to.be.bignumber.equal(new BN(100));
        });
    });

    describe('createUniswapPairMainnet', function () {
        beforeEach(async function () {
            this.testastra = await TestAstrSample.new("TestAstra", "TASTR",18, { from: userAddress1, gas: 8000000 });
        });

        it('Without Owner', async function () {
            await expectRevert(this.handler.createUniswapPairMainnet(this.testastra.address, { from: userAddress1 }), 'Ownable: caller is not the owner');
        });

        it('Pair already create', async function () {
            this.handlerPair = await this.handler.tokenUniswapPairASTR();
            await expectRevert(this.handler.createUniswapPairMainnet(this.testastra.address, { from: ownerAddress }), 'Token: pool already created');
        });
    });

    describe('able to transfer Astra token for other address', function () {
        beforeEach(async function () {
            this.testastra = await TestAstrSample.new("TestAstra", "TASTR",18, { from: ownerAddress, gas: 8000000 });
            
            await this.factory.createPair(this.astra.address, this.testastra.address, { from: ownerAddress });

            this.uniTestWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.testastra.address, this.astra.address));
            await this.handler.setMasterChefAddress(this.chef.address, { from: ownerAddress });

            await this.uniTestWETHPair.approve(this.router.address, 1000000000, { from: ownerAddress, gas: 8000000 });
        });

        it('Transfer ASTR Owner to userAddress1', async function () {
            await this.astra.transfer(userAddress1, 100, { from: ownerAddress });
            const bal = await this.astra.balanceOf(userAddress1);
            expect(bal).to.be.bignumber.equal(new BN(100));
        });

        it('Transfer ASTR userAddress1 to owner', async function () {
            const initialAmountOfOwnerAddress = await this.astra.balanceOf(ownerAddress);

            await this.astra.transfer(userAddress1, 100, { from: ownerAddress });
            await this.astra.transfer(ownerAddress, 100, { from: userAddress1 });

            const bal = await this.astra.balanceOf(ownerAddress);
            expect(bal).to.be.bignumber.equal(new BN(initialAmountOfOwnerAddress));
        });

        it('Add liquidity for other Pair', async function () {
            const eta = Date.now();
            await this.astra.approve(this.router.address, 1000000000, { from: ownerAddress, gas: 8000000 });
            await this.testastra.approve(this.router.address, 1000000000, { from: ownerAddress, gas: 8000000 });

            await this.router.addLiquidity(this.astra.address, this.testastra.address, 10000, 10000, 9500, 9500, ownerAddress, eta, { from: ownerAddress, gas: 8000000 });
            await this.handler.sync();

            this.uniWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.astra.address, this.testastra.address));
            const liqbal = await this.uniWETHPair.balanceOf(ownerAddress);
            expect(liqbal > 0).to.be.equal(true);;
        });

        it('Remove liquidity for other Pair(before bonus End Block)', async function () {
            const eta = Date.now();
            await this.astra.approve(this.router.address, 1000000000, { from: ownerAddress, gas: 8000000 });
            await this.testastra.approve(this.router.address, 1000000000, { from: ownerAddress, gas: 8000000 });

            await this.router.addLiquidity(this.astra.address, this.testastra.address, 10000, 10000, 9500, 9500, ownerAddress, eta, { from: ownerAddress, gas: 8000000 });
            await this.handler.sync();

            const beforeliqbal = await this.uniTestWETHPair.balanceOf(ownerAddress);

            await this.router.removeLiquidity(this.testastra.address, this.astra.address, 100, 0, 0, ownerAddress, eta,  { from: ownerAddress });

            const afterliqbal = await this.uniTestWETHPair.balanceOf(ownerAddress);

            const removeliq = parseInt(beforeliqbal) - parseInt(afterliqbal); 
            expect(new BN(removeliq)).to.be.bignumber.equal(new BN(100));
        });

        it('Remove liquidity for other Pair(after bonus End Block)', async function () {
            const block = await time.latestBlock();
            await time.advanceBlockTo(block);
            const eta = Date.now();
            await this.astra.approve(this.router.address, 1000000000, { from: ownerAddress, gas: 8000000 });
            await this.testastra.approve(this.router.address, 1000000000, { from: ownerAddress, gas: 8000000 });

            await this.router.addLiquidity(this.astra.address, this.testastra.address, 10000, 10000, 9500, 9500, ownerAddress, eta, { from: ownerAddress, gas: 8000000 });
            await this.handler.sync();

            const beforeliqbal = await this.uniTestWETHPair.balanceOf(ownerAddress);

            await this.router.removeLiquidity(this.testastra.address, this.astra.address, 100, 0, 0, ownerAddress, eta,  { from: ownerAddress });

            const afterliqbal = await this.uniTestWETHPair.balanceOf(ownerAddress);

            const removeliq = parseInt(beforeliqbal) - parseInt(afterliqbal); 
            expect(new BN(removeliq)).to.be.bignumber.equal(new BN(100));
        });
    });

    describe('varifyTransferApproval', function () {
        beforeEach(async function () {
            const eta = Date.now();
            await this.astra.approve(this.router.address, 1000000000, { from: ownerAddress, gas: 8000000 });
            await this.weth.approve(this.router.address, 1000000000, { from: ownerAddress, gas: 8000000 });
            
            this.testchef = await MasterChef.new({ from: ownerAddress, gas: 8000000 });
            await this.testchef.initialize(this.astra.address, ownerAddress, "1000", "200", "300", { from: ownerAddress, gas: 8000000 });
            await this.handler.setMasterChefAddress(this.testchef.address, { from: ownerAddress });

            await this.router.addLiquidityETH(this.astra.address, 10000, 9500, 9500, ownerAddress, eta, { from: ownerAddress, value: 10000, gas: 8000000 });
            await this.handler.sync();

            this.uniWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.weth.address, this.astra.address));
            await this.uniWETHPair.approve(this.router.address, 1000000000, { from: ownerAddress, gas: 8000000 });
        });

        it('increase liquidity of owner', async function () {
            this.uniWETHPair = await UniswapV2Pair.at(await this.factory.getPair(this.weth.address, this.astra.address));
            const liqbal = await this.uniWETHPair.balanceOf(ownerAddress);
            expect(liqbal > 0).to.be.equal(true);
        }); 

        it('can not remove liquidity before bonusEndBlock', async function () {
            const eta = Date.now();
            await expectRevert(this.router.removeLiquidityETH(this.astra.address, 100, 0, 0, ownerAddress, eta,  { from: ownerAddress }), "UniswapV2: TRANSFER_FAILED");

            const block = await time.latestBlock();
            await time.advanceBlockTo(parseInt(block) + 20);
            await expectRevert(this.router.removeLiquidityETH(this.astra.address, 100, 0, 0, ownerAddress, eta,  { from: ownerAddress }), "UniswapV2: TRANSFER_FAILED");
        });

        it('can remove liquidity after bonusEndBlock', async function () {
            const block = await time.latestBlock();
            if (parseInt(block) > 300)
                await time.advanceBlockTo(parseInt(block));
            else 
                await time.advanceBlockTo(parseInt(301));
            const eta = Date.now();

            const beforeliqbal = await this.uniWETHPair.balanceOf(ownerAddress);

            await this.router.removeLiquidityETH(this.astra.address, 100, 0, 0, ownerAddress, eta,  { from: ownerAddress });

            const afterliqbal = await this.uniWETHPair.balanceOf(ownerAddress);

            const removeliq = parseInt(beforeliqbal) - parseInt(afterliqbal); 
            expect(new BN(removeliq)).to.be.bignumber.equal(new BN(100));
        });        
    });
});