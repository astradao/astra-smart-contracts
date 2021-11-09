const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;
const Astrsample = contract.fromArtifact('Token');
const TransferHandler = contract.fromArtifact('MockTransferHandler');

const {
    address,
    minerStart,
    minerStop,
    unlockedAccount,
    mineBlock
} = require('../../Util/Ethereum');
const EIP712 = require('../../Util/EIP712');

const zeroaddress = "0x0000000000000000000000000000000000000000";
const decimal = new BN(18);
const oneether = (new BN(10)).pow(decimal);
const totalSupply = (new BN(1000000000)).mul(oneether)

describe('Initializing', function () {
    const [ownerAddress, userAddress1, userAddress2, userAddress3] = accounts;
    const [ownerPrivateKey, address1PrivateKey, address2PrivateKey, address3PrivateKey] = privateKeys;

    beforeEach(async function () {
        this.astra = await Astrsample.new({ from: ownerAddress, gas: 8000000 });
        await this.astra.initialize(ownerAddress, { from: ownerAddress });
        this.handler = await TransferHandler.new({ from: ownerAddress, gas: 8000000 });
    });

    describe("Astra pausable functionality", function () {
        beforeEach(async function () {
            await this.astra.setTransferHandler(this.handler.address, { from: ownerAddress });
        });
        describe("Checking inital conditions",function(){
            it("Should be able to transfer tokens", async function () {
                await this.astra.transfer(userAddress1, (new BN(500).mul(oneether)), { from: ownerAddress })
                expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal((new BN(500).mul(oneether)));
            });
            it("Only owner can set the timelock address", async function () {
                await expectRevert(this.astra.SetTimelock(ownerAddress,{from:userAddress1}),"Ownable: caller is not the owner");
            }); 
            it("Should not pause the contract", async function () {
                await expectRevert(this.astra.pauseToken({from:ownerAddress}),"pauseToken: Only timelock can call");
            });  
        })
        describe("Checking Time lock functionality",function(){
            it("Only owner can set the timelock address", async function () {
                await expectRevert(this.astra.SetTimelock(ownerAddress,{from:userAddress1}),"Ownable: caller is not the owner");
            }); 
            it("Should not pause the contract", async function () {
                await expectRevert(this.astra.pauseToken({from:ownerAddress}),"pauseToken: Only timelock can call");
            }); 
            it("Shoud revert if same address is passed",async function(){
                await this.astra.SetTimelock(userAddress1,{from: ownerAddress});
                await expectRevert(this.astra.SetTimelock(userAddress1,{from: ownerAddress}),"SetTimelock: Already Timelock");
            })
            it("Should be able to pause tokens", async function () {
                await this.astra.SetTimelock(userAddress1,{from: ownerAddress});
                await this.astra.pauseToken({from:userAddress1})
                expect(await this.astra.paused()).to.be.equal(true);
            }); 
        })
        describe("Checking Pause condition",function(){
            beforeEach(async function () {
                await this.astra.SetTimelock(userAddress1,{from: ownerAddress});
            });
            it("Should be able to pause tokens", async function () {
                await this.astra.pauseToken({from:userAddress1})
                expect(await this.astra.paused()).to.be.equal(true);
            });
            it("Should Revert the transaction after revert", async function () {
                await this.astra.pauseToken({from:userAddress1})
                await expectRevert(this.astra.transfer(userAddress1, (new BN(50000).mul(oneether)), { from: ownerAddress }),"Transfer: Token is paused");
            }); 
            it("Should Revert if pause is called more then once", async function () {
                await this.astra.pauseToken({from:userAddress1})
                await expectRevert(this.astra.pauseToken({from:userAddress1}),"pauseToken: Already paused");
            });  
        })
        describe("Checking unpause condition",function(){
            beforeEach(async function () {
                await this.astra.SetTimelock(userAddress1,{from: ownerAddress});
                await this.astra.pauseToken({from:userAddress1})
            });
            it("Should be able to unpause tokens", async function () {
                await this.astra.unpauseToken({from:userAddress1})
                expect(await this.astra.paused()).to.be.equal(false);
            });
            it("Should transfer the tokens now", async function () {
                await this.astra.unpauseToken({from:userAddress1})
                await this.astra.transfer(userAddress1, (new BN(500).mul(oneether)), { from: ownerAddress })
                expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal((new BN(500).mul(oneether)));
            }); 
            it("Should Revert if unpause is called more then once", async function () {
                await this.astra.unpauseToken({from:userAddress1})
                await expectRevert(this.astra.unpauseToken({from:userAddress1}),"unpauseToken: Already unpaused");
            });  
        })
    });

    describe("Testing Astra contract", function () {
        describe("Checking Initial supply", function () {
            it("Should have correct initial supply", async function () {
                expect(await this.astra.totalSupply()).to.be.bignumber.equal(totalSupply);
            })
            it("Account 1 should have all supply", async function () {
                expect(await this.astra.balanceOf(ownerAddress)).to.be.bignumber.equal(totalSupply);
            })
            it("Account 2 should have 0 supply", async function () {
                expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(0));
            })
            it("Initial allowance should be proper", async function () {
                expect(await this.astra.allowance(ownerAddress, userAddress1)).to.be.bignumber.equal(new BN(0));
            })
        })
        describe("Checking Initial permission", function () {
            it("Should not mint new tokens", async function () {
                const address = userAddress1;
                // await this.astra.mintNewTokens(address, totalSupply, { from: ownerAddress });
                await expectRevert(this.astra.mintNewTokens(address,1000,{from:ownerAddress}),"Call must come from Timelock");
            })
            it("Initial Timelock should be 0x", async function () {
                expect(await this.astra.transferHandler()).to.be.equal(zeroaddress);
            })
        })

        describe("Configuring Astra contract", function () {
            it("Set the address of Transfer Handler", async function () {
                await this.astra.setTransferHandler(this.handler.address, { from: ownerAddress });
                expect(await this.astra.transferHandler()).to.be.equal(this.handler.address);
            });
            it("Set minter", async function () {
                await this.astra.setMinter(ownerAddress, { from: ownerAddress });
                expect(await this.astra.minter(ownerAddress)).to.be.equal(true);
            });
        });

        describe("Transfer functionality ", function () {
            beforeEach(async function () {
                await this.astra.setTransferHandler(this.handler.address, { from: ownerAddress });
            });

            it("Tranfer from Account 1 to Account 2", async function () {
                await this.astra.transfer(userAddress1, (new BN(50000).mul(oneether)), { from: ownerAddress })
                expect(await this.astra.balanceOf(ownerAddress)).to.be.bignumber.equal((new BN(999950000).mul(oneether)));
            })
            it("Account 1 balance should be increased", async function () {
                await this.astra.transfer(userAddress1, (new BN(50000).mul(oneether)), { from: ownerAddress })
                expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal((new BN(50000).mul(oneether)));
            })
            it("Tranfer from Account 1 to Account 2", async function () {
                await this.astra.transfer(userAddress1, (new BN(50000).mul(oneether)), { from: ownerAddress })
                await this.astra.transfer(ownerAddress, (new BN(50000).mul(oneether)), { from: userAddress1 })
                expect(await this.astra.balanceOf(ownerAddress)).to.be.bignumber.equal(totalSupply);
            })
            it("Account 1 balance should be decreased", async function () {
                await this.astra.transfer(userAddress1, (new BN(50000).mul(oneether)), { from: ownerAddress })
                await this.astra.transfer(ownerAddress, (new BN(50000).mul(oneether)), { from: userAddress1 })
                expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(0));
            })
        })
        describe("Transfer from", function () {
            beforeEach(async function () {
                await this.astra.setTransferHandler(this.handler.address, { from: ownerAddress });
            });
            it("WithOut Approve", async function () {
                await expectRevert(this.astra.transferFrom(ownerAddress, userAddress1,1000,{from:ownerAddress}),"ERC20: transfer amount exceeds allowance");
            })
            it("Tranfer from Account 1 to Account 2", async function () {
                await this.astra.approve(userAddress1, (new BN(50000).mul(oneether)), { from: ownerAddress });
                await this.astra.transferFrom(ownerAddress, userAddress1, (new BN(50000).mul(oneether)), { from: userAddress1 })
                expect(await this.astra.balanceOf(ownerAddress)).to.be.bignumber.equal((new BN(999950000).mul(oneether)));
            })
            it("Account 1 balance should be increased", async function () {
                await this.astra.approve(userAddress1, (new BN(50000).mul(oneether)), { from: ownerAddress });
                await this.astra.transferFrom(ownerAddress, userAddress1, (new BN(50000).mul(oneether)), { from: userAddress1 })
                expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal((new BN(50000).mul(oneether)));
            })
            it("Tranfer from Account 1 to Account 2", async function () {
                await this.astra.approve(ownerAddress, (new BN(50000).mul(oneether)), { from: userAddress1 });
                await this.astra.approve(userAddress1, (new BN(50000).mul(oneether)), { from: ownerAddress });
                await this.astra.transferFrom(ownerAddress, userAddress1, (new BN(50000).mul(oneether)), { from: userAddress1 })
                await this.astra.transferFrom(userAddress1, ownerAddress, (new BN(50000).mul(oneether)), { from: ownerAddress })
                expect(await this.astra.balanceOf(ownerAddress)).to.be.bignumber.equal(totalSupply);
            })
            it("Account 1 balance should be decreased", async function () {
                await this.astra.approve(ownerAddress, (new BN(50000).mul(oneether)), { from: userAddress1 });
                await this.astra.approve(userAddress1, (new BN(50000).mul(oneether)), { from: ownerAddress });
                await this.astra.transferFrom(ownerAddress, userAddress1, (new BN(50000).mul(oneether)), { from: userAddress1 })
                await this.astra.transferFrom(userAddress1, ownerAddress, (new BN(50000).mul(oneether)), { from: ownerAddress })
                expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal(new BN(0));
            })
        })

        describe("Approve/Allowance", function () {
            beforeEach(async function () {
                await this.astra.setTransferHandler(this.handler.address, { from: ownerAddress });
            });
            it("Initial allowance will be 0", async function () {
                expect(await this.astra.allowance(ownerAddress, userAddress2)).to.be.bignumber.equal(new BN(0));
            });

            it("Allowance increase when approve", async function () {
                await this.astra.approve(userAddress2, 500, {from:ownerAddress});
                expect(await this.astra.allowance(ownerAddress, userAddress2)).to.be.bignumber.equal(new BN(500));
            });

            it("Increase Allowance", async function () {
                await this.astra.increaseAllowance(userAddress2, 500, {from:ownerAddress});
                expect(await this.astra.allowance(ownerAddress, userAddress2)).to.be.bignumber.equal(new BN(500));
            });

            it("Decrease Allowance", async function () {
                await this.astra.approve(userAddress2, 500, {from:ownerAddress});
                await this.astra.decreaseAllowance(userAddress2, 500, {from:ownerAddress});
                expect(await this.astra.allowance(ownerAddress, userAddress2)).to.be.bignumber.equal(new BN(0));
            });

            it("Allowance will be 0 of tx account", async function () {
                await this.astra.approve(userAddress2, 500, {from:ownerAddress});
                expect(await this.astra.allowance(userAddress2, ownerAddress)).to.be.bignumber.equal(new BN(0));
            });

            it("TranferFrom failed without allowance", async function () {
                await expectRevert(this.astra.transferFrom(ownerAddress, userAddress1, 100000000000, {from:ownerAddress}), "ERC20: transfer amount exceeds allowance");
            });

            it("TranferFrom with allowance", async function () {
                await this.astra.approve(userAddress2, 500, {from:ownerAddress});
                expect(await this.astra.allowance(ownerAddress, userAddress2)).to.be.bignumber.equal(new BN(500));

                await this.astra.transferFrom(ownerAddress, userAddress2, 500, {from:userAddress2});
                expect(await this.astra.allowance(ownerAddress, userAddress2)).to.be.bignumber.equal(new BN(0));

                expect(await this.astra.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(500));
            });
        })

        describe("Minting", function () {
            it("Without Minter", async function () {
                await expectRevert(this.astra.mintNewTokens(userAddress2, 100000000000), "Call must come from Timelock");
            });

            it("Set minter without owner", async function () {
                await expectRevert(this.astra.setMinter(userAddress2, {from:userAddress2}), "Ownable: caller is not the owner");
            });

            it("Set minter with owner", async function () {
                await this.astra.setMinter(userAddress2, {from:ownerAddress});
                expect(await this.astra.minter(userAddress2)).to.be.equal(true);
            });

            it("Mint new token from minter", async function () {
                await this.astra.setMinter(userAddress2, {from:ownerAddress});
                await this.astra.mintNewTokens(userAddress2, 1000000, {from:userAddress2});

                expect(await this.astra.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(1000000));
            });
        })

        describe("Burn", function () {
            beforeEach(async function () {
                await this.astra.setTransferHandler(this.handler.address, { from: ownerAddress });
            });
            it("Burn with insufficient amount", async function () {
                await expectRevert(this.astra.burn(1000000000, {from:userAddress2}), "ERC20: burn amount exceeds balance");
            });

            it("Burn success", async function () {
                await this.astra.transfer(userAddress2, 500, { from: ownerAddress })

                await this.astra.burn(100, {from:userAddress2});
                expect(await this.astra.balanceOf(userAddress2)).to.be.bignumber.equal(new BN(400));
            });
        })

        describe("Set Transfer Handler address", function () {
            it("Set Transfer Handler without owner", async function () {
                await expectRevert(this.astra.setTransferHandler(userAddress2, {from:userAddress2}), "Ownable: caller is not the owner");
            });

            it("Set TransferHandler with owner", async function () {
                await this.astra.setTransferHandler(userAddress2, {from:ownerAddress});
                expect(await this.astra.transferHandler()).to.be.equal(userAddress2);
            });
        })
    })

})

