const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');
const EIP712 = require("../../Util/EIP712");

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { signTypedData } = require('eth-sig-util');

const MAX_DEPLOYED_BYTECODE_SIZE = 24576;
const Astrsample = contract.fromArtifact('Token');
const Timelock = contract.fromArtifact('Timelock');
const Governance = contract.fromArtifact('GovernorAlphaMock');
// const TopHolders = contract.fromArtifact('MockTopHolder');
const MasterChef = contract.fromArtifact('MasterChefV2');
const TestERC20 = contract.fromArtifact('TESTERC20');
const decimal = new BN(18);
const oneether = (new BN(10)).pow(decimal);
const totalSupply = (new BN(100000000000000)).mul(oneether)

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
        await this.chef.initialize(this.astra.address , "0", "1000", "1000000", {from: ownerAddress, gas: 8000000});
        // await this.chef.add(100, this.astra.address, true, { from: ownerAddress })

        this.govern = await Governance.new(this.timelock.address,this.astra.address,{from: ownerAddress, gas: 8000000});
        await this.govern.initialize(this.timelock.address,this.astra.address,this.chef.address,{from: ownerAddress, gas: 8000000});
        await this.chef.whitelistDepositContract(this.govern.address, true, { from: ownerAddress });
        // console.log("Governance address ",this.govern.address);
    });
    describe("Configuring Astra contract", function(){
         beforeEach(async function () {
            const transferValue = (new BN(100)).mul(oneether);
            await this.astra.transfer(userAddress1, transferValue, { from: ownerAddress })
            await this.astra.transfer(userAddress2, transferValue, { from: ownerAddress })
            var amount= (new BN(30)).mul(oneether);
            await this.astra.mint(userAddress1,amount,{from:ownerAddress});
            await this.timelock.setPendingAdmin(this.govern.address,{from:ownerAddress});
            await this.govern._acceptAdmin({from:ownerAddress});
            await this.astra.mint(userAddress2,amount,{from:ownerAddress});

            await this.astra.approve(this.chef.address, (new BN(10000)).mul(oneether), { from: ownerAddress });
            await this.chef.deposit( (new BN(100)).mul(oneether),"0","0", false , { from: ownerAddress })

            const stakeValue = (new BN(50)).mul(oneether);
            await this.astra.approve(this.chef.address, stakeValue, { from: userAddress1 });
            await this.chef.deposit( stakeValue,12,"0", false, { from: userAddress1 })

            await this.astra.approve(this.chef.address, stakeValue, { from: userAddress2 });
            await this.chef.deposit( stakeValue,12,"0", false, { from: userAddress2 })

          })

          describe("Test new Voting Acceptance ",function(){
            var callDatas,targets,values,signatures,description;
            var originalquorom = 30;
            beforeEach(async function () {
                targets = [this.govern.address];
                values = [0];
                signatures = ["updateQuorumValue(uint256)"];
                callDatas = [encodeParameters(['uint256'],[originalquorom])];
                description = "Update Quorumvalue to 3 percentage";


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
                expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(3));
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
                // await this.govern.castVote(1,true,{from:ownerAddress});
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
                await this.govern.castVote(1,true,{from:userAddress2});
                await time.advanceBlockTo(parseInt(latestBlock)+13);
                expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(4));
              })

              it("Should accepts the proposal for non  fundmental changes",async function(){
                await this.govern.propose(targets,values,signatures,callDatas,description,false,{from:ownerAddress})
                let latestBlock = await time.latestBlock();
                await time.advanceBlockTo(parseInt(latestBlock)+3);
                await this.govern.castVote(1,true,{from:ownerAddress});
                await this.govern.castVote(1,true,{from:userAddress2});
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
                await this.astra.approve(this.govern.address, totalSupply, { from: ownerAddress }); 
                time.increase(2592000);  
            })

            it("Should not accepts the proposal for fundmental changes",async function(){
              await this.govern.propose(targets,values,signatures,callDatas,description,true,{from:ownerAddress})
              let latestBlock = await time.latestBlock();
              await time.advanceBlockTo(parseInt(latestBlock)+3);
              await this.govern.castVote(1,true,{from:ownerAddress});
              await this.govern.castVote(1,true,{from:userAddress1});
              await this.govern.castVote(1,true,{from:userAddress2});
              // await time.advanceBlockTo(parseInt(latestBlock)+13);
              expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(1));
            })

            it("Should not fast forward changes if on day time exceeds",async function(){
              await this.govern.propose(targets,values,signatures,callDatas,description,false,{from:ownerAddress})
              let latestBlock = await time.latestBlock();
              await time.advanceBlockTo(parseInt(latestBlock)+3);
              await this.govern.castVote(1,true,{from:userAddress1});
              await time.increase(86410);
              expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(1));
            })

            it("Should accepts the proposal for non  fundmental changes",async function(){
              await this.govern.propose(targets,values,signatures,callDatas,description,false,{from:ownerAddress})
              let latestBlock = await time.latestBlock();
              await time.advanceBlockTo(parseInt(latestBlock)+3);
              await this.govern.castVote(1,true,{from:ownerAddress});
              await this.govern.castVote(1,true,{from:userAddress2});
              await time.advanceBlockTo(parseInt(latestBlock)+13);
              expect(await this.govern.state(1)).to.be.bignumber.equal(new BN(4));
            })
          });
        describe("Propose",function(){
            var callDatas,targets,values,signatures,description;
            var originalquorom = 30;
            beforeEach(async function () {
                targets = [this.govern.address];
                values = [0];
                signatures = ["updateQuorumValue(uint256)"];
                callDatas = [encodeParameters(['uint256'],[originalquorom])];
                description = "Update Quorumvalue to 3 percentage";
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
                })
                it("Voted successfully",async function(){
                   await this.govern.castVote(1,true,{from:userAddress1});
                    var votes = await this.govern.proposals(1);
                    expect(votes[5]).to.be.bignumber.equal((new BN(90)).mul(oneether));
                })
                it("Should revert the Queue before voting end",async function(){
                    await expectRevert(this.govern.queue(1,{from:ownerAddress}), "GovernorAlpha::queue: proposal can only be queued if it is succeeded");
                })
                describe("Queue",function(){
                    beforeEach(async function () {
                      await this.govern.castVote(1,true,{from:ownerAddress});
                      await this.govern.castVote(1,true,{from:userAddress1});
                      await this.govern.castVote(1,true,{from:userAddress2})
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


