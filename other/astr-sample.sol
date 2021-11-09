pragma solidity ^0.5.0;

import "./token.sol";

contract Astrsample is ERC20 {
	constructor() public ERC20("Astra", "astr") {
		_mint(msg.sender, 1000*10**18);
	}
}