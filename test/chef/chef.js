const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;
const MasterChef = contract.fromArtifact('MasterChef');
const TestERC20 = contract.fromArtifact('TESTERC20');

const {
    encodeParameters
} = require('../../Util/Ethereum');

describe('MasterChef', function () {
    const [ownerAddress, userAddress1, userAddress2, userAddress3, userAddress4, userAddress5, userAddress6] = accounts;
    beforeEach(async function () {
        this.astra = await TestERC20.new("Astra", "ASTR",18, { from: ownerAddress, gas: 8000000 });
        this.lp = await TestERC20.new("LPToken", "LP",18, { from: ownerAddress, gas: 8000000 });
        this.lp2 = await TestERC20.new("LPToken2", "LP2",18, { from: ownerAddress, gas: 8000000 });
        this.chef = await MasterChef.new({ from: ownerAddress, gas: 8000000 });
        await this.chef.initialize(this.astra.address, ownerAddress, "1000", "0", "10000", { from: ownerAddress, gas: 8000000 });
    });

    describe('set/update variables', function () {
        it("should set correct state variables", async function () {
            const astr = await this.chef.ASTR();
            const devaddr = await this.chef.devaddr();
            expect(astr).to.equal(this.astra.address);
            expect(devaddr).to.equal(ownerAddress);
        })

        it("should allow dev and only dev to update dev", async function () {
            expect(await this.chef.devaddr()).to.equal(ownerAddress)
            await expectRevert(this.chef.dev(userAddress1, { from: userAddress1 }), "dev: wut?")
            await this.chef.dev(userAddress1, { from: ownerAddress })
            expect(await this.chef.devaddr()).to.equal(userAddress1)
            await this.chef.dev(ownerAddress, { from: userAddress1 })
            expect(await this.chef.devaddr()).to.equal(ownerAddress)
        })

    });

    describe("Should test the deposit from DAA", function () {
        beforeEach(async function () {
            await this.lp.transfer(userAddress1, "1000", { from: ownerAddress })
            await this.lp.transfer(userAddress2, "1000", { from: ownerAddress })
            await this.lp.transfer(userAddress3, "1000", { from: ownerAddress })

            await this.lp2.transfer(userAddress1, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress2, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress3, "1000", { from: ownerAddress })
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
        })
        it("Should Revert while setting the DAA", async function () {
            await expectRevert(this.chef.setDaaAddress(userAddress1, { from: userAddress2 }), "Can only be called by the owner/timelock");
        });

        it("Should Set the DAA address", async function () {
            await this.chef.setDaaAddress(userAddress1, { from: ownerAddress })
            expect(await this.chef.daaAddress()).to.be.equal(userAddress1);
        });
        it("Should revert the deposit from the other address", async function () {
            await this.chef.setDaaAddress(userAddress1, { from: ownerAddress });
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await expectRevert(this.chef.depositFromDaaAndDAO(0, "100", "0", userAddress1, { from: userAddress2 }), "depositFromDaaAndDAO: caller is not the DAA");
        });

        it("Should deposit from the DAA address", async function () {
            await this.chef.setDaaAddress(userAddress1, { from: ownerAddress });
            await this.lp.approve(this.chef.address, "1000", { from: userAddress1 })
            await this.chef.depositFromDaaAndDAO(0, "100", "0", userAddress2, false, { from: userAddress1 });
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN(100));

        });
    })

    describe("With ERC/LP token added to the field", function () {
        beforeEach(async function () {
            this.chef = await MasterChef.new({ from: ownerAddress, gas: 8000000 });
            await this.chef.initialize(this.astra.address, ownerAddress, "1000", "0", "10000", { from: ownerAddress, gas: 8000000 });
            await this.lp.transfer(userAddress1, "1000", { from: ownerAddress })
            await this.lp.transfer(userAddress2, "1000", { from: ownerAddress })
            await this.lp.transfer(userAddress3, "1000", { from: ownerAddress })

            await this.lp2.transfer(userAddress1, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress2, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress3, "1000", { from: ownerAddress })
        })

        it("should allow emergency withdraw", async function () {
            // 100 per block farming rate starting at block 100 with bonus until block 1000
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "100", "0", { from: userAddress2 })
            expect(await this.lp.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(900));
            await this.chef.emergencyWithdraw(0, { from: userAddress2 })
            expect(await this.lp.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(1000));
        })

        it("set timelock address", async function () {
            await expectRevert(this.chef.setTimeLockAddress(userAddress1, { from: userAddress1 }), "Ownable: caller is not the owner")
            await this.chef.setTimeLockAddress(userAddress1, { from: ownerAddress });
            expect(await this.chef.timelock()).to.equal(userAddress1)
        })

        it("Call initialize method multiple time", async function () {
            this.chef = await MasterChef.new({ from: ownerAddress, gas: 8000000 });
            await this.chef.initialize(this.astra.address, ownerAddress, "100", "700", "1000", { from: ownerAddress, gas: 8000000 });
            await expectRevert(this.chef.initialize(this.astra.address, ownerAddress, "100", "700", "1000", { from: ownerAddress, gas: 8000000 }), "Contract instance has already been initialized");
        })

        it("Transfer Ownership", async function () {
            await expectRevert(this.chef.transferOwnership(userAddress1, { from: userAddress1, gas: 8000000 }), "Ownable: caller is not the owner");
            await this.chef.transferOwnership(userAddress1, { from: ownerAddress, gas: 8000000 });
            expect(await this.chef.owner()).to.equal(userAddress1)
            await expectRevert(this.chef.setTimeLockAddress(userAddress2, { from: ownerAddress }), "Ownable: caller is not the owner")
        })

        it("Add lp token more than one time", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await expectRevert(this.chef.add(this.lp.address, { from: ownerAddress }), "LP token already added");
        })

        it("calculate the staking score for same day staked", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "1000", 12, { from: userAddress2 })
            expect(await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(0));
        })

        it("calculate the staking score after withdrawal", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "1000", 0, { from: userAddress2 })
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress });
            //to start cooldown
            let beforeTimeincrease = await time.latestBlock();
            console.log("beforeTimeincrease ",parseInt(beforeTimeincrease));
            await this.chef.withdraw(0, false, { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801)
            let afterTimeincrease = await time.latestBlock();
            console.log("afterTimeincrease ",parseInt(afterTimeincrease));
            await this.chef.withdraw(0, false, { from: userAddress2 })
            expect(await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(0));
        })


        it("calculate the staking score after 30 days", async function () {
            await this.chef.addVault("0", { from: ownerAddress })
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "1000", 0, { from: userAddress2 })
            // time to check after 30 days
            time.increase(2592000);
            expect(await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(500));
        })

        it("calculate the staking score after 61 days", async function () {
            await this.chef.addVault("0", { from: ownerAddress })
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "1000", 0, { from: userAddress2 })
            // time to check after 61 days
            time.increase(5270400);
            expect(await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(1000));

        })

        it("calculate the staking for 12 month vault", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "1000", 12, { from: userAddress2 })
            // time to after 1 day
            time.increase(86401);
            expect(await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(1000));

        })

        it("calculate the staking for 6 month vault", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "1000", "6", { from: userAddress2 })
            // time to after 1 day
            time.increase(86401);
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(33));
        })

        it("calculate the staking for 3 month vault", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("3", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "1000", "3", { from: userAddress2 })
            // time to after 1 day
            time.increase(86401);
            expect(await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(22));
        })

        it("eligible amount should be greater than 0 for withdrawal", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("3", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "100", "3", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801)
            await expectRevert(this.chef.withdraw(0, false, { from: userAddress2 }), "withdraw: not good")
        })

        it("Cooldown period", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "100", "0", { from: userAddress2 })
            //on first withdra attempt cooldown perios become on
            await this.chef.withdraw(0, false, { from: userAddress2 })
            //on second  withdraw attempt if user try before cool down period over
            await expectRevert(this.chef.withdraw(0, false, { from: userAddress2 }), "withdraw: cooldown period")
        })

        it("withdraw on open window period ", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "1000", "0", { from: userAddress2 })
            //on first withdra attempt cooldown period start
            await this.chef.withdraw(0, false, { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801)
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress });
            await this.chef.withdraw(0, false, { from: userAddress2 })
            expect(await this.lp.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(1000))
        })

        it("withdraw after open window period over", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "1000", 0, { from: userAddress2 })
            //on first withdra attempt cooldown period start
            await this.chef.withdraw(0, false, { from: userAddress2 })
            //on second attempt after open window period over
            //time after 8 DAYS
            time.increase(691202)
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress });
            //now cooldown period is reset
            await this.chef.withdraw(0, false, { from: userAddress2 })
            expect(await this.lp.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(0))
        })
    })

    describe("Withdraw in vaults", function () {
        beforeEach(async function () {
            await this.lp.transfer(userAddress1, "1000", { from: ownerAddress })
            await this.lp.transfer(userAddress2, "1000", { from: ownerAddress })
            await this.lp.transfer(userAddress3, "1000", { from: ownerAddress })

            await this.lp2.transfer(userAddress1, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress2, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress3, "1000", { from: ownerAddress })
        })

        it("withdraw in 3 vaults ", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("3", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "1000", "3", { from: userAddress2 })
            //on first withdra attempt after 3 month
            time.increase(7776002)
            await this.chef.withdraw(0, false, { from: userAddress2 })
            //time after 7 DAYS
            time.increase(7776012)
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress });
            expect(this.chef.withdraw(0, false, { from: userAddress2 }), "Insufficient amount on chef contract")
            expect(await this.lp.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(0))
        })


        it("withdraw voult from 3 and 6", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("3", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress })
            await this.chef.deposit(0, "500", "3", { from: userAddress2 })
            await this.chef.deposit(0, "500", "6", { from: userAddress2 })
            time.increase(15552001);
            await this.chef.withdraw(0, false, { from: userAddress2 })
            //time after 7 DAYS
            time.increase(16156801)
            await this.chef.withdraw(0, false, { from: userAddress2 })
            await expectRevert(this.chef.withdraw(0, false, { from: userAddress2 }), "withdraw: cooldown period")
            expect(await this.lp.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(0))
        })

        it("eligible amount to withdraw from multiple vaults 0, 6 and 9", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress })
            await this.chef.deposit(0, "200", "0", { from: userAddress2 })
            await this.chef.deposit(0, "300", "6", { from: userAddress2 })
            await this.chef.deposit(0, "500", "9", { from: userAddress2 })
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN(1000))
            expect(await this.chef.viewEligibleAmount(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(200))
        })

        it("eligible amount to withdraw from multiple vaults 0, 6 and 9 after 6 months", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress })
            await this.chef.deposit(0, "200", "0", { from: userAddress2 })
            await this.chef.deposit(0, "300", "6", { from: userAddress2 })
            await this.chef.deposit(0, "500", "9", { from: userAddress2 })
            // After 180 days means 6 months
            time.increase(86400 * 6 * 30)
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN(1000))
            expect(await this.chef.viewEligibleAmount(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(500))
        })

        it("eligible amount to withdraw from multiple vaults 0, 6 and 9 after 9 month", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress })
            await this.chef.deposit(0, "200", "0", { from: userAddress2 })
            await this.chef.deposit(0, "300", "6", { from: userAddress2 })
            await this.chef.deposit(0, "500", "9", { from: userAddress2 })
            // After 270 days means 9 months
            time.increase(86400 * 9 * 30)
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN(1000))
            expect(await this.chef.viewEligibleAmount(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(1000))
        })

        it("withdraw the amount from multiple vaults 0, 6 and 9 just after deposit", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress })
            await this.chef.deposit(0, "200", "0", { from: userAddress2 })
            await this.chef.deposit(0, "300", "6", { from: userAddress2 })
            await this.chef.deposit(0, "500", "9", { from: userAddress2 })
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN(1000))
            expect(await this.chef.viewEligibleAmount(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(200))
            await this.chef.withdraw(0, true, { from: userAddress2 })
            // after 7 days
            time.increase(604800)
            await this.chef.withdraw(0, true, { from: userAddress2 })
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN(800))
        })

        it("withdraw the amount from multiple vaults 0, 6 and 9 after 6 months", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress })
            await this.chef.deposit(0, "200", "0", { from: userAddress2 })
            await this.chef.deposit(0, "300", "6", { from: userAddress2 })
            await this.chef.deposit(0, "500", "9", { from: userAddress2 })
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN(1000))
            // After 180 days means 6 months
            time.increase(86400 * 6 * 30)
            expect(await this.chef.viewEligibleAmount(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(500))
            await this.chef.withdraw(0, true, { from: userAddress2 })
            // after 7 days
            time.increase(86400 * 7)
            await this.chef.withdraw(0, true, { from: userAddress2 })
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN(500))
        })

        it("withdraw the amount from multiple vaults 0, 6 and 9 after 9 months", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress })
            await this.chef.deposit(0, "200", "0", { from: userAddress2 })
            await this.chef.deposit(0, "300", "6", { from: userAddress2 })
            await this.chef.deposit(0, "500", "9", { from: userAddress2 })
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN(1000))
            // After 270 days means 9 months
            time.increase(86400 * 9 * 30)
            expect(await this.chef.viewEligibleAmount(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(1000))
            await this.chef.withdraw(0, true, { from: userAddress2 })
            // after 7 days
            time.increase(604800)
            await this.chef.withdraw(0, true, { from: userAddress2 })
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN(0))
        })
    })


    describe("Reward and multipliers", function () {
        beforeEach(async function () {
            await this.lp.transfer(userAddress1, "1000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress2, "10000000000000000000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress3, "1000", { from: ownerAddress })

            await this.lp2.transfer(userAddress1, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress2, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress3, "1000", { from: ownerAddress })
        })

        //reward multipliers
        it("Reward multipliers for 12 month lockup Vault and staking score is greater then 800k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "800000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "800000000000000000000000", "12", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(25));
        })

        it("Reward multipliers for 12 month lockup Vault and staking score is greater then 300k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "700000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "700000000000000000000000", "12", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21));
        })

        it("Reward multipliers for 12 month lockup Vault and staking score is greater then 100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "200000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "200000000000000000000000", "12", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(20));
        })

        it("Reward multipliers for 12 month lockup Vault and staking score is less then 100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "100000", { from: userAddress2 })
            await this.chef.deposit(0, "100000", "12", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(18));
        })

        it("Reward multipliers for 9 month lockup Vault and staking score is greater then 800k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "800000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "800000000000000000000000", "9", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(16));
        })

        it("Reward multipliers for 9 month lockup Vault and staking score is greater then 300k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "700000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "700000000000000000000000", "9", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(16));
        })

        it("Reward multipliers for 9 month lockup Vault and staking score is greater then 100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "200000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "200000000000000000000000", "9", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(13));
        })

        it("Reward multipliers for 9 month lockup Vault and staking score is less then 100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "100000", { from: userAddress2 })
            await this.chef.deposit(0, "100000", "9", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(13));
        })

        it("Reward multipliers for 6 month lockup Vault and staking score is greater then 800k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "800000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "800000000000000000000000", "6", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(13));
        })

        it("Reward multipliers for 6 month lockup Vault and staking score is greater then 300k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "700000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "700000000000000000000000", "6", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(13));
        })

        it("Reward multipliers for 6 month lockup Vault and staking score is greater then 100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "200000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "200000000000000000000000", "6", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(11));
        })

        it("Reward multipliers for 6 month lockup Vault and staking score is less then 100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "100000", { from: userAddress2 })
            await this.chef.deposit(0, "100000", "6", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(11));
        })

        it("Reward multipliers for 0 month lockup Vault and staking score is greater then 800k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "900000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "900000000000000000000000", "0", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            let data  = await this.chef.stakingScore(0, userAddress2)
            console.log("Stakign score ", data.toString());
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(12));
        })

        it("Reward multipliers for 0 month lockup Vault and staking score is greater then 300k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "700000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "700000000000000000000000", "0", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(10));
        })

        it("Reward multipliers for 0 month lockup Vault and staking score is greater then 100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "200000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "200000000000000000000000", "0", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(10));
        })

        it("Reward multipliers for 0 month lockup Vault and staking score less then 100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "10000", { from: userAddress2 })
            await this.chef.deposit(0, "10000", "0", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(10));
        })

        it("Reward multipliers for multiple voults 6 and 9 and staking score less then 100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "100000", { from: userAddress2 })
            await this.chef.deposit(0, "10000", "6", { from: userAddress2 })
            await this.chef.deposit(0, "10000", "9", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(12));
        })

        it("Reward multipliers for multiple voults 6, 9, 12 and staking score less then 100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "100000", { from: userAddress2 })
            await this.chef.deposit(0, "10000", "6", { from: userAddress2 })
            await this.chef.deposit(0, "10000", "9", { from: userAddress2 })
            await this.chef.deposit(0, "10000", "12", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(14));
        })

        it("Reward multipliers for multiple voults 6, 9, 12 and staking score more then 100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "200000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "50000000000000000000000", "6", { from: userAddress2 })
            await this.chef.deposit(0, "50000000000000000000000", "9", { from: userAddress2 })
            await this.chef.deposit(0, "100000000000000000000000", "12", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(16));
        })

        it("Reward multipliers for multiple voults 6, 9, 12 and staking score more then 300k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "400000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "50000000000000000000000", "6", { from: userAddress2 })
            await this.chef.deposit(0, "50000000000000000000000", "9", { from: userAddress2 })
            await this.chef.deposit(0, "300000000000000000000000", "12", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(17));
        })

        it("Reward multipliers for multiple voults 6, 9, 12 and staking score more then 800k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.chef.addVault("9", { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "50000000000000000000000", "6", { from: userAddress2 })
            await this.chef.deposit(0, "50000000000000000000000", "9", { from: userAddress2 })
            await this.chef.deposit(0, "800000000000000000000000", "12", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            await this.chef.stakingScore(0, userAddress2, { from: userAddress2 })
            expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21));
        })

        it("Individual reward for every user decided from dao", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "100000000", { from: userAddress2 })
            await this.chef.deposit(0, "100000", "0", { from: userAddress2 })
            expect(await this.chef.distributeReward("0", "0", "1000", { from: ownerAddress }));
        })

        it("Flat reward for every user decided from dao", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "100000000", { from: userAddress2 })
            await this.chef.deposit(0, "100000", "0", { from: userAddress2 })
            expect(await this.chef.distributeReward("0", "1", "1000", { from: ownerAddress }));
        })

        it("TVL adjusted reward for every user decided from dao", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "100000000", { from: userAddress2 })
            await this.chef.deposit(0, "100000", "0", { from: userAddress2 })
            expect(await this.chef.distributeReward("0", "2", "1000", { from: ownerAddress }));
        })
    })

    describe("iToken staking reward distribution", function () {
        beforeEach(async function () {
            await this.chef.add(this.astra.address, { from: ownerAddress })
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.add(this.lp2.address, { from: ownerAddress })
            await this.chef.addVault(3, { from: ownerAddress, gas: 8000000 })
            await this.chef.addVault(12, { from: ownerAddress, gas: 8000000 })

            await this.astra.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.astra.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.astra.approve(this.chef.address, "1000000000000000000000000", { from: userAddress1 })
            await this.astra.approve(this.chef.address, "1000000000000000000000000", { from: userAddress2 })

            await this.lp.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000000000000000000000000", { from: userAddress1 })
            await this.lp.approve(this.chef.address, "1000000000000000000000000", { from: userAddress2 })

            await this.lp2.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.lp2.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.lp2.approve(this.chef.address, "1000000000000000000000000", { from: userAddress1 })
            await this.lp2.approve(this.chef.address, "1000000000000000000000000", { from: userAddress2 })
        })

        describe("iToken staking Individual reward distribution", function () {
            it("only dao contract can distribute individual reward", async function () {
                await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
                await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress2 })
                time.increase(86401)
                expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
                expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21))
                await expectRevert(this.chef.distributeReward(0, 0, "100000000000000000000", { from: userAddress1 }), "Ownable: caller is not the owner")
            })

            it("individual reward distribution", async function () {
                await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
                await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress2 })
                time.increase(86401)
                expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
                expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21))
                await this.chef.deposit(1, "100000000000000000000000", 12, { from: userAddress1 })
                await this.chef.deposit(1, "300000000000000000000000", 12, { from: userAddress2 })
                await this.chef.distributeReward(1, 0, "100000000000000000000", { from: ownerAddress })
                expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("24090000000000000481"))
                expect(await this.chef.viewRewardInfo(1, { from: userAddress2 })).to.be.bignumber.equal(new BN("75900000000000000759"))
            })
        })

        describe("iToken staking flat reward distribution", function () {
            it("only dao contract can distribute flat reward", async function () {
                await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
                await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress2 })
                time.increase(86401)
                expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
                expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21))
                await expectRevert(this.chef.distributeReward(0, 1, "100000000000000000000", { from: userAddress1 }), "Ownable: caller is not the owner")
            })

            it("flat reward distribution", async function () {
                await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
                await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress2 })
                time.increase(86401)
                expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
                expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21))
                await this.chef.deposit(1, "100000000000000000000000", 12, { from: userAddress1 })
                await this.chef.deposit(1, "300000000000000000000000", 12, { from: userAddress2 })
                await this.chef.deposit(2, "100000000000000000000000", 12, { from: userAddress1 })
                await this.chef.deposit(2, "300000000000000000000000", 12, { from: userAddress2 })
                await this.chef.distributeReward(0, 1, "100000000000000000000", { from: ownerAddress })
                expect(await this.chef.viewRewardInfo(0, { from: userAddress1 })).to.be.bignumber.equal(new BN("8030000000000001686"))
                expect(await this.chef.viewRewardInfo(0, { from: userAddress2 })).to.be.bignumber.equal(new BN("25300000000000004554"))
                expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("8030000000000000963"))
                expect(await this.chef.viewRewardInfo(1, { from: userAddress2 })).to.be.bignumber.equal(new BN("25300000000000002277"))
                expect(await this.chef.viewRewardInfo(2, { from: userAddress1 })).to.be.bignumber.equal(new BN("8030000000000000481"))
                expect(await this.chef.viewRewardInfo(2, { from: userAddress2 })).to.be.bignumber.equal(new BN("25300000000000000759"))
            })
        })

        describe("iToken staking TVL adjusted reward distribution", function () {
            it("only dao contract can distribute tvl adjusted reward", async function () {
                await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
                await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress2 })
                time.increase(86401)
                expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
                expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21))
                await expectRevert(this.chef.distributeReward(0, 0, "100000000000000000000", { from: userAddress1 }), "Ownable: caller is not the owner")
            })

            it("tvl adjusted reward distribution", async function () {
                await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
                await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress2 })
                time.increase(86401)
                expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
                expect(await this.chef.getRewardMultiplier(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(21))
                await this.chef.deposit(1, "100000000000000000000000", 12, { from: userAddress1 })
                await this.chef.deposit(1, "300000000000000000000000", 12, { from: userAddress2 })
                await this.chef.deposit(2, "100000000000000000000000", 12, { from: userAddress1 })
                await this.chef.deposit(2, "300000000000000000000000", 12, { from: userAddress2 })
                await this.chef.distributeReward(0, 2, "100000000000000000000", { from: ownerAddress })
                expect(await this.chef.viewRewardInfo(0, { from: userAddress1 })).to.be.bignumber.equal(new BN("8029197000000001686"))
                expect(await this.chef.viewRewardInfo(0, { from: userAddress2 })).to.be.bignumber.equal(new BN("25297470000000004554"))
                expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("8029197000000000963"))
                expect(await this.chef.viewRewardInfo(1, { from: userAddress2 })).to.be.bignumber.equal(new BN("25297470000000002277"))
                expect(await this.chef.viewRewardInfo(2, { from: userAddress1 })).to.be.bignumber.equal(new BN("8029197000000000481"))
                expect(await this.chef.viewRewardInfo(2, { from: userAddress2 })).to.be.bignumber.equal(new BN("25297470000000000759"))
            })
        })
    })

    describe("Block reward distribution", function () {
        beforeEach(async function () {
            await this.lp.transfer(userAddress1, "10000000", { from: ownerAddress })
            await this.lp.transfer(userAddress2, "10000000", { from: ownerAddress })
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "100000000", { from: userAddress1 })
            await this.lp.approve(this.chef.address, "100000000", { from: userAddress2 })
        })

        it("Update block reward by user", async function () {
            await this.chef.deposit("0", "100000", "12", { from: userAddress1 })
            expect(await this.chef.updateBlockReward("0", userAddress1, { from: userAddress1 }));
        })

        it("view block reward by user", async function () {
            await this.chef.deposit("0", "100000", "12", { from: userAddress1 })
            expect(await this.chef.viewRewardInfo("0", { from: userAddress1 }));
        })

        it("Distributing exit fee share", async function () {
            await this.chef.deposit("0", "100000", "12", { from: userAddress1 })
            expect(await this.chef.distributeExitFeeShare("100", { from: ownerAddress }));
        })
    })

    //test Highest staked user array Mapped

    describe("Check Highest Staked use", function () {
        beforeEach(async function () {
            await this.lp.transfer(userAddress1, "1000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress2, "1000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress3, "1000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress4, "1000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress5, "1000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress6, "1000000000", { from: ownerAddress })

            await this.lp2.transfer(userAddress1, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress2, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress3, "1000", { from: ownerAddress })
        })

        it("check status users staked", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress2 })
            await this.chef.deposit(0, "80000000", "12", { from: userAddress2 })
            expect(await this.chef.checkHighestStaker("0", userAddress2, { from: userAddress2 })).to.be.equal(true);
        })

        it("check status users staked after withhdraw", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000", { from: userAddress2 })
            await this.chef.deposit(0, "1000", "0", { from: userAddress2 })
            //on first withdra attempt cooldown period start
            await this.chef.withdraw(0, false, { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801)
            await this.astra.transfer(this.chef.address, "100000", { from: ownerAddress });
            await this.chef.withdraw(0, false, { from: userAddress2 })
            expect(await this.chef.checkHighestStaker("0", userAddress2, { from: userAddress2 })).to.be.equal(false);
        })

        it("Highest stake  after array Limit reached and update the lowest staked user", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress1 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress2 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress3 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress4 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress5 })
            await this.chef.deposit(0, "20000000", "12", { from: userAddress1 })
            await this.chef.deposit(0, "10000000", "12", { from: userAddress2 })
            await this.chef.deposit(0, "4000000", "12", { from: userAddress3 })
            await this.chef.deposit(0, "60000000", "12", { from: userAddress4 })
            await this.chef.deposit(0, "80000000", "12", { from: userAddress5 })
            expect(await this.chef.checkHighestStaker("0", userAddress5, { from: userAddress2 })).to.be.equal(true);
        })

        it("Lowest staked  user should replace with new highest staked amount", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress1 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress2 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress3 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress4 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress5 })
            await this.astra.transfer(this.chef.address, "100000000", { from: ownerAddress })
            await this.chef.deposit(0, "2000", "12", { from: userAddress1 })
            await this.chef.deposit(0, "1000", "12", { from: userAddress2 })
            await this.chef.deposit(0, "4000", "12", { from: userAddress3 })
            await this.chef.deposit(0, "6000", "12", { from: userAddress4 })
            await this.chef.deposit(0, "8000", "12", { from: userAddress5 })
            expect(await this.chef.checkHighestStaker("0", userAddress2, { from: userAddress2 })).to.be.equal(true);
        })

        it("Staker should be removed after withdrwal from single vault", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress1 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress2 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress3 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress4 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress5 })
            await this.astra.transfer(this.chef.address, "100000000", { from: ownerAddress })
            await this.chef.deposit(0, "2000", "0", { from: userAddress1 })
            await this.chef.deposit(0, "1000", "0", { from: userAddress2 })
            await this.chef.deposit(0, "4000", "0", { from: userAddress3 })
            await this.chef.deposit(0, "6000", "0", { from: userAddress4 })
            await this.chef.deposit(0, "8000", "0", { from: userAddress5 })
            
            await this.chef.withdraw(0, false, { from: userAddress1 })
            // after 7 days
            time.increase(604800)
            await this.chef.withdraw(0, false, { from: userAddress1 })
            expect(await this.chef.checkHighestStaker("0", userAddress1, { from: userAddress1 })).to.be.equal(false);
        })

        it("Staker should be not removed after partail withdrwal from multiple vault", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("0", { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress1 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress2 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress3 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress4 })
            await this.lp.approve(this.chef.address, "80000000", { from: userAddress5 })
            await this.astra.transfer(this.chef.address, "100000000", { from: ownerAddress })
            await this.chef.deposit(0, "2000", "0", { from: userAddress1 })
            await this.chef.deposit(0, "3000", "12", { from: userAddress1 })
            await this.chef.deposit(0, "1000", "0", { from: userAddress2 })
            await this.chef.deposit(0, "4000", "0", { from: userAddress3 })
            await this.chef.deposit(0, "6000", "0", { from: userAddress4 })
            await this.chef.deposit(0, "8000", "0", { from: userAddress5 })
            expect(await this.chef.viewEligibleAmount(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(2000))
            await this.chef.withdraw(0, false, { from: userAddress1 })
            // after 7 days
            time.increase(604800)
            await this.chef.withdraw(0, false, { from: userAddress1 })
            expect(await this.chef.checkHighestStaker("0", userAddress1, { from: userAddress1 })).to.be.equal(true);
        })
    })

    describe("Voting Power", function () {
        beforeEach(async function () {
            await this.lp.transfer(userAddress1, "1000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress2, "10000000000000000000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress3, "1000", { from: ownerAddress })

            await this.lp2.transfer(userAddress1, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress2, "1000", { from: ownerAddress })
            await this.lp2.transfer(userAddress3, "1000", { from: ownerAddress })
        })


        //reward multipliers
        it("Voting Power  for 12 month lockup Vault and staking score is  100k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "100000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "100000000000000000000000", "12", { from: userAddress2 })
            //time after 7 DAYS
            time.increase(604801);
            //get updated staking score after 1 days 
            expect(await this.chef.votingPower(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN("200000000000000000000000"));
        })

        //reward multipliers
        it("Voting Power  for 6 month lockup Vault and staking score is  500k", async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault("6", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "500000000000000000000000", { from: userAddress2 })
            await this.chef.deposit(0, "500000000000000000000000", "6", { from: userAddress2 })
            //time after 10 DAYS
            time.increase(864001);
            //get updated staking score after 1 days 
            expect(await this.chef.votingPower(0, userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN("216666666666666666666665"));
        })
    })

    describe("Claiming ASTR reward with or without staking by paying fee", function () {
        beforeEach(async function () {
            await this.chef.add(this.astra.address, { from: ownerAddress })
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.addVault(0, { from: ownerAddress, gas: 8000000 })
            await this.chef.addVault(3, { from: ownerAddress, gas: 8000000 })
            await this.chef.addVault(12, { from: ownerAddress, gas: 8000000 })

            await this.astra.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.astra.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.astra.approve(this.chef.address, "1000000000000000000000000", { from: userAddress1 })
            await this.astra.approve(this.chef.address, "1000000000000000000000000", { from: userAddress2 })

            await this.lp.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000000000000000000000000", { from: userAddress1 })
            await this.lp.approve(this.chef.address, "1000000000000000000000000", { from: userAddress2 })
        })

        it("Chef should have ASTRA while claiming ASTR reward without stake", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            time.increase(86401)
            expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.chef.deposit(1, "100000000000000000000000", 12, { from: userAddress1 })
            await this.chef.distributeReward(1, 0, "100000000000000000000", { from: ownerAddress })
            time.increase(86401)
            expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("100000000000000002000"))
            expect(await this.chef.withdrawASTRReward(1, false, { from: userAddress1 }), "Insufficient amount on lm pool contract")
        })

        it("Claiming ASTR reward without stake after 1 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            time.increase(86401)
            expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.chef.deposit(1, "100000000000000000000000", 12, { from: userAddress1 })
            await this.chef.distributeReward(1, 0, "100000000000000000000", { from: ownerAddress })
            time.increase(86401)
            expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("100000000000000002000"))
            expect(await this.astra.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("100000000000000000000000"))
            await this.astra.transfer(this.chef.address, "100000000000000010000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.chef.withdrawASTRReward(1, false, { from: userAddress1 });
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900011000000000000000000"))
        })

        it("Claiming ASTR reward without stake after 20 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            time.increase(86401)
            expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.chef.deposit(1, "100000000000000000000000", 12, { from: userAddress1 })
            await this.chef.distributeReward(1, 0, "100000000000000000000", { from: ownerAddress })
            time.increase(86400 * 20 + 1)
            expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("100000000000000002000"))
            expect(await this.astra.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("100000000000000000000000"))
            await this.astra.transfer(this.chef.address, "100000000000000010000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.chef.withdrawASTRReward(1, false, { from: userAddress1 });
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900030000000000000000000"))
        })

        it("Claiming ASTR reward without stake after 90 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            time.increase(86401)
            expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.chef.deposit(1, "100000000000000000000000", 12, { from: userAddress1 })
            await this.chef.distributeReward(1, 0, "100000000000000000000", { from: ownerAddress })
            time.increase(86400 * 90 + 1)
            expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("100000000000000002000"))
            expect(await this.astra.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("100000000000000000000000"))
            await this.astra.transfer(this.chef.address, "100000000000000010000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.chef.withdrawASTRReward(1, false, { from: userAddress1 });
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900100000000000000000000"))
        })

        it("Withdrawing staked amount and ASTR reward without stake after 1 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            time.increase(86401)
            expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.chef.deposit(1, "100000000000000000000000", 0, { from: userAddress1 })
            await this.chef.distributeReward(1, 0, "100000000000000000000", { from: ownerAddress })
            time.increase(86401)
            expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("100000000000000002000"))
            expect(await this.astra.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("100000000000000000000000"))
            await this.astra.transfer(this.chef.address, "1000000000000000100000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.chef.withdraw(1, false, { from: userAddress1 })
            // after 7 days
            time.increase(604800)
            await this.chef.withdraw(1, false, { from: userAddress1 })
            // After 8 days
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900018000000000000000000"))
            expect(await this.lp.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("1000000000000000000000000"))
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("0"))
        })

        it("Withdrawing staked amount and ASTR reward without stake after 20 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            time.increase(86401)
            expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.chef.deposit(1, "100000000000000000000000", 0, { from: userAddress1 })
            await this.chef.distributeReward(1, 0, "100000000000000000000", { from: ownerAddress })
            time.increase(86400 * 13 + 1)
            expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("100000000000000002000"))
            expect(await this.astra.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("100000000000000000000000"))
            await this.astra.transfer(this.chef.address, "1000000000000000100000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.chef.withdraw(1, false, { from: userAddress1 })
            // after 7 days
            time.increase(604800)
            await this.chef.withdraw(1, false, { from: userAddress1 })
            //After 13+7 = 20 days
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900030000000000000000000"))
            expect(await this.lp.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("1000000000000000000000000"))
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("0"))
        })

        it("Withdrawing staked amount and ASTR reward without stake after 90 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            time.increase(86401)
            expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.chef.deposit(1, "100000000000000000000000", 0, { from: userAddress1 })
            await this.chef.distributeReward(1, 0, "100000000000000000000", { from: ownerAddress })
            time.increase(86400 * 83 + 1)
            expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("100000000000000002000"))
            expect(await this.astra.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("100000000000000000000000"))
            await this.astra.transfer(this.chef.address, "1000000000000000100000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.chef.withdraw(1, false, { from: userAddress1 })
            // after 7 days
            time.increase(604800)
            await this.chef.withdraw(1, false, { from: userAddress1 })
            // after 83+7 = 90 days
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900100000000000000000000"))
            expect(await this.lp.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("1000000000000000000000000"))
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("0"))
        })

        it("Claiming ASTR reward with staking in astra pool", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            time.increase(86401)
            expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.chef.deposit(1, "100000000000000000000000", 12, { from: userAddress1 })
            await this.chef.distributeReward(1, 0, "100000000000000000000", { from: ownerAddress })
            expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("100000000000000001000"))
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.chef.withdrawASTRReward(1, true, { from: userAddress1 });
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
        })

        it("Withdrawing staked amount and ASTR reward without stake after 1 day", async function () {
            await this.chef.deposit(0, "100000000000000000000000", 12, { from: userAddress1 })
            time.increase(86401)
            expect(await this.chef.getRewardMultiplier(0, userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20))
            await this.chef.deposit(1, "100000000000000000000000", 0, { from: userAddress1 })
            await this.chef.distributeReward(1, 0, "100000000000000000000", { from: ownerAddress })
            time.increase(86401)
            expect(await this.chef.viewRewardInfo(1, { from: userAddress1 })).to.be.bignumber.equal(new BN("100000000000000002000"))
            expect(await this.astra.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("100000000000000000000000"))
            await this.astra.transfer(this.chef.address, "1000000000000000100000", { from: ownerAddress })
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            await this.chef.withdraw(1, true, { from: userAddress1 })
            // after 7 days
            time.increase(604800)
            await this.chef.withdraw(1, true, { from: userAddress1 })
            // After 8 days
            expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("900000000000000000000000"))
            expect(await this.lp.balanceOf(userAddress1)).to.be.bignumber.equal(new BN("1000000000000000000000000"))
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("0"))
        })
    })

    describe("premium payout integration", function () {
        beforeEach(async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.add(this.astra.address, { from: ownerAddress })
            await this.chef.addVault("3", { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })

            await this.lp.transfer(userAddress1, "1000000000000000000000000", { from: ownerAddress })
            await this.lp.transfer(userAddress2, "1000000000000000000000000", { from: ownerAddress })
            await this.lp.approve(this.chef.address, "1000000000000000000000000", { from: userAddress1 })
            await this.lp.approve(this.chef.address, "1000000000000000000000000", { from: userAddress2 })
        })

        it("check premium payout values", async function () {
            await this.chef.deposit("0", "800000000000000000000000", 12, { from: userAddress1 })
            await this.chef.deposit("0", "300000000000000000000000", 12, { from: userAddress2 })
            time.increase(86401)
            expect(await this.chef.getPremiumPayoutBonus("0", userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20));
            expect(await this.chef.getPremiumPayoutBonus("0", userAddress2, { from: userAddress2 })).to.be.bignumber.equal(new BN(10));
        })

        it("deposit from DAA with no premium payout", async function () {
            await this.chef.setDaaAddress(userAddress1, { from: ownerAddress })
            time.increase(86401)
            expect(await this.chef.getPremiumPayoutBonus("0", userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(0));
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("0"));
            await this.chef.depositFromDaaAndDAO("0", "1000000000000000000000", "3", userAddress1, false, { from: userAddress1 });
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("1000000000000000000000"));
        })

        it("deposit from DAA with premium payout with premium option", async function () {
            await this.chef.setDaaAddress(userAddress1, { from: ownerAddress })
            await this.chef.deposit(0, "300000000000000000000000", 12, { from: userAddress1 })
            time.increase(86401)
            expect(await this.chef.getPremiumPayoutBonus("0", userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(10));
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("300000000000000000000000"));
            await this.chef.depositFromDaaAndDAO("0", "1000000000000000000000", "3", userAddress1, true, { from: userAddress1 });
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("301000000000000000000000"));
        })

        it("deposit from DAA with premium payout without premium option", async function () {
            await this.chef.setDaaAddress(userAddress1, { from: ownerAddress })
            await this.chef.deposit(0, "800000000000000000000000", 12, { from: userAddress1 })
            time.increase(86401)
            expect(await this.chef.getPremiumPayoutBonus("0", userAddress1, { from: userAddress1 })).to.be.bignumber.equal(new BN(20));
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("800000000000000000000000"));
            await this.chef.depositFromDaaAndDAO("0", "1000000000000000000000", "3", userAddress1, false, { from: userAddress1 });
            expect(await this.lp.balanceOf(this.chef.address)).to.be.bignumber.equal(new BN("801000000000000000000000"));
        })
    })

    describe("setting lm pool address", function () {
        beforeEach(async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.add(this.astra.address, { from: ownerAddress })
            await this.chef.addVault("3", { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
        })

        it("should not set the lm pool address except owner", async function () {
            await expectRevert(this.chef.setLmPoolAddress(userAddress1, { from: userAddress2 }), "Ownable: caller is not the owner");
        })

        it("should set the lm pool address", async function () {
            await this.chef.setLmPoolAddress(userAddress1, { from: ownerAddress })
            expect(await this.chef.lmpooladdr()).to.be.equal(userAddress1);
        });
    })

    describe("setting DAO address", function () {
        beforeEach(async function () {
            await this.chef.add(this.lp.address, { from: ownerAddress })
            await this.chef.add(this.astra.address, { from: ownerAddress })
            await this.chef.addVault("3", { from: ownerAddress })
            await this.chef.addVault("12", { from: ownerAddress })
        })

        it("should not set the DAO address except owner", async function () {
            await expectRevert(this.chef.setDaoAddress(userAddress1, { from: userAddress2 }), "Ownable: caller is not the owner");
        })

        it("should set the DAO address", async function () {
            await this.chef.setDaoAddress(userAddress1, { from: ownerAddress })
            expect(await this.chef.daoAddress()).to.be.equal(userAddress1);
        });
    })
})