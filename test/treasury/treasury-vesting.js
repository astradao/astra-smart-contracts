const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;
const TokenVesting = contract.fromArtifact('TokenVesting');
const TestERC20 = contract.fromArtifact('TESTERC20');

const {
    encodeParameters
} = require('../../Util/Ethereum');

describe('Treasury', function () {
    const [ownerAddress, userAddress1, userAddress2, userAddress3, userAddress4, userAddress5, userAddress6] = accounts;
    beforeEach(async function () {
        this.astra = await TestERC20.new("Astra", "ASTR",18, { from: ownerAddress, gas: 8000000 });
        this.treasury = await TokenVesting.new({ from: ownerAddress, gas: 8000000 });
        await this.treasury.initialize(this.astra.address,120, { from: ownerAddress, gas: 8000000 });
    });

    describe('Check Initial configuration', function () {
        it("Should set correct Astra address", async function () {
            const astraAddress = await this.treasury.getToken();
            expect(astraAddress).to.equal(this.astra.address);
        })
        it("Should set correct owner", async function () {
            const owner = await this.treasury.owner();
            expect(owner).to.equal(ownerAddress);
        })
        it("Should set transfer ownership correctly", async function () {
            await this.treasury.transferOwnership(userAddress1, {from: ownerAddress});
            await expectRevert(this.treasury.createVestingSchedule(userAddress1, 10, 10, 10, 1, true, 100, {from: ownerAddress}),"Ownable: caller is not the owner");
            await expectRevert(this.treasury.setNewUpKeepTime(1000, {from: ownerAddress}),"Ownable: caller is not the owner");
            await expectRevert(this.treasury.setNewKeeperInterval(1000, {from: ownerAddress}),"Ownable: caller is not the owner");
            expect(await this.treasury.setNewUpKeepTime(1000, {from: userAddress1}))
            expect(await this.treasury.setNewKeeperInterval(1000, {from: userAddress1}))
        })
    })

    describe('Check airdrop', function () {
        it("Should send correct token to all address", async function () {
            await this.astra.approve(this.treasury.address, 60000, {from: ownerAddress})
            await this.treasury.multisendToken([userAddress1, userAddress2, userAddress3], [10000,20000,30000], {from: ownerAddress});
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(10000));
            expect(await this.astra.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(20000));
            expect(await this.astra.balanceOf(userAddress3)).to.be.bignumber.equal(new BN(30000));

        })
    })

    describe('Create vesting schedule', function () {
        it("Should revert if non owner tries to create vesting", async function () {
            await expectRevert(this.treasury.createVestingSchedule(userAddress1,10,10,10,1,true,100),"Ownable: caller is not the owner");
        })
        it("Should revert if contract don't have enough tokens", async function () {
            await expectRevert(this.treasury.createVestingSchedule(userAddress1,10,10,10,1,true,100,{from:ownerAddress}),"TokenVesting: cannot create vesting schedule because not sufficient tokens");

        })
        it("Should create single vesting", async function () {
            await this.astra.transfer(this.treasury.address, 100, {from:ownerAddress})
            await this.treasury.createVestingSchedule(userAddress1,10,10,10,1,true,100,{from:ownerAddress})
            expect(await this.treasury.getVestingSchedulesCount()).to.be.bignumber.equal(new BN(1));
        })
        it("Should creact multiple vesting", async function () {
            await this.astra.transfer(this.treasury.address, 300, {from:ownerAddress})
            await this.treasury.addUserDetails([userAddress1,userAddress2,userAddress3],[100,100,100],10,10,10,1,true,{from:ownerAddress})
            expect(await this.treasury.getVestingSchedulesCount()).to.be.bignumber.equal(new BN(3));
        })
    })

    describe('Claim vesting', function () {
        beforeEach(async function () {
            let tmpTime = await time.latest();
            await this.astra.transfer(this.treasury.address, 30000, {from:ownerAddress})
            await this.treasury.addUserDetails([userAddress1,userAddress2,userAddress3],[10000,10000,10000],tmpTime,400,1000,10,true,{from:ownerAddress})
        })
        it("Should show correct claimable amount in get function", async function () {
            await time.increase(390);
            let vestingId = await this.treasury.getVestingIdAtIndex(0);
            expect(await this.treasury.computeReleasableAmount(vestingId)).to.be.bignumber.equal(new BN(0));

            await time.increase(20);
            expect(await this.treasury.computeReleasableAmount(vestingId)).to.be.bignumber.equal(new BN(4100));

        })
        it("Should claim correct amount", async function () {
            await time.increase(500);
            let vestingId = await this.treasury.getVestingIdAtIndex(0);
            await this.treasury.release(vestingId, 5000);
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(5000));
        })
        it("User should not recieve token after vesting is completed", async function () {
            // Claim all token for vesting.
            await time.increase(1000);
            await this.treasury.performUpkeep("0x");
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(10000));
            expect(await this.astra.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(10000));
            expect(await this.astra.balanceOf(userAddress3)).to.be.bignumber.equal(new BN(10000));

            // Check after vesting is completed

            await time.increase(100);
            await this.treasury.performUpkeep("0x");
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(10000));
            expect(await this.astra.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(10000));
            expect(await this.astra.balanceOf(userAddress3)).to.be.bignumber.equal(new BN(10000));
        })
        it("User should not recieve token before vesting/cliff is started", async function () {
            await time.increase(200);
            let vestingId = await this.treasury.getVestingIdAtIndex(0);
            // await this.treasury.release(vestingId, 2000);
            await expectRevert(this.treasury.release(vestingId, 2000),"TokenVesting: cannot release tokens, not enough vested tokens");
            await this.treasury.performUpkeep("0x");
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(0));
        
        })
        it("User should get all token once if didn't claim in between vesting.", async function () {
            await time.increase(1000);
            await this.treasury.performUpkeep("0x");
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(10000));
            expect(await this.astra.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(10000));
            expect(await this.astra.balanceOf(userAddress3)).to.be.bignumber.equal(new BN(10000));
        })
        it("User should get correct token once cliff ended", async function () {
            await time.increase(400);
            await this.treasury.performUpkeep("0x");
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(4000));
            expect(await this.astra.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(4000));
            expect(await this.astra.balanceOf(userAddress3)).to.be.bignumber.equal(new BN(4000));
        })
        it("Multiple users should get correct claim amount", async function () {
            await time.increase(500);
            await this.treasury.performUpkeep("0x");
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(5000));
            expect(await this.astra.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(5000));
            expect(await this.astra.balanceOf(userAddress3)).to.be.bignumber.equal(new BN(5000));
        })
    })

    describe('Revoke', function () {
        beforeEach(async function () {
            let tmpTime = await time.latest();
            await this.astra.transfer(this.treasury.address, 30000, {from:ownerAddress})
            await this.treasury.addUserDetails([userAddress1,userAddress2,userAddress3],[10000,10000,10000],tmpTime,400,1000,10,true,{from:ownerAddress})
        })
        it("Should revert if non owner tries to revoke", async function () {
            let vestingId = await this.treasury.getVestingIdAtIndex(0);
            await expectRevert(this.treasury.revoke(vestingId),"Ownable: caller is not the owner");

        })
        it("Should revoke vesting", async function () {
            let vestingId = await this.treasury.getVestingIdAtIndex(0);
            await this.treasury.revoke(vestingId, {from:ownerAddress});
            let data = await this.treasury.getVestingSchedule(vestingId);
            expect(data.revoked).to.be.equal(true);
        })
        it("Revoked address will not get tokens", async function () {
            let vestingId = await this.treasury.getVestingIdAtIndex(0);
            await this.treasury.revoke(vestingId, {from:ownerAddress});
            await time.increase(500);
            await this.treasury.performUpkeep("0x");
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(0));
            expect(await this.astra.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(5000));
            expect(await this.astra.balanceOf(userAddress3)).to.be.bignumber.equal(new BN(5000));
        })
    })

    describe('Chainlink upkeep', function () {
        beforeEach(async function () {
            let tmpTime = await time.latest();
            await this.astra.transfer(this.treasury.address, 30000, {from:ownerAddress})
            await this.treasury.addUserDetails([userAddress1,userAddress2,userAddress3],[10000,10000,10000],tmpTime,400,1000,10,true,{from:ownerAddress})
        })
        it("Should revert if non owner tries to update upkeep start time", async function () {
            it("Should revert if non owner tries to create vesting", async function () {
                await expectRevert(this.treasury.setNewUpKeepTime(1000),"Ownable: caller is not the owner");
            })
        })
        it("Should revert if non owner tries to update upkeep interval", async function () {
            it("Should revert if non owner tries to create vesting", async function () {
                await expectRevert(this.treasury.setNewKeeperInterval(1000),"Ownable: caller is not the owner");
            })
        })
        it("Should update upkeep start time", async function () {
            await this.treasury.setNewUpKeepTime(1000, {from: ownerAddress});
            expect(await this.treasury.keeperLastUpdatedTime()).to.be.bignumber.equal(new BN(1000));
        })
        it("Should update upkeep start time", async function () {
            await this.treasury.setNewKeeperInterval(1000, {from: ownerAddress})
            expect(await this.treasury.keeperInterval()).to.be.bignumber.equal(new BN(1000));
        })
        it("Check upkeep should behave correctly", async function () {
            let tmpTime = await time.latest();
            await this.treasury.setNewUpKeepTime(tmpTime+100, {from: ownerAddress});
            let data = await this.treasury.checkUpkeep("0x");
            expect(data.upkeepNeeded).to.be.equal(false);
        })
    })


    


})