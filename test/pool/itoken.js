const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;

const decimal = new BN(18);
const oneether = (new BN(10)).pow(decimal);

const Itoken = contract.fromArtifact('itoken');
const Ideployer = contract.fromArtifact('itokendeployer');

describe('Itoken', function () {
    const [ ownerAddress, userAddress1, userAddress2, userAddress3 ] = accounts;
    beforeEach(async function() {
        this.ideployer = await Ideployer.new({from: ownerAddress, gas: 8000000});
    })
    describe("Check Permission",function(){
        it("Should revert Create Token if called from other than DAA",async function(){
            await expectRevert(this.ideployer.createnewitoken("Test Token", "ITEST",{from: userAddress1}),"Only DAA contract can call");
        })

        it("Should add DAA address if called from owner ",async function(){
            await this.ideployer.addDaaAdress(userAddress3,{from: ownerAddress});
            expect(await this.ideployer.daaaddress()).to.be.equal(userAddress3);
        })

        it("Should revert add DAA address if called from other than owner ",async function(){
            await expectRevert(this.ideployer.addDaaAdress(userAddress3,{from: userAddress1}),"Only owner call");
        })

       
    })

    describe("Check contract deployment",function(){
        beforeEach(async function() {
            await this.ideployer.addDaaAdress(userAddress3,{from: ownerAddress});
            await this.ideployer.createnewitoken("Test Token", "ITEST",{from: userAddress3})
            var DeployedItoken = await this.ideployer.getcoin(0);
            this.itoken = await Itoken.at(DeployedItoken);
        })

        describe("Testing itoken contract", function () {
            describe("Checking Initial supply", function () {
                it("Should have correct initial supply", async function () {
                    expect(await this.itoken.totalSupply()).to.be.bignumber.equal(new BN(0));
                })
                it("Account 1 should have 0 supply", async function () {
                    expect(await this.itoken.balanceOf(ownerAddress)).to.be.bignumber.equal(new BN(0));
                })
                it("Account 2 should have 0 supply", async function () {
                    expect(await this.itoken.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(0));
                })
                it("Initial allowance should be proper", async function () {
                    expect(await this.itoken.allowance(ownerAddress, userAddress1)).to.be.bignumber.equal(new BN(0));
                })
            })
            describe("Checking Initial permission", function () {
                it("Should not mint new tokens", async function () {
                    const address = userAddress1;
                    // await this.itoken.mintNewTokens(address, totalSupply, { from: ownerAddress });
                    await expectRevert(this.itoken.mint(address,1000,{from:ownerAddress}),"itoken::mint:Only daa can mint");
                })
            })
    
            describe("Transfer functionality ", function () {
                beforeEach(async function () {
                    await this.itoken.mint(ownerAddress, (new BN(100000).mul(oneether)), {from:userAddress3});
                });
    
                it("Tranfer from Account 1 to Account 2", async function () {
                    await this.itoken.transfer(userAddress3, (new BN(50000).mul(oneether)), { from: ownerAddress })
                    expect(await this.itoken.balanceOf(ownerAddress)).to.be.bignumber.equal((new BN(50000).mul(oneether)));
                })

                it("Should not transfer to other than shortlisted address", async function () {
                   await  expectRevert(this.itoken.transfer(userAddress2, (new BN(50000).mul(oneether)), { from: ownerAddress }),"itoken::transfer: Can only be traded with DAA pool/chef")
                })

                it("Account 1 balance should be increased", async function () {
                    await this.itoken.transfer(userAddress3, (new BN(50000).mul(oneether)), { from: ownerAddress })
                    expect(await this.itoken.balanceOf(userAddress3)).to.be.bignumber.equal((new BN(50000).mul(oneether)));
                })
                it("Transfer from Account 1 to Account 2", async function () {
                    await this.itoken.transfer(userAddress3, (new BN(50000).mul(oneether)), { from: ownerAddress })
                    await this.itoken.transfer(ownerAddress, (new BN(50000).mul(oneether)), { from: userAddress3 })
                    expect(await this.itoken.balanceOf(ownerAddress)).to.be.bignumber.equal((new BN(100000).mul(oneether)));
                })
                it("Account 1 balance should be decreased", async function () {
                    await this.itoken.transfer(userAddress3, (new BN(50000).mul(oneether)), { from: ownerAddress })
                    await this.itoken.transfer(ownerAddress, (new BN(50000).mul(oneether)), { from: userAddress3 })
                    expect(await this.itoken.balanceOf(userAddress3)).to.be.bignumber.equal(new BN(0));
                })
            })
            describe("Transfer from", function () {
                beforeEach(async function () {
                    await this.itoken.mint(ownerAddress, (new BN(100000).mul(oneether)), {from:userAddress3});
                });
                it("WithOut Approve", async function () {
                    await expectRevert(this.itoken.transferFrom(ownerAddress, userAddress3,1000,{from:ownerAddress}),"ERC20: transfer amount exceeds allowance");
                })
                it("Tranfer from Account 1 to Account 2", async function () {
                    await this.itoken.approve(userAddress3, (new BN(50000).mul(oneether)), { from: ownerAddress });
                    await this.itoken.transferFrom(ownerAddress, userAddress3, (new BN(50000).mul(oneether)), { from: userAddress3 })
                    expect(await this.itoken.balanceOf(ownerAddress)).to.be.bignumber.equal((new BN(50000).mul(oneether)));
                })
                it("Account 1 balance should be increased", async function () {
                    await this.itoken.approve(userAddress3, (new BN(50000).mul(oneether)), { from: ownerAddress });
                    await this.itoken.transferFrom(ownerAddress, userAddress3, (new BN(50000).mul(oneether)), { from: userAddress3 })
                    expect(await this.itoken.balanceOf(userAddress3)).to.be.bignumber.equal((new BN(50000).mul(oneether)));
                })
                it("Tranfer from Account 1 to Account 2", async function () {
                    await this.itoken.approve(ownerAddress, (new BN(50000).mul(oneether)), { from: userAddress3 });
                    await this.itoken.approve(userAddress3, (new BN(50000).mul(oneether)), { from: ownerAddress });
                    await this.itoken.transferFrom(ownerAddress, userAddress3, (new BN(50000).mul(oneether)), { from: userAddress3 })
                    await this.itoken.transferFrom(userAddress3, ownerAddress, (new BN(50000).mul(oneether)), { from: ownerAddress })
                    expect(await this.itoken.balanceOf(ownerAddress)).to.be.bignumber.equal((new BN(100000).mul(oneether)));
                })
                it("Account 1 balance should be decreased", async function () {
                    await this.itoken.approve(ownerAddress, (new BN(50000).mul(oneether)), { from: userAddress3 });
                    await this.itoken.approve(userAddress3, (new BN(50000).mul(oneether)), { from: ownerAddress });
                    await this.itoken.transferFrom(ownerAddress, userAddress3, (new BN(50000).mul(oneether)), { from: userAddress3 })
                    await this.itoken.transferFrom(userAddress3, ownerAddress, (new BN(50000).mul(oneether)), { from: ownerAddress })
                    expect(await this.itoken.balanceOf(userAddress3)).to.be.bignumber.equal(new BN(0));
                })
            })
    
            describe("Approve/Allowance", function () {
                beforeEach(async function () {
                    await this.itoken.mint(ownerAddress, 1000000, {from:userAddress3});
                });
                it("Initial allowance will be 0", async function () {
                    expect(await this.itoken.allowance(ownerAddress, userAddress2)).to.be.bignumber.equal(new BN(0));
                });
    
                it("Allowance increase when approve", async function () {
                    await this.itoken.approve(userAddress2, 500, {from:ownerAddress});
                    expect(await this.itoken.allowance(ownerAddress, userAddress2)).to.be.bignumber.equal(new BN(500));
                });
    
                it("Increase Allowance", async function () {
                    await this.itoken.increaseAllowance(userAddress2, 500, {from:ownerAddress});
                    expect(await this.itoken.allowance(ownerAddress, userAddress2)).to.be.bignumber.equal(new BN(500));
                });
    
                it("Decrease Allowance", async function () {
                    await this.itoken.approve(userAddress2, 500, {from:ownerAddress});
                    await this.itoken.decreaseAllowance(userAddress2, 500, {from:ownerAddress});
                    expect(await this.itoken.allowance(ownerAddress, userAddress2)).to.be.bignumber.equal(new BN(0));
                });
    
                it("Allowance will be 0 of tx account", async function () {
                    await this.itoken.approve(userAddress2, 500, {from:ownerAddress});
                    expect(await this.itoken.allowance(userAddress2, ownerAddress)).to.be.bignumber.equal(new BN(0));
                });
    
                it("TranferFrom failed without allowance", async function () {
                    await expectRevert(this.itoken.transferFrom(ownerAddress, userAddress3, 500, {from:userAddress2}), "ERC20: transfer amount exceeds allowance");
                });
    
                it("TranferFrom with allowance", async function () {
                    await this.itoken.approve(userAddress2, 500, {from:ownerAddress});
                    expect(await this.itoken.allowance(ownerAddress, userAddress2)).to.be.bignumber.equal(new BN(500));
    
                    await this.itoken.transferFrom(ownerAddress, userAddress3, 500, {from:userAddress2});
                    expect(await this.itoken.allowance(ownerAddress, userAddress3)).to.be.bignumber.equal(new BN(0));
    
                    expect(await this.itoken.balanceOf(userAddress3)).to.be.bignumber.equal(new BN(500));
                });
            })
    
            describe("Minting", function () {
                it("Without Minter", async function () {
                    await expectRevert(this.itoken.mint(userAddress2, 100000000000), "itoken::mint:Only daa can mint");
                });
                it("Mint new token from minter", async function () {
                    await this.itoken.mint(userAddress2, 1000000, {from:userAddress3});
                    expect(await this.itoken.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(1000000));
                });
            })
    
            describe("Burn", function () {
                beforeEach(async function () {
                    await this.itoken.mint(userAddress2, 1000, {from:userAddress3});
                });

                it("Without Daa", async function () {
                    await expectRevert(this.itoken.burn(userAddress2, 1000), "itoken::burn:Only daa can burn");
                });
                it("Burn with insufficient amount", async function () {
                    await expectRevert(this.itoken.burn(userAddress2, 1000000000, {from:userAddress3}), "ERC20: burn amount exceeds balance");
                });
    
                it("Burn success", async function () {    
                    await this.itoken.burn(userAddress2, 600, {from:userAddress3});
                    expect(await this.itoken.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(400));
                });
            })
        })

    })

})

