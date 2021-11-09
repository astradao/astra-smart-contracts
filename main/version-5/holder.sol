// SPDX-License-Identifier: MIT


/**
  Not This is not the complete code it will pushed soon.
*/
pragma solidity ^0.5.0;

// import "../../other/token.sol";
import "../../other/1inch.sol";

contract TopHolder {
    using SafeMath for uint;
    address public whitelistmanager;
    address public _owner;
	address[] public topaddresses;
    address  public WETH_ADDRESS = 0xfFF3d84aab1CDEbCeE7A9A50400f67d11e79a388;
    mapping(address => bool) public whitelistedaddress;
    modifier whitelistedonly{
        require(whitelistedaddress[msg.sender] == true, "Only whitelistedaddress");
        _;
    }
    
    modifier onlyOwner{
        require(msg.sender == _owner, "Only Owner");
        _;
    }
    
    modifier whitelistmanagerOnly{
        require(msg.sender == whitelistmanager, "Only whitelistmanage");
        _;
    }
    
    constructor(string memory name, string memory symbol) public {
      _owner = msg.sender;
      whitelistmanager = msg.sender; 
	}
	
	function updateManager(address _addr) public onlyOwner{
	    require(_addr != whitelistmanager, "Already whitelist manager");
	    whitelistmanager = _addr;
	}
	
	function whitelistaddress(address _addr) public whitelistmanagerOnly{
          require(whitelistedaddress[_addr] == false, "ALready Whitelisted");
          whitelistedaddress[_addr] = true;
	}
	
	function removewhitelist(address _addr) public whitelistmanagerOnly{
	    require(whitelistedaddress[_addr] == true, "Not Whitelisted");
	    whitelistedaddress[_addr] = false;
	}
	function checkWethBalance() public view returns(uint){
	   return IERC20(WETH_ADDRESS).balanceOf(address(this));
	}

	function checktoptrader(address _addr) public view returns(bool){
       for(uint i=0;i< topaddresses.length;i++){
		   if(topaddresses[i]==_addr){
			   return true;
		   }
	   }
	   return false;
	}
	function distributetokens(uint[] memory _weight, address payable[] memory _addr, uint _totalweight) public whitelistedonly returns(bool) {
	    require(_weight.length == _addr.length, "Invalid config");
	   // uint _totalamount;
	    uint totalReward = IERC20(WETH_ADDRESS).balanceOf(address(this));
		uint totalRewardEther = address(this).balance;
		uint _tokenPartEther;
	    require(totalReward > 1 ether, "Not enough ");
		// address[] memory tmparray;
		topaddresses = _addr;
	    uint _tokenPart;
	    for (uint i= 0; i< _weight.length; i++){
	        _tokenPart = totalReward.mul(_weight[i]).div(_totalweight);
			if(_tokenPart>0){
				IERC20(WETH_ADDRESS).transfer(_addr[i], _tokenPart);
			}
		   _tokenPartEther = totalRewardEther.mul(_weight[i]).div(_totalweight);
		   if(_tokenPartEther>0){
				_addr[i].transfer(_tokenPartEther);
			}
	    }
	    return true;
	}
}