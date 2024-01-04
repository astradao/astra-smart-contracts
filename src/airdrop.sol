// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AstraDAOAirdrop is Ownable {
    IERC20 public astradao;

    constructor(address _tokenAddress) {
        astradao = IERC20(_tokenAddress);
    }

    // Function to perform the airdrop
    function airdrop(address[] memory recipients, uint256[] memory amounts) public onlyOwner {
        require(recipients.length == amounts.length, "Input arrays must have the same length");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            astradao.transfer(recipients[i], amounts[i]);
        }
    }

    // Function to withdraw any remaining tokens from the contract
    function withdrawTokens(uint256 amount) public onlyOwner {
        require(amount > 0, "Withdrawal amount must be greater than 0");
        uint256 contractBalance = astradao.balanceOf(address(this));
        require(contractBalance >= amount, "Insufficient contract balance");

        astradao.transfer(owner(), amount);
    }

    // Fallback function to receive ETH (if needed)
    receive() external payable {}

    // Function to receive any accidentally sent ERC20 tokens (if needed)
    function recoverTokens(address tokenAddress, uint256 amount) public onlyOwner {
        IERC20(tokenAddress).transfer(owner(), amount);
    }
}
