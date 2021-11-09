const { accounts, contract, privateKeys } = require('@openzeppelin/test-environment');

const { BN, expectRevert, time, expectEvent, constants } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { parse } = require('dotenv');
const { signTypedData } = require('eth-sig-util');

const Oracle = contract.fromArtifact('DAAORacleMock');

const decimal = new BN(18);
const oneether = (new BN(10)).pow(decimal);
const totalSupply = (new BN(1000)).mul(oneether)
const tokens = ["0x71C4B307c7305A35C019d1A5ea1C474aFE6ea4Cc","0xDb7Fc0fa0169B861106D8a8C786b5Eb4C06b6Fe6"]
const weight = [(new BN(3)),(new BN(6))];
const threshold = (new BN(4000))
const rebal = (new BN(3000))
const URL = "TEST_URL"
const Response = "1,0xdAC17F958D2ee523a2206206994597C13D831ec7,0xB8c77482e45F1F44dE1745F52C74426C631bDD52,1,2,0,200,400"

const {
    encodeParameters
  } = require('../../Util/Ethereum');
describe('DAA', function () {
    const [ ownerAddress, userAddress1, userAddress2, userAddress3 ] = accounts;
    beforeEach(async function() {
        this.Oracle = await Oracle.new( {from: ownerAddress, gas: 8000000});
        this.Oracle.initialize({from: ownerAddress, gas: 8000000})
    });

    describe("Configuration Test",function(){
        describe("Update the DAO contract address",function(){
            it("Should Revert if non whitelist manager tries to whitelist the address", async function () {
                await expectRevert(this.Oracle.whitelistaddress(ownerAddress,{from:userAddress1}),"Only whitelistmanage");
            });
            it("Should whitelist the address", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                expect(await this.Oracle.whitelistedaddress(userAddress1)).to.be.equal(true);
            });
            it("Should not whitelist the twice", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                await expectRevert(this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress}),"ALready Whitelisted");
            });
            it("Should disable the DAO contract address", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress});
                await this.Oracle.removewhitelist(userAddress1,{from: ownerAddress});
                expect(await this.Oracle.whitelistedaddress(userAddress1)).to.be.equal(false);
            });
        }) 

        describe("Update the Oracle Manager address",function(){
            it("Should Revert if non owner tries to update the  Manager address", async function () {
                await expectRevert(this.Oracle.updateManager(ownerAddress,{from:userAddress1}),"Only Owner");
            });
            it("Should update the Manager address", async function () {
                await this.Oracle.updateManager(userAddress1,{from: ownerAddress})
                expect(await this.Oracle.whitelistmanager()).to.be.equal(userAddress1);
            });
            it("Should not update the Manager address twice", async function () {
                await this.Oracle.updateManager(userAddress1,{from: ownerAddress})
                await expectRevert(this.Oracle.updateManager(userAddress1,{from: ownerAddress}),"Already whitelist manager");
            });
            it("Should update the Oracle contract address", async function () {
                await this.Oracle.updateManager(userAddress1,{from: ownerAddress})
                await this.Oracle.updateManager(userAddress2,{from: ownerAddress})
                expect(await this.Oracle.whitelistmanager()).to.be.equal(userAddress2);
            });
        }) 

        describe("Add the pool in Oracle",function(){

            it("Should Revert if non whitelisted tries to add Pool", async function () {
                await expectRevert(this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:userAddress1,gas: 8000000}),"Only whitelistedaddress");
            });
            it("Should add the new pool", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                await this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:userAddress1,gas: 8000000})
                let data = await this.Oracle.getTokenDetails(0);
                expect(data[0].length).to.be.equal(2);
            });
            it("Check the first token in Oracle", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                await this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:userAddress1,gas: 8000000})
                let data = await this.Oracle.getTokenDetails(0);
                expect(data[0][0]).to.be.equal(tokens[0]);
            });
            it("Check the second token in Oracle", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                await this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:userAddress1,gas: 8000000})
                let data = await this.Oracle.getTokenDetails(0);
                expect(data[0][1]).to.be.equal(tokens[1]);
            });
            it("Check the first weight parameter in Oracle", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                await this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:userAddress1,gas: 8000000})
                let data = await this.Oracle.getTokenDetails(0);
                expect(parseInt(data[1][0])).to.be.equal(3);
            });
            it("Check the second weight parameter in Oracle", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                await this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:userAddress1,gas: 8000000})
                let data = await this.Oracle.getTokenDetails(0);
                expect(parseInt(data[1][1])).to.be.equal(6);
            });
            it("Check the threshold in Oracle", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                await this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:userAddress1,gas: 8000000})
                let data = await this.Oracle.getTokenDetails(0);
                expect(parseInt(data[2])).to.be.equal(4000);
            });
            it("Check the Rebalance time in Oracle", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                await this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:userAddress1,gas: 8000000})
                let data = await this.Oracle.getTokenDetails(0);
                expect(parseInt(data[3])).to.be.equal(3000);
            });

            it("Check the description", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                await this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:userAddress1,gas: 8000000})
                let data = await this.Oracle.getiTokenDetails(0);
                expect(data[2]).to.be.equal("Test description");
            });


            it("Check the Pool data source", async function () {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                await this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:userAddress1,gas: 8000000})
                expect(await this.Oracle.PoolDatasource(0)).to.be.equal(URL);
            });
            
        }) 

        describe("Update the pool in Oracle",function(){
            beforeEach(async function() {
                await this.Oracle.whitelistaddress(userAddress1,{from: ownerAddress})
                await this.Oracle.AddNewPoolTokens(tokens,weight,threshold,rebal,"Firts Pool", "IFIRST",URL,"Test description",{from:userAddress1,gas: 8000000})
                await this.Oracle.update_provableCbAddress(userAddress1,{from:userAddress1,gas: 8000000})
                await this.Oracle.__callback("0x1000000000000000000000000000000000000000000000000000000000000000",Response,{from:userAddress1,gas: 8000000})
            });
            

            it("Should Revert if non whitelisted tries to update the Pool data source", async function () {
                await expectRevert(this.Oracle.UpdatePoolDatasource("0x1000000000000000000000000000000000000000000000000000000000000000",Response,{from:userAddress2,gas: 8000000}),"Only whitelistedaddress");
            });

            it("Should update the Pool data source", async function () {
                await this.Oracle.UpdatePoolDatasource(0,"Second_URL",{from:userAddress1,gas: 8000000})
                expect(await this.Oracle.PoolDatasource(0)).to.be.equal("Second_URL");   
            });

            it("Should Revert if non provable tries to update", async function () {
                await expectRevert(this.Oracle.__callback("0x1000000000000000000000000000000000000000000000000000000000000000",Response,{from:userAddress2,gas: 8000000}),"revert");
            });

            it("Check the first token in Oracle", async function () {
                let data = await this.Oracle.getTokenDetails(0);
                expect(data[0][0]).to.be.equal("0xdAC17F958D2ee523a2206206994597C13D831ec7");
            });
            it("Check the second token in Oracle", async function () {
                let data = await this.Oracle.getTokenDetails(0);
                expect(data[0][1]).to.be.equal("0xB8c77482e45F1F44dE1745F52C74426C631bDD52");
            });
            it("Check the first weight parameter in Oracle", async function () {
                let data = await this.Oracle.getTokenDetails(0);
                expect(parseInt(data[1][0])).to.be.equal(1);
            });
            it("Check the second weight parameter in Oracle", async function () {
                let data = await this.Oracle.getTokenDetails(0);
                expect(parseInt(data[1][1])).to.be.equal(2);
            });
            it("Check the threshold in Oracle", async function () {
                let data = await this.Oracle.getTokenDetails(0);
                expect(parseInt(data[2])).to.be.equal(200);
            });
            it("Check the Rebalance time in Oracle", async function () {
                let data = await this.Oracle.getTokenDetails(0);
                expect(parseInt(data[3])).to.be.equal(400);
            });
            it("Should Revert if non provable tries to update", async function () {
                await expectRevert(this.Oracle.__callback("0x1000000000000000000000000000000000000000000000000000000000000000","avgadbg",{from:userAddress1,gas: 8000000}),"invalid opcode");
            });
        }) 

    })
})