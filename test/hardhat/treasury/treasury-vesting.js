const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;
let owner, addr1, addr2, addrs, daiHolder, usdcHolder, astraHolder;
// const {
//     encodeParameters
// } = require('../../Util/Ethereum');

describe('Treasury', function () {
     //const [ownerAddress, userAddress1, userAddress2, userAddress3, userAddress4, userAddress5, userAddress6] = accounts;
    
    // const [owner, addr1, addr2, ...addrs] = ethers.getSigners();
    beforeEach(async () => {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
        const AstraDAOVesting = await ethers.getContractFactory('AstraDAOVesting');
        const TestERC20 = await ethers.getContractFactory('TESTERC20');
        astra = await TestERC20.deploy("Astra", "ASTR",18);
        treasury = await AstraDAOVesting.connect(owner).deploy();
        await treasury.connect(owner).initialize(astra.address,120);
        await astra.transfer(treasury.address, 10000000000);
      });

    describe('Check Initial configuration', function () {
        
        it("Should set correct Astra address", async function () {
            const astraAddress = await treasury.getToken();
            expect(astraAddress).to.equal(astra.address);
        })
        it("Should set correct owner", async function () {
            const own = await treasury.owner();
            expect(own).to.equal(owner.address);

        })
        it("Should set transfer ownership correctly", async function () {
            await treasury.connect(owner).transferOwnership(addr1.address);
            await treasury.connect(addr1).acceptOwnership();
            await expectRevert(treasury.connect(owner).createVestingSchedule(addr1.address, 10, 10, 10, 1, true, 100,0),"Ownable: caller is not the owner");
            await expectRevert(treasury.connect(owner).setNewUpKeepTime(1000),"Ownable: caller is not the owner");
            await expectRevert(treasury.connect(owner).setNewKeeperInterval(1000),"Ownable: caller is not the owner");
            expect(await treasury.connect(addr1).setNewUpKeepTime(1000))
            expect(await treasury.connect(addr1).setNewKeeperInterval(1000))
        })
    })

    describe('Check airdrop', function () {
        it("Should send correct token to all address", async function () {
            await astra.approve(treasury.address, 60000)
            await treasury.connect(owner).multisendToken([addr1.address, addr2.address], [10000,20000]);
            expect(await astra.balanceOf(addr1.address)).to.be.equal(10000);
            expect(await astra.balanceOf(addr2.address)).to.be.equal(20000)
        })
    })

    describe('Create vesting schedule', function () {
        it("Should revert if non owner tries to create vesting", async function () {
            await expectRevert(treasury.connect(addr1).createVestingSchedule(addr1.address,10,10,10,1,true,100,0),"Ownable: caller is not the owner");
        })
        it("Should revert if contract don't have enough tokens", async function () {
            await expectRevert(treasury.connect(owner).createVestingSchedule(addr1.address,10,10,10,1,true,20000000000,0),"AstraDAOVesting: cannot create vesting schedule because not sufficient tokens");
            // console.log(await treasury.owner());
            // expect(await treasury.owner()).to.equal(addr1.address);

        })
        it("Should create single vesting", async function () {
            //await this.astra.transfer(this.treasury.address, 100, {from:ownerAddress})
            await treasury.connect(owner).createVestingSchedule(addr1.address,10,10,10,1,true,100,0)
            expect(await treasury.getVestingSchedulesCount()).to.be.equal(1);
        })
        it("Should create multiple vesting", async function () {
            //await astra.transfer(this.treasury.address, 300, {from:ownerAddress})
            await treasury.connect(owner).addUserDetails([addr1.address,addr2.address,owner.address],[100,100,100],[0,0,0],10,10,10,1,true)
            expect(await treasury.getVestingSchedulesCount()).to.be.equal(3);
        })
    })

    describe('Claim vesting', function () {
        beforeEach(async function () {
            let tmpTime = await time.latest();
            //await this.astra.transfer(this.treasury.address, 30000, {from:ownerAddress})
            await treasury.connect(owner).addUserDetails([addr1.address,addr2.address,owner.address],[10000,10000,10000],[0,0,0], (new BN(tmpTime)).toString(),400,1000,10,true)
        })
        it("Should show correct claimable amount in get function", async function () {
            await time.increase(390);
            let vestingId = await treasury.getVestingIdAtIndex(0);
            expect(await treasury.computeReleasableAmount(vestingId)).to.be.equal(0);

            await time.increase(20);
            expect(await treasury.computeReleasableAmount(vestingId)).to.be.equal(4100);

        })
        it("Should claim correct amount", async function () {
            await time.increase(500);
            let vestingId = await treasury.getVestingIdAtIndex(0);
            await treasury.release(vestingId, 5000);
            expect(await astra.balanceOf(addr1.address)).to.be.equal(5000);
        })
        it("User should not recieve token after vesting is completed", async function () {
            // Claim all token for vesting.
            await time.increase(1000);
            await treasury.performUpkeep("0x");
            expect(await astra.balanceOf(addr1.address)).to.be.equal(10000);
            expect(await astra.balanceOf(addr2.address)).to.be.equal(10000);

            // Check after vesting is completed

            await time.increase(100);
            await treasury.performUpkeep("0x");
            expect(await astra.balanceOf(addr1.address)).to.be.equal(10000);
            expect(await astra.balanceOf(addr2.address)).to.be.equal(10000);

        })
        it("User should not recieve token before vesting/cliff is started", async function () {
            await time.increase(200);
            let vestingId = await treasury.getVestingIdAtIndex(0);
            // await this.treasury.release(vestingId, 2000);
            await expectRevert(treasury.release(vestingId, 2000),"AstraDAOVesting: cannot release tokens, not enough vested tokens");
            await treasury.performUpkeep("0x");
            expect(await astra.balanceOf(addr1.address)).to.be.equal(0);
        
        })
        it("User should get all token once if didn't claim in between vesting.", async function () {
            await time.increase(1000);
            await treasury.performUpkeep("0x");
            expect(await astra.balanceOf(addr1.address)).to.be.equal(10000);
            expect(await astra.balanceOf(addr2.address)).to.be.equal(10000);

        })
        it("User should get correct token once cliff ended", async function () {
            await time.increase(400);
            await treasury.performUpkeep("0x");
            expect(await astra.balanceOf(addr1.address)).to.be.equal(4000);
            expect(await astra.balanceOf(addr2.address)).to.be.equal(4000);

        })
        it("Multiple users should get correct claim amount", async function () {
            await time.increase(500);
            await treasury.performUpkeep("0x");
            expect(await astra.balanceOf(addr1.address)).to.be.equal(5000);
            expect(await astra.balanceOf(addr2.address)).to.be.equal(5000);
        })
    })

    describe('Revoke', function () {
        beforeEach(async function () {
            let tmpTime = await time.latest();
            await astra.transfer(treasury.address, 30000)
            await treasury.addUserDetails([addr1.address,addr2.address],[10000,10000],[0,0],(new BN(tmpTime)).toString(),400,1000,10,true)
        })
        it("Should revert if non owner tries to revoke", async function () {
            let vestingId = await treasury.getVestingIdAtIndex(0);
            await expectRevert(treasury.connect(addr1).revoke(vestingId),"Ownable: caller is not the owner");

        })
        it("Should revoke vesting", async function () {
            let vestingId = await treasury.getVestingIdAtIndex(0);
            await treasury.connect(owner).revoke(vestingId);
            let data = await treasury.getVestingSchedule(vestingId);
            expect(data.revoked).to.be.equal(true);
        })
        it("Revoked address will not get tokens", async function () {
            let vestingId = await treasury.getVestingIdAtIndex(0);
            await treasury.connect(owner).revoke(vestingId);
            await time.increase(500);
            await treasury.performUpkeep("0x");
            expect(await astra.balanceOf(addr1.address)).to.be.equal(0);
            expect(await astra.balanceOf(addr2.address)).to.be.equal(5000);
        })
    })

    describe('Chainlink upkeep', function () {
        beforeEach(async function () {
            let tmpTime = await time.latest();
            await astra.transfer(treasury.address, 30000)
            await treasury.addUserDetails([addr1.address,addr2.address],[10000,10000],[0,0],(new BN(tmpTime)).toString(),400,1000,10,true)
        })
        it("Should revert if non owner tries to update upkeep start time", async function () {
            it("Should revert if non owner tries to create vesting", async function () {
                await expectRevert(treasury.connect(addr1).setNewUpKeepTime(1000),"Ownable: caller is not the owner");
            })
        })
        it("Should revert if non owner tries to update upkeep interval", async function () {
            it("Should revert if non owner tries to create vesting", async function () {
                await expectRevert(treasury.connect(addr1).setNewKeeperInterval(1000),"Ownable: caller is not the owner");
            })
        })
        it("Should update upkeep start time", async function () {
            await treasury.setNewUpKeepTime(1000);
            expect(await treasury.keeperLastUpdatedTime()).to.be.equal(1000);
        })
        it("Should update upkeep start time", async function () {
            await treasury.setNewKeeperInterval(1000)
            expect(await treasury.keeperInterval()).to.be.equal(1000);
        })
        it("Check upkeep should behave correctly", async function () {
            let tmpTime = await time.latest();
            await treasury.setNewUpKeepTime(tmpTime+100);
            let data = await treasury.checkUpkeep("0x");
            expect(data.upkeepNeeded).to.be.equal(false);
        })
    })


    


})