const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;
const Astrsample = contract.fromArtifact('Token');
const Timelock = contract.fromArtifact('TimelockMock');
const Governance = contract.fromArtifact('GovernorAlphaMock');
const TransferHandler = contract.fromArtifact('MockTransferHandler');
// const TopHolders = contract.fromArtifact('MockTopHolder');
const MasterChef = contract.fromArtifact('MasterChef');
const TestERC20 = contract.fromArtifact('TESTERC20');
const decimal = new BN(18);
const oneether = (new BN(10)).pow(decimal);
const totalSupply = (new BN(100000)).mul(oneether)

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
describe('Governance', function () {
    const [ ownerAddress, userAddress1, userAddress2, userAddress3 ] = accounts;
    beforeEach(async function() {
        this.weth =  await TestERC20.new("Weth", "WETH",18,{from: ownerAddress, gas: 8000000})
        this.lp = await TestERC20.new("LPToken", "LP",18, {from: ownerAddress, gas: 8000000});
        // console.log("Weth address ",this.weth.address);
        this.astra = await Astrsample.new("Astra", "ASTR",ownerAddress, {from: ownerAddress, gas: 8000000});
        await this.astra.initialize( ownerAddress, { from: ownerAddress });
        // console.log("Astra address ",this.astra.address);
        // this.toptrader = await TopHolders.new("Tholder", "HOLDER",this.weth.address, {from: ownerAddress, gas: 8000000});
        // console.log("Top trader adress ",this.toptrader.address);
        this.timelock = await Timelock.new(ownerAddress,120,{from: ownerAddress, gas: 8000000});
        // console.log("Time lock address ",this.timelock.address);

        this.chef = await MasterChef.new({from: ownerAddress, gas: 8000000});
        await this.chef.initialize(this.astra.address, ownerAddress, "1000", "0", "1000", {from: ownerAddress, gas: 8000000});
        await this.chef.add(this.astra.address,{ from: ownerAddress })
        await this.chef.addVault("0", { from: ownerAddress });
        await this.chef.addVault("6", { from: ownerAddress });
        this.govern = await Governance.new(this.timelock.address,this.astra.address,{from: ownerAddress, gas: 8000000});
        await this.govern.initialize(this.timelock.address,this.astra.address,this.chef.address,{from: ownerAddress, gas: 8000000});
        await this.chef.setDaoAddress(this.govern.address, { from: ownerAddress });
        // console.log("Governance address ",this.govern.address);
        this.transferHandler = await TransferHandler.new(this.astra.address,{from: ownerAddress, gas: 8000000}); 
        // console.log("Transfer Handler ",this.transferHandler.address);     
    });
    describe("Configuring Astra contract", function(){
         beforeEach(async function () {
            await this.astra.setTransferHandler(this.transferHandler.address,{from:ownerAddress});
            const transferValue = (new BN(100)).mul(oneether);
            await this.astra.transfer(userAddress1, transferValue, { from: ownerAddress })
            await this.astra.setMinter(ownerAddress,{from:ownerAddress});
            var amount= (new BN(30)).mul(oneether);
            await this.astra.mintNewTokens(userAddress1,amount,{from:ownerAddress});
            await this.timelock.setPendingAdmin(this.govern.address,{from:ownerAddress});
            await this.govern._acceptAdmin({from:ownerAddress});
            await this.astra.mintNewTokens(userAddress2,amount,{from:ownerAddress});
          })
          describe("Check configuration of contracts ",function(){
            it("Transfer handler address updated successfully",async function(){
                expect(await this.astra.transferHandler()).to.be.equal(this.transferHandler.address);
            });
            it("Minter updated successfully",async function(){ 
                expect(await this.astra.minter(ownerAddress)).to.be.equal(true);
              });
              it("New tokens minted successfully",async function(){   
                expect(await this.astra.balanceOf(userAddress1)).to.be.bignumber.equal((new BN(130)).mul(oneether));
              });
          });

          describe("Test new Voting Acceptance ",function(){
            var callDatas,targets,values,signatures,description;
            var originalquorom = 30;
            beforeEach(async function () {
                targets = [this.govern.address];
                values = [0];
                signatures = ["updateQuorumValue(uint256)"];
                callDatas = [encodeParameters(['uint256'],[originalquorom])];
                description = "Update Quorumvalue to 3 percentage";
                await this.astra.approve(this.chef.address, "1000", { from: ownerAddress });
                await this.chef.addVault(12, { from: ownerAddress });
                await this.chef.deposit(0, "100","0", { from: ownerAddress })

                const stakeValue = (new BN(50)).mul(oneether);
                await this.astra.approve(this.chef.address, stakeValue, { from: userAddress1 });
                await this.chef.deposit(0, stakeValue,12, { from: userAddress1 })
                await this.astra.approve(this.govern.address, totalSupply, { from: ownerAddress }); 
                time.increase(2592000);  
              
            })
              it("Should defeat the proposal if not enough governor votes Fundamental Changes",async function(){                
                await this.govern.propose(targets,values,signatures,callDatas,description,true,{from:ownerAddress})
                let latestBlock = await time.latestBlock();
                await time.advanceBlockTo(parseInt(latestBlock)+3);

                await this.govern.castVote(1,true,{from:ownerAddress});
                await this.govern.castVote(1,true,{from:userAddress1});
                await time.advanceBlockTo(parseInt(latestBlock)+12);
                expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(4));
              })

              it("Should defeat the proposal if not enough governot votes non fundamental changes",async function(){
                await this.govern.propose(targets,values,signatures,callDatas,description,false,{from:ownerAddress})
                let latestBlock = await time.latestBlock();
                await time.advanceBlockTo(parseInt(latestBlock)+3);
                await this.govern.castVote(1,true,{from:ownerAddress});
                await time.advanceBlockTo(parseInt(latestBlock)+13);
                expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(3));

              })

              it("Should defeat the proposal if not enough votes Fundamental Changes",async function(){
                await this.govern.propose(targets,values,signatures,callDatas,description,false,{from:ownerAddress})
                let latestBlock = await time.latestBlock();
                await time.advanceBlockTo(parseInt(latestBlock)+3);
                await this.govern.castVote(1,true,{from:ownerAddress});
                await this.govern.castVote(1,true,{from:userAddress3});
                await this.govern.castVote(1,true,{from:userAddress2});
                await time.advanceBlockTo(parseInt(latestBlock)+13);
                expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(3));
              })

              it("Should defeat the proposal if not enough votes non Fundamental Changes",async function(){
                await this.govern.propose(targets,values,signatures,callDatas,description,true,{from:ownerAddress})
                let latestBlock = await time.latestBlock();
                await time.advanceBlockTo(parseInt(latestBlock)+3);
                await this.govern.castVote(1,true,{from:ownerAddress});
                await this.govern.castVote(1,true,{from:userAddress2});
                await time.advanceBlockTo(parseInt(latestBlock)+13);
                expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(3));
              })

              it("Should accepts the proposal for fundmental changes",async function(){
                await this.govern.propose(targets,values,signatures,callDatas,description,true,{from:ownerAddress})
                let latestBlock = await time.latestBlock();
                await time.advanceBlockTo(parseInt(latestBlock)+3);
                await this.govern.castVote(1,true,{from:ownerAddress});
                await this.govern.castVote(1,true,{from:userAddress1});
                await time.advanceBlockTo(parseInt(latestBlock)+13);
                expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(4));
              })

              it("Should accepts the proposal for non  fundmental changes",async function(){
                await this.govern.propose(targets,values,signatures,callDatas,description,false,{from:ownerAddress})
                let latestBlock = await time.latestBlock();
                await time.advanceBlockTo(parseInt(latestBlock)+3);
                await this.govern.castVote(1,true,{from:userAddress1});
                await time.advanceBlockTo(parseInt(latestBlock)+13);
                expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(4));
            })
          })

          describe("Test FastTracked Votes",function(){
            var callDatas,targets,values,signatures,description;
            var originalquorom = 30;
            beforeEach(async function () {
                targets = [this.govern.address];
                values = [0];
                signatures = ["updateQuorumValue(uint256)"];
                callDatas = [encodeParameters(['uint256'],[originalquorom])];
                description = "Update Quorumvalue to 3 percentage";
                await this.astra.approve(this.chef.address, "1000", { from: ownerAddress });
                await this.chef.addVault(12, { from: ownerAddress });
                await this.chef.deposit(0, "100","0", { from: ownerAddress })
                const stakeValue = (new BN(50)).mul(oneether);
                await this.astra.approve(this.chef.address, stakeValue, { from: userAddress1 });
                await this.chef.deposit(0, stakeValue,12, { from: userAddress1 })
                await this.astra.approve(this.govern.address, totalSupply, { from: ownerAddress }); 
                time.increase(2592000);  
            })

            it("Should not accepts the proposal for fundmental changes",async function(){
              await this.govern.propose(targets,values,signatures,callDatas,description,true,{from:ownerAddress})
              let latestBlock = await time.latestBlock();
              await time.advanceBlockTo(parseInt(latestBlock)+3);
              await this.govern.castVote(1,true,{from:ownerAddress});
              await this.govern.castVote(1,true,{from:userAddress1});
              // await time.advanceBlockTo(parseInt(latestBlock)+13);
              expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(1));
            })

            it("Should not accepts the proposal for non  fundmental changes if time exceeds",async function(){
              await this.govern.propose(targets,values,signatures,callDatas,description,false,{from:ownerAddress})
              let latestBlock = await time.latestBlock();
              await time.advanceBlockTo(parseInt(latestBlock)+3);
              await this.govern.castVote(1,true,{from:userAddress1});
              await time.advanceBlockTo(parseInt(latestBlock)+13);
              expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(4));
            })

            it("Should accepts the proposal for non  fundmental changes",async function(){
              await this.govern.propose(targets,values,signatures,callDatas,description,false,{from:ownerAddress})
              let btimeProposal = await this.govern.proposalCreatedTime(1);
              let latestBlock = await time.latestBlock();
              console.log("before proposal Time ",parseInt(btimeProposal));
              console.log("before latest block ",parseInt(latestBlock));
              
              await time.advanceBlockTo(parseInt(latestBlock)+3);
              await this.govern.castVote(1,true,{from:userAddress1});
              // await time.advanceBlockTo(parseInt(latestBlock)+13);
              let atimeProposal = await this.govern.proposalCreatedTime(1);
              let alatestBlock = await time.latestBlock();
              let fastVoteStatus = await this.govern.checkfastvote(1);
              let proposaldetails = await this.govern.proposals(1);
              let quorumVotes = await this.govern.quorumVotes();
              console.log("after proposal Time ",parseInt(atimeProposal));
              console.log("after latest block ",parseInt(alatestBlock));
              console.log("Check Fast Vote status", fastVoteStatus);
              console.log("For votes   ",parseInt(proposaldetails.forVotes));
              console.log("quorumVotes ",parseInt(quorumVotes));
              console.log("End block ",parseInt(proposaldetails.endBlock));
              expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(4));
            })
          });

          describe("Test the highest stakig score",function(){
            var callDatas,targets,values,signatures,description;
            var originalquorom = 30;
            beforeEach(async function () {
                targets = [this.govern.address];
                values = [0];
                signatures = ["updateQuorumValue(uint256)"];
                callDatas = [encodeParameters(['uint256'],[originalquorom])];
                description = "Update Quorumvalue to 3 percentage";
                await this.astra.approve(this.chef.address, "1000", { from: ownerAddress });
                // await this.chef.deposit(0, "100","0", { from: ownerAddress })
                await this.astra.approve(this.govern.address, totalSupply, { from: ownerAddress }); 
            })
              it("Should Revert if staking score functionality not matched",async function(){
                await expectRevert(this.govern.propose(targets,values,signatures,callDatas,description,true,{from:ownerAddress}), "GovernorAlpha::propose: Only Top stakers can create proposal");
              })
          })
        describe("Propose",function(){
            var callDatas,targets,values,signatures,description;
            var originalquorom = 30;
            beforeEach(async function () {
                targets = [this.govern.address];
                values = [0];
                signatures = ["updateQuorumValue(uint256)"];
                callDatas = [encodeParameters(['uint256'],[originalquorom])];
                description = "Update Quorumvalue to 3 percentage";
                await this.astra.approve(this.chef.address, "1000", { from: ownerAddress });
                await this.chef.addVault(12, { from: ownerAddress });
                await this.chef.deposit(0, "100","0", { from: ownerAddress })
                const stakeValue = (new BN(50)).mul(oneether);
                await this.astra.approve(this.chef.address, stakeValue, { from: userAddress1 });
                await this.chef.deposit(0, stakeValue,12, { from: userAddress1 })
                await this.astra.approve(this.govern.address, totalSupply, { from: ownerAddress }); 
                time.increase(2592000);  
                await this.govern.propose(targets,values,signatures,callDatas,description,true,{from:ownerAddress})
            })
            
            it("Propose created successfully",async function(){
                expect(await this.govern.proposalCount()).to.be.bignumber.equal(new BN(1));
            })
            describe("Vote",function(){
                beforeEach(async function () {
                    await time.advanceBlock();
                    await time.advanceBlock(); 
                    await this.govern.castVote(1,true,{from:userAddress1});
                })
                it("Voted successfully",async function(){
                    var votes = await this.govern.proposals(1);
                    expect(votes[5]).to.be.bignumber.equal((new BN(90)).mul(oneether));
                })
                it("Should revert the Queue before voting end",async function(){
                    await expectRevert(this.govern.queue(1,{from:ownerAddress}), "GovernorAlpha::queue: proposal can only be queued if it is succeeded");
                })
                describe("Queue",function(){
                    beforeEach(async function () {
                      await this.govern.castVote(1,true,{from:ownerAddress});
                        const latestBlock = await time.latestBlock();
                        var details = await this.govern.proposals(1);
                        await time.advanceBlockTo(parseInt(latestBlock)+13);
                        await this.govern.queue(1,{from:ownerAddress});
                    })
                    it("Successfully queued",async function(){
                        expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(5));
                    })
                    it("Should revert the execution",async function(){
                        await expectRevert(this.govern.execute(1,{from:ownerAddress}), "Timelock::executeTransaction: Transaction hasn't surpassed time lock.");
                    })
                    describe("Execute",function(){
                        beforeEach(async function () {
                            await time.increase(130);
                            await this.govern.execute(1,{from:ownerAddress});
                        })
                        it("Successfully executed",async function(){
                            expect(await this.govern.quorumVotes()).to.be.bignumber.equal(new BN(30));
                        })
                    })
                })       
            })
    
        })
    })

})


