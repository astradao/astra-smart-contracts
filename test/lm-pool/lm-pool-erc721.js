const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;
const LmPool = contract.fromArtifact('LmPoolV3');
const TestERC20 = contract.fromArtifact('TESTERC20');
const TestERC721 = contract.fromArtifact('sampleNFTToken')
const Chef = contract.fromArtifact('MasterChef');

const {
    encodeParameters
} = require('../../Util/Ethereum');

describe('LmPool', function () {
    const [ownerAddress, userAddress1, userAddress2, userAddress3, userAddress4, userAddress5, userAddress6] = accounts;
    beforeEach(async function () {
        this.astra = await TestERC20.new("Astra", "ASTR",18, { from: ownerAddress, gas: 8000000 });
        this.usdc = await TestERC20.new("UsdCoin", "USDC",18, { from: ownerAddress, gas: 8000000 });
        this.dai = await TestERC20.new("Dai Stablecoin", "DAI",18, { from: ownerAddress, gas: 8000000 });
        this.chef = await Chef.new({ from: ownerAddress, gas: 8000000 });
        this.erc721 = await TestERC721.new({ from: ownerAddress, gas: 8000000 });
        await this.chef.initialize(this.astra.address, "10000", "0", "10000", { from: ownerAddress, gas: 8000000 });
        this.lmpool = await LmPool.new({ from: ownerAddress, gas: 8000000 });
        await this.lmpool.initialize(this.astra.address, "10000", "0", "10000", { from: ownerAddress, gas: 8000000 });
        await this.lmpool.setChefAddress(this.chef.address, { from: ownerAddress })
    });

    describe('set/update variables', function () {
        it("should set correct state variables", async function () {
            const astr = await this.lmpool.ASTR();
            expect(astr).to.equal(this.astra.address);
        })

        it("Should only add upto the limit", async function () {
            await this.erc721.setTokens(this.dai.address,this.usdc.address);
            await this.chef.setLmPoolAddress(this.lmpool.address, true, { from: ownerAddress });
            await this.chef.updateMaximumPool(2, { from: ownerAddress });
            await this.lmpool.add(this.erc721.address,this.dai.address, this.usdc.address,3000, { from: ownerAddress })
            await this.lmpool.add(this.erc721.address,this.dai.address, this.usdc.address,3000, { from: ownerAddress })
            expectRevert(this.lmpool.add(this.erc721.address,this.dai.address, this.usdc.address,3000, { from: ownerAddress }), "Maximum pool limit reached")
        });

        it("set lm pool address in chef contract", async function () {
            await expectRevert(this.chef.setLmPoolAddress(userAddress1, true, { from: userAddress1 }), "Ownable: caller is not the owner")
            await this.chef.setLmPoolAddress(this.lmpool.address, true, { from: ownerAddress });
            expect(await this.chef.lmpooladdr(this.lmpool.address)).to.equal(true)
        })

        it("call initialize method multiple await time", async function () {
            this.lmpool = await LmPool.new({ from: ownerAddress, gas: 8000000 });
            await this.lmpool.initialize(this.astra.address, "100", "700", "1000", { from: ownerAddress, gas: 8000000 });
            await expectRevert(this.lmpool.initialize(this.astra.address, "100", "700", "1000", { from: ownerAddress, gas: 8000000 }), "Initializable: contract is already initialized");
        })

        it("owner should call add vault method", async function () {
            await expectRevert(this.lmpool.addVault('3', { from: userAddress1, gas: 8000000 }), "Ownable: caller is not the owner");
            await this.lmpool.addVault('3', { from: ownerAddress, gas: 8000000 })
            await this.lmpool.addVault('12', { from: ownerAddress, gas: 8000000 })
        })

        it("transfer ownership", async function () {
            await expectRevert(this.lmpool.transferOwnership(userAddress1, { from: userAddress1, gas: 8000000 }), "Ownable: caller is not the owner");
            await this.lmpool.transferOwnership(userAddress1, { from: ownerAddress, gas: 8000000 });
            expect(await this.lmpool.owner()).to.equal(userAddress1)
            await expectRevert(this.lmpool.addVault(5, { from: ownerAddress }), "Ownable: caller is not the owner")
        });
    });

    describe('deposit/stake the lptoken amount', function () {
        beforeEach(async function () {
            await this.chef.setLmPoolAddress(this.lmpool.address, true, { from: ownerAddress });
            await this.erc721.setTokens(this.dai.address,this.usdc.address);
            await this.lmpool.add(this.erc721.address,this.dai.address, this.usdc.address,3000, { from: ownerAddress })
            await this.lmpool.add(this.erc721.address,this.dai.address,this.astra.address,3000, { from: ownerAddress })
            await this.lmpool.addVault('3', { from: ownerAddress, gas: 8000000 })
            await this.lmpool.addVault('12', { from: ownerAddress, gas: 8000000 })
            
        })

        it("user should approve the spend limit and have the sufficient balance of lptoken", async function () {
            await this.erc721.safeMint(userAddress1,1);
            await this.erc721.setReturnValue(100000);
            expectRevert(this.lmpool.deposit('0', 1, '3', { from: userAddress1, gas: 8000000 }), "ERC721: transfer caller is not owner nor approved");
            await this.erc721.approve(this.lmpool.address, 1, { from: userAddress1 })
            await this.lmpool.deposit('0', 1, '3', { from: userAddress1, gas: 8000000 })
            expect(await this.erc721.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN(1));
            expect((await this.lmpool.userInfo(0,userAddress1))[0]).to.be.bignumber.equal(new BN(100000));
        })

        it("user should choose the valid vault which is create by owner", async function () {
            await this.erc721.safeMint(userAddress1,1);
            await this.erc721.setReturnValue(100000);
            await this.erc721.approve(this.lmpool.address, 1, { from: userAddress1 })
            expectRevert(this.lmpool.deposit('0', 1, '0', { from: userAddress1, gas: 8000000 }), "no vault");
            await this.lmpool.addVault('0', { from: ownerAddress, gas: 8000000 })
            expect(await this.lmpool.deposit('0', 1, '0', { from: userAddress1, gas: 8000000 }));
            expect(await this.erc721.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN(1));
            expect((await this.lmpool.userInfo(0,userAddress1))[0]).to.be.bignumber.equal(new BN(100000));
        })
    });

    describe('withdraw the lptoken amount', function () {
        beforeEach(async function () {
            await this.chef.setLmPoolAddress(this.lmpool.address, true, { from: ownerAddress });
            await this.erc721.setTokens(this.dai.address,this.usdc.address);
            await this.lmpool.add(this.erc721.address,this.dai.address, this.usdc.address,3000, { from: ownerAddress })
            await this.lmpool.add(this.erc721.address,this.dai.address,this.astra.address,3000, { from: ownerAddress })
            await this.lmpool.addVault(0, { from: ownerAddress, gas: 8000000 })
            await this.lmpool.addVault(3, { from: ownerAddress, gas: 8000000 })
            await this.lmpool.addVault(6, { from: ownerAddress, gas: 8000000 })
            await this.lmpool.addVault(9, { from: ownerAddress, gas: 8000000 })
            await this.lmpool.addVault(12, { from: ownerAddress, gas: 8000000 })
            await this.usdc.transfer(userAddress1, 1000000000, { from: ownerAddress })
            await this.erc721.safeMint(userAddress1,1);
            await this.erc721.setReturnValue(100);
            await this.erc721.approve(this.lmpool.address, 1, { from: userAddress1 })
            
        })

        it("Cooldown period", async function () {

            await this.lmpool.deposit(0, 1, 3, { from: userAddress1 })
            await time.increase(86400 * 30 * 3)
            this.lmpool.withdraw(0, false, { from: userAddress1 })
            await expectRevert(this.lmpool.withdraw(0, false, { from: userAddress1 }), "withdraw: cooldown period")
            await time.increase(86400 * 7)
            await this.astra.transfer(this.lmpool.address, 100000, { from: ownerAddress });
            expect((await this.lmpool.userInfo(0,userAddress1))[0]).to.be.bignumber.equal(new BN(100));
            expect((await this.lmpool.poolInfo(0))[5]).to.be.bignumber.equal(new BN(100));
            await this.lmpool.withdraw(0, false, { from: userAddress1 })
            expect(await this.erc721.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(1))
            expect((await this.lmpool.userInfo(0,userAddress1))[0]).to.be.bignumber.equal(new BN(0));
            expect((await this.lmpool.poolInfo(0))[5]).to.be.bignumber.equal(new BN(0));
            
        })

        it("withdraw on open window period ", async function () {

            await this.lmpool.deposit(0, 1, 3, { from: userAddress1 })
            // after 90 days
            await time.increase(86400 * 30 * 3)
            await this.lmpool.withdraw(0, false, { from: userAddress1 })
            //await time after 7 DAYS
            await time.increase(86400 * 7)
            await this.astra.transfer(this.lmpool.address, 100000, { from: ownerAddress });
            expect((await this.lmpool.poolInfo(0)).totalAmount).to.be.bignumber.equal(new BN(100))
            await this.lmpool.withdraw(0, false, { from: userAddress1 })
            expect((await this.lmpool.poolInfo(0)).totalAmount).to.be.bignumber.equal(new BN(0))
            expect(await this.erc721.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(1))

        })

        it("withdraw after open window period over", async function () {

            await this.lmpool.deposit(0, 1, 3, { from: userAddress1 })
            // after 90 days
            await time.increase(86400 * 30 * 3)
            await this.lmpool.withdraw(0, false, { from: userAddress1 })
            //on second attempt after open window period over
            //await time after 8 DAYS
            await time.increase(691202)
            await this.astra.transfer(this.lmpool.address, "100000", { from: ownerAddress });
            //now cooldown period is reset
            await this.lmpool.withdraw(0, false, { from: userAddress1 })
            expect(await this.erc721.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(0))
        })

        it("eligible amount to withdraw from multiple vaults 0, 6 and 9", async function () {
            await this.lmpool.deposit(0, "1", "0", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,2);
            await this.erc721.setReturnValue(400);
            await this.erc721.approve(this.lmpool.address, 2, { from: userAddress1 })
            await this.lmpool.deposit(0, 2, "6", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,3);
            await this.erc721.setReturnValue(500);
            await this.erc721.approve(this.lmpool.address, 3, { from: userAddress1 })
            await this.lmpool.deposit(0, "3", "9", { from: userAddress1 })
            expect((await this.lmpool.poolInfo(0))[5]).to.be.bignumber.equal(new BN(1000))
            expect(await this.lmpool.viewEligibleAmount(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(100))
        })

        it("eligible amount to withdraw from multiple vaults 0, 6 and 9 after 6 months", async function () {
            await this.lmpool.deposit(0, "1", "0", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,2);
            await this.erc721.setReturnValue(400);
            await this.erc721.approve(this.lmpool.address, 2, { from: userAddress1 })
            await this.lmpool.deposit(0, 2, "6", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,3);
            await this.erc721.setReturnValue(500);
            await this.erc721.approve(this.lmpool.address, 3, { from: userAddress1 })
            await this.lmpool.deposit(0, "3", "9", { from: userAddress1 })
            expect((await this.lmpool.poolInfo(0))[5]).to.be.bignumber.equal(new BN(1000))            // After 180 days means 6 months
            await time.increase(86400 * 6 * 30)
            expect(await this.lmpool.viewEligibleAmount(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(500))
        })

        it("eligible amount to withdraw from multiple vaults 0, 6 and 9 after 9 month", async function () {

            await this.lmpool.deposit(0, "1", "0", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,2);
            await this.erc721.setReturnValue(400);
            await this.erc721.approve(this.lmpool.address, 2, { from: userAddress1 })
            await this.lmpool.deposit(0, 2, "6", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,3);
            await this.erc721.setReturnValue(500);
            await this.erc721.approve(this.lmpool.address, 3, { from: userAddress1 })
            await this.lmpool.deposit(0, "3", "9", { from: userAddress1 })
            // After 270 days means 9 months
            await time.increase(86400 * 9 * 30)
            expect((await this.lmpool.poolInfo(0))[5]).to.be.bignumber.equal(new BN(1000))
            expect(await this.lmpool.viewEligibleAmount(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(1000))
        })

        it("withdraw the amount from multiple vaults 0, 6 and 9 just after deposit", async function () {
            await this.lmpool.deposit(0, "1", "0", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,2);
            await this.erc721.setReturnValue(400);
            await this.erc721.approve(this.lmpool.address, 2, { from: userAddress1 })
            await this.lmpool.deposit(0, 2, "6", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,3);
            await this.erc721.setReturnValue(500);
            await this.erc721.approve(this.lmpool.address, 3, { from: userAddress1 })
            await this.lmpool.deposit(0, "3", "9", { from: userAddress1 })
            expect(await this.lmpool.viewEligibleAmount(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(100))
            await this.lmpool.withdraw(0, true, { from: userAddress1 })
            // after 7 days
            await time.increase(604800)
            await this.lmpool.withdraw(0, true, { from: userAddress1 })
            expect(await this.erc721.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(1))
            expect((await this.lmpool.poolInfo(0))[5]).to.be.bignumber.equal(new BN(900))
        })

        it("withdraw the amount from multiple vaults 0, 6 and 9 after 6 months", async function () {
            await this.lmpool.deposit(0, "1", "0", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,2);
            await this.erc721.setReturnValue(400);
            await this.erc721.approve(this.lmpool.address, 2, { from: userAddress1 })
            await this.lmpool.deposit(0, 2, "6", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,3);
            await this.erc721.setReturnValue(500);
            await this.erc721.approve(this.lmpool.address, 3, { from: userAddress1 })
            await this.lmpool.deposit(0, "3", "9", { from: userAddress1 })
            // After 180 days means 6 months
            await time.increase(86400 * 6 * 30)
            expect(await this.lmpool.viewEligibleAmount(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(500))
            await this.lmpool.withdraw(0, true, { from: userAddress1 })
            // after 7 days
            await time.increase(86400 * 7)
            await this.lmpool.withdraw(0, true, { from: userAddress1 })
            expect(await this.erc721.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(2))
            expect((await this.lmpool.poolInfo(0))[5]).to.be.bignumber.equal(new BN(500))
        })

        it("withdraw the amount from multiple vaults 0, 6 and 9 after 9 months", async function () {
            await this.lmpool.deposit(0, "1", "0", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,2);
            await this.erc721.setReturnValue(400);
            await this.erc721.approve(this.lmpool.address, 2, { from: userAddress1 })
            await this.lmpool.deposit(0, 2, "6", { from: userAddress1 })
            await this.erc721.safeMint(userAddress1,3);
            await this.erc721.setReturnValue(500);
            await this.erc721.approve(this.lmpool.address, 3, { from: userAddress1 })
            await this.lmpool.deposit(0, "3", "9", { from: userAddress1 })            // After 270 days means 9 months
            await time.increase(86400 * 9 * 30)
            expect(await this.lmpool.viewEligibleAmount(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(1000))
            await this.lmpool.withdraw(0, true, { from: userAddress1 })
            // after 7 days
            await time.increase(604800)
            await this.lmpool.withdraw(0, true, { from: userAddress1 })
            expect(await this.erc721.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(3))
            expect((await this.lmpool.poolInfo(0))[5]).to.be.bignumber.equal(new BN(0))
        })
    });

    describe('reward multiplier and reward distribution', function () {
        beforeEach(async function () {
            await this.chef.setLmPoolAddress(this.lmpool.address, true, { from: ownerAddress });
            await this.erc721.setTokens(this.dai.address,this.usdc.address);
            await this.lmpool.add(this.erc721.address,this.dai.address, this.usdc.address,3000, { from: ownerAddress })
            await this.lmpool.add(this.erc721.address,this.dai.address,this.astra.address,3000, { from: ownerAddress })
            await this.lmpool.addVault(3, { from: ownerAddress, gas: 8000000 })
            await this.lmpool.addVault(12, { from: ownerAddress, gas: 8000000 })

            await this.erc721.safeMint(userAddress1,1);
            await this.erc721.safeMint(userAddress1,2);
            await this.erc721.safeMint(userAddress2,3);
            await this.erc721.safeMint(userAddress2,4);
            await this.erc721.setApprovalForAll(this.lmpool.address,true, { from: userAddress1 });
            await this.erc721.setApprovalForAll(this.lmpool.address,true, { from: userAddress2 });

            await this.chef.add(this.astra.address, { from: ownerAddress })
            await this.chef.addVault(12, { from: ownerAddress, gas: 8000000 })
            await this.astra.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.astra.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.astra.approve(this.chef.address, "1000000000000000000000000", { from: userAddress1 })
            await this.astra.approve(this.chef.address, "1000000000000000000000000", { from: userAddress2 })

            await this.usdc.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.usdc.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.usdc.approve(this.lmpool.address, "1000000000000000000000000", { from: userAddress1 })
            await this.usdc.approve(this.lmpool.address, "1000000000000000000000000", { from: userAddress2 })

            await this.dai.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.dai.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.dai.approve(this.lmpool.address, "1000000000000000000000000", { from: userAddress1 })
            await this.dai.approve(this.lmpool.address, "1000000000000000000000000", { from: userAddress2 })
        })

        it("reward multiplier for user1 and user2", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress2 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            expect(await this.lmpool.getRewardMultiplier(userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21))
        })


        it("individual reward distribution", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress2 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            expect(await this.lmpool.getRewardMultiplier(userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21))
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 12, { from: userAddress1 })
            await this.erc721.setReturnValue("300000000000000000000000");
            await this.lmpool.deposit(0, 3, 12, { from: userAddress2 })
            await this.lmpool.distributeReward(0, 0, "100000000000000000000", { from: ownerAddress })
            expect(await this.lmpool.viewRewardInfo(0,userAddress1)).to.be.bignumber.equal(new BN("24090000000000007227"))
            expect(await this.lmpool.viewRewardInfo(0,userAddress2)).to.be.bignumber.equal(new BN("75900000000000007590"))
        })

        it("flat reward distribution", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress2 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            expect(await this.lmpool.getRewardMultiplier(userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21))
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 12, { from: userAddress1 })
            await this.erc721.setReturnValue("300000000000000000000000");
            await this.lmpool.deposit(0, 3, 12, { from: userAddress2 })


            await this.erc721.setTokens(this.dai.address,this.astra.address);
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(1, 2, 12, { from: userAddress1 })
            await this.erc721.setReturnValue("300000000000000000000000");
            await this.lmpool.deposit(1, 4, 12, { from: userAddress2 });
            await this.lmpool.distributeReward(0, 1, "100000000000000000000", { from: ownerAddress })
            expect(await this.lmpool.viewRewardInfo(0,userAddress1 )).to.be.bignumber.equal(new BN("12040000000000019272"))
            expect(await this.lmpool.viewRewardInfo(0,userAddress2 )).to.be.bignumber.equal(new BN("37950000000000045540"))
            expect(await this.lmpool.viewRewardInfo(1,userAddress1 )).to.be.bignumber.equal(new BN("12040000000000007227"))
            expect(await this.lmpool.viewRewardInfo(1,userAddress2 )).to.be.bignumber.equal(new BN("37950000000000007590"))
        })

        it("tvl adjusted reward distribution", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress2 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            expect(await this.lmpool.getRewardMultiplier(userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21))
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 12, { from: userAddress1 })
            await this.erc721.setReturnValue("300000000000000000000000");
            await this.lmpool.deposit(0, 3, 12, { from: userAddress2 })


            await this.erc721.setTokens(this.dai.address,this.astra.address);
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(1, 2, 12, { from: userAddress1 })
            await this.erc721.setReturnValue("300000000000000000000000");
            await this.lmpool.deposit(1, 4, 12, { from: userAddress2 });
            await this.lmpool.distributeReward(0, 2, "100000000000000000000", { from: ownerAddress })
            expect(await this.lmpool.viewRewardInfo(0, userAddress1 )).to.be.bignumber.equal(new BN("12045000000000019272"))
            expect(await this.lmpool.viewRewardInfo(0, userAddress2 )).to.be.bignumber.equal(new BN("37950000000000045540"))
            expect(await this.lmpool.viewRewardInfo(1, userAddress1 )).to.be.bignumber.equal(new BN("12045000000000007227"))
            expect(await this.lmpool.viewRewardInfo(1, userAddress2 )).to.be.bignumber.equal(new BN("37950000000000007590"))
        })

        it("block reward distribution", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress2 })
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 12, { from: userAddress1 })
            await this.erc721.setReturnValue("300000000000000000000000");
            await this.lmpool.deposit(0, 3, 12, { from: userAddress2 })

            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            expect(await this.lmpool.getRewardMultiplier(userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21))
            expect((await this.lmpool.poolInfo(0))[5]).to.be.bignumber.equal(new BN("400000000000000000000000"))
            expect(await this.lmpool.viewRewardInfo(0, userAddress1 )).to.be.bignumber.equal(new BN("7227"))
            expect(await this.lmpool.viewRewardInfo(0, userAddress2 )).to.be.bignumber.equal(new BN("7590"))
        })
    });

    describe("setting chef contract address", function () {
        beforeEach(async function () {
            // await this.lmpool.add(this.usdc.address, { from: ownerAddress })
            // await this.lmpool.add(this.dai.address, { from: ownerAddress })
            await this.lmpool.addVault("3", { from: ownerAddress })
            await this.lmpool.addVault("12", { from: ownerAddress })
        })

        it("should not set the chef address except owner", async function () {
            await expectRevert(this.lmpool.setChefAddress(this.chef.address, { from: userAddress2 }), "Ownable: caller is not the owner");
        })

        it("should set the chef address", async function () {
            await this.lmpool.setChefAddress(this.chef.address, { from: ownerAddress })
            expect(await this.lmpool.chefaddr()).to.be.equal(this.chef.address);
        });
    })

    describe("Claiming ASTR reward with or without staking by paying fee", function () {
        beforeEach(async function () {
            await this.chef.setLmPoolAddress(this.lmpool.address, true, { from: ownerAddress });
            await this.erc721.setTokens(this.dai.address,this.usdc.address);
            await this.lmpool.add(this.erc721.address,this.dai.address, this.usdc.address,3000, { from: ownerAddress })
            await this.lmpool.add(this.erc721.address,this.dai.address,this.astra.address,3000, { from: ownerAddress })

            await this.erc721.safeMint(userAddress1,1);
            await this.erc721.safeMint(userAddress1,2);
            await this.erc721.safeMint(userAddress2,3);
            await this.erc721.safeMint(userAddress2,4);
            await this.erc721.setApprovalForAll(this.lmpool.address,true, { from: userAddress1 });
            await this.erc721.setApprovalForAll(this.lmpool.address,true, { from: userAddress2 });

            await this.lmpool.addVault(0, { from: ownerAddress, gas: 8000000 })
            await this.lmpool.addVault(3, { from: ownerAddress, gas: 8000000 })
            await this.lmpool.addVault(12, { from: ownerAddress, gas: 8000000 })

            await this.chef.add(this.astra.address, { from: ownerAddress })
            await this.chef.addVault(12, { from: ownerAddress, gas: 8000000 })
            await this.astra.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.astra.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.astra.approve(this.chef.address, "1000000000000000000000000", { from: userAddress1 })
            await this.astra.approve(this.chef.address, "1000000000000000000000000", { from: userAddress2 })

            await this.usdc.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.usdc.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.usdc.approve(this.lmpool.address, "1000000000000000000000000", { from: userAddress1 })
            await this.usdc.approve(this.lmpool.address, "1000000000000000000000000", { from: userAddress2 })

            await this.dai.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.dai.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.dai.approve(this.lmpool.address, "1000000000000000000000000", { from: userAddress1 })
            await this.dai.approve(this.lmpool.address, "1000000000000000000000000", { from: userAddress2 })
        })

        it("Lm pool should have ASTRA while claiming ASTR reward without stake", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 12, { from: userAddress1 })

            // await this.lmpool.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await this.lmpool.distributeReward(0, 0, "100000000000000000000", { from: ownerAddress })
            await time.increase(86401)
            expect(await this.lmpool.viewRewardInfo(0, userAddress1 )).to.be.bignumber.equal(new BN("100000000000000020000"))
            expectRevert(this.lmpool.withdrawASTRReward("0", false, { from: userAddress1 }), "Insufficient amount on lm pool contract")
        })

        it("Claiming ASTR reward without stake after 1 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 12, { from: userAddress1 })
            // await this.lmpool.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await this.lmpool.distributeReward(0, 0, "100000000000000000000", { from: ownerAddress })
            await time.increase(86401)
            expect(await this.lmpool.viewRewardInfo(0, userAddress1 )).to.be.bignumber.equal(new BN("100000000000000020000"))
            expect(await this.astra.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN(0))
            await this.astra.transfer(this.lmpool.address, "100000000000000010000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.lmpool.withdrawASTRReward("0", false, { from: userAddress1 });
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900011000000000000004400"))
        })

        it("Claiming ASTR reward without stake after 20 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 12, { from: userAddress1 })
            // await this.lmpool.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await this.lmpool.distributeReward(0, 0, "100000000000000000000", { from: ownerAddress })
            await time.increase(86400 * 20 + 1)
            expect(await this.lmpool.viewRewardInfo(0, userAddress1 )).to.be.bignumber.equal(new BN("100000000000000020000"))
            expect(await this.astra.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN(0))
            await this.astra.transfer(this.lmpool.address, "100000000000000010000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.lmpool.withdrawASTRReward("0", false, { from: userAddress1 });
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900030000000000000012000"))
        })

        it("Claiming ASTR reward without stake after 90 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 12, { from: userAddress1 })
            // await this.lmpool.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await this.lmpool.distributeReward(0, 0, "100000000000000000000", { from: ownerAddress })
            await time.increase(86400 * 90 + 1)
            expect(await this.lmpool.viewRewardInfo(0, userAddress1 )).to.be.bignumber.equal(new BN("100000000000000020000"))
            expect(await this.astra.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN(0))
            await this.astra.transfer(this.lmpool.address, "1000000000000000100000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.lmpool.withdrawASTRReward("0", false, { from: userAddress1 });
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900100000000000000040000"))
        })

        it("Withdrawing staked amount and ASTR reward without stake after 1 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            // await this.lmpool.deposit(0, "100000000000000000000000", 0, { from: userAddress1 })
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 0, { from: userAddress1 })
            await this.lmpool.distributeReward(0, 0, "100000000000000000000", { from: ownerAddress })
            await time.increase(86401)
            expect(await this.lmpool.viewRewardInfo(0, userAddress1 )).to.be.bignumber.equal(new BN("100000000000000020000"))
            expect(await this.astra.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN(0))
            await this.astra.transfer(this.lmpool.address, "1000000000000000100000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.lmpool.withdraw("0", false, { from: userAddress1 })
            // after 7 days
            await time.increase(604800)
            await this.lmpool.withdraw("0", false, { from: userAddress1 })
            // After 8 days
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900018000000000000010800"))
            expect(await this.erc721.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("2"))
            expect(await this.erc721.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN("0"))
        })

        it("Withdrawing staked amount and ASTR reward without stake after 20 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            // await this.lmpool.deposit(0, "100000000000000000000000", 0, { from: userAddress1 })
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 0, { from: userAddress1 })
            await this.lmpool.distributeReward(0, 0, "100000000000000000000", { from: ownerAddress })
            await time.increase(86400 * 13 + 1)
            expect(await this.lmpool.viewRewardInfo(0, userAddress1 )).to.be.bignumber.equal(new BN("100000000000000020000"))
            expect(await this.astra.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN(0))
            await this.astra.transfer(this.lmpool.address, "1000000000000000100000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.lmpool.withdraw("0", false, { from: userAddress1 })
            // after 7 days
            await time.increase(604800)
            await this.lmpool.withdraw("0", false, { from: userAddress1 })
            //After 13+7 = 20 days
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900030000000000000018000"))
            expect(await this.erc721.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("2"))
            expect(await this.erc721.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN("0"))
        })

        it("Withdrawing staked amount and ASTR reward without stake after 90 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            // await this.lmpool.deposit(0, "100000000000000000000000", 0, { from: userAddress1 })
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 0, { from: userAddress1 })
            await this.lmpool.distributeReward(0, 0, "100000000000000000000", { from: ownerAddress })
            await time.increase(86400 * 83 + 1)
            expect(await this.lmpool.viewRewardInfo(0, userAddress1 )).to.be.bignumber.equal(new BN("100000000000000020000"))
            expect(await this.astra.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN(0))
            await this.astra.transfer(this.lmpool.address, "1000000000000000100000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.lmpool.withdraw("0", false, { from: userAddress1 })
            // after 7 days
            await time.increase(604800)
            await this.lmpool.withdraw("0", false, { from: userAddress1 })
            // after 83+7 = 90 days
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900100000000000000060000"))
            expect(await this.erc721.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("2"))
            expect(await this.erc721.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN("0"))
        })

        it("Claiming ASTR reward with staking in astra pool", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            // await this.lmpool.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 12, { from: userAddress1 })

            await this.lmpool.distributeReward(0, 0, "100000000000000000000", { from: ownerAddress })
            expect(await this.lmpool.viewRewardInfo(0, userAddress1 )).to.be.bignumber.equal(new BN("100000000000000010000"))
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.lmpool.withdrawASTRReward("0", true, { from: userAddress1 });
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
        })

        it("Withdrawing staked amount and ASTR reward with staking in astra pool", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await time.increase(86401)
            expect(await this.lmpool.getRewardMultiplier(userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.erc721.setReturnValue("100000000000000000000000");
            await this.lmpool.deposit(0, 1, 12, { from: userAddress1 })
            // await this.lmpool.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            await this.lmpool.distributeReward(0, 0, "100000000000000000000", { from: ownerAddress })
            await time.increase(86400 * 12 * 30 + 1)
            expect(await this.lmpool.viewRewardInfo(0, userAddress1 )).to.be.bignumber.equal(new BN("100000000000000020000"))
            expect(await this.astra.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN(0))
            await this.astra.transfer(this.lmpool.address, "1000000000000000100000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.lmpool.withdraw("0", true, { from: userAddress1 })
            // after 7 days
            await time.increase(604800)
            await this.lmpool.withdraw("0", true, { from: userAddress1 })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            expect(await this.erc721.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("2"))
            expect(await this.erc721.balanceOf(this.lmpool.address)).to.be.bignumber.equal(new BN("0"))
        })
    })
})