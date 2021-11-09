pragma solidity ^0.5.0;

import "../../other/token.sol";

contract Astrsample is ERC20 {
	constructor() public ERC20("Astra", "astr") {
		_mint(msg.sender, 1000000*10**18);
	}
	function mint(address account, uint256 amount) external returns (bool) {
        _mint(account, amount);
        return true;
    }
}