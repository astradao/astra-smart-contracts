const { expect } = require("chai");

const { ethers, upgrades } = require("hardhat");

describe("Airdrop", async() => {
    let Airdrop, airdrop, owner, alice, bob, charlie, dan, eve;
    let AstraToken, astraToken;

    describe("Deployment", async () => {

        it("Should deploy the token contract", async () => {

            [owner, alice, bob, charlie, dan, eve] = await ethers.getSigners();
            
            AstraToken = await ethers.getContractFactory("AstraDAOToken");
            astraToken = await upgrades.deployProxy(AstraToken, [
                owner.address,
            ],
                { unsafeAllowLinkedLibraries: true });

            expect(await astraToken.balanceOf(owner.address)).to.equal(ethers.utils.parseEther("130000000000000"));
        });

        it("Should deploy the airdrop contract", async () => {
            Airdrop = await ethers.getContractFactory("AstraDAOAirdrop");
            airdrop = await Airdrop.deploy(astraToken.address);
            await airdrop.deployed();
        });

    });

    describe("Airdropping addresses", async () => {

        it("Owner should be able to transfer tokens to the contract", async () => {
            await astraToken.transfer(airdrop.address, ethers.utils.parseEther("130000000000000"));
            expect(await astraToken.balanceOf(airdrop.address)).to.equal(ethers.utils.parseEther("130000000000000"));
        });

        it("Owner should be able to airdrop tokens to addresses", async () => {
            await airdrop.airdrop([alice.address, bob.address, charlie.address, dan.address, eve.address], [ethers.utils.parseEther("10000"), ethers.utils.parseEther("20000"), ethers.utils.parseEther("50000"), ethers.utils.parseEther("70000"), ethers.utils.parseEther("30000")]);
            expect(await astraToken.balanceOf(alice.address)).to.equal(ethers.utils.parseEther("10000"));
            expect(await astraToken.balanceOf(bob.address)).to.equal(ethers.utils.parseEther("20000"));
            expect(await astraToken.balanceOf(charlie.address)).to.equal(ethers.utils.parseEther("50000"));
            expect(await astraToken.balanceOf(dan.address)).to.equal(ethers.utils.parseEther("70000"));
            expect(await astraToken.balanceOf(eve.address)).to.equal(ethers.utils.parseEther("30000"));
        });

        it("Owner should not be able to airdrop more tokens than the contract has", async () => {
            await expect(airdrop.airdrop([alice.address, bob.address], [ethers.utils.parseEther("130000000000000"), ethers.utils.parseEther("100000000000000")])).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        });

        it("No one other than the owner should be able to airdrop tokens", async () => {
            await expect(airdrop.connect(alice).airdrop([alice.address, bob.address], [ethers.utils.parseEther("10000"), ethers.utils.parseEther("10000")])).to.be.revertedWith("Ownable: caller is not the owner");
        });

    });


    describe("Recovering tokens", async () => {
        it("Owner should be able to recover tokens", async () => {
            const beforeBalance = await astraToken.balanceOf(owner.address);
            await airdrop.recoverTokens(astraToken.address, ethers.utils.parseEther("1000"));
            const afterBalance = await astraToken.balanceOf(owner.address);
            expect(afterBalance.sub(beforeBalance)).to.equal(ethers.utils.parseEther("1000"));
        });

        it("No one other than the owner should be able to recover tokens", async () => {
            await expect(airdrop.connect(alice).recoverTokens(astraToken.address, ethers.utils.parseEther("1000"))).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Owner should be able to recover any contract tokens", async () => {
            const NewToken = await ethers.getContractFactory("AstraDAOToken");
            const newToken = await upgrades.deployProxy(AstraToken, [
                owner.address,
            ],
                { unsafeAllowLinkedLibraries: true });


            await newToken.transfer(airdrop.address, ethers.utils.parseEther("1000"));

            const beforeBalance = await newToken.balanceOf(owner.address);
            await airdrop.recoverTokens(newToken.address, ethers.utils.parseEther("1000"));
            const afterBalance = await newToken.balanceOf(owner.address);
            expect(afterBalance.sub(beforeBalance)).to.equal(ethers.utils.parseEther("1000"));
        });
    });

});