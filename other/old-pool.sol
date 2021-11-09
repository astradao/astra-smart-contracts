
// SPDX-License-Identifier: MIT


/**
  Not This is not the complete code it will pushed soon.
*/
pragma solidity ^0.5.0;

import "../../other/token.sol";
import "../../other/1inch.sol";


interface Chef{
     function add(uint256 _allocPoint, IERC20 _lpToken, bool _withUpdate) external returns (bool);
     function deposit(uint256 _pid, uint256 _amount,address _investor) external returns (bool);
     function withdraw(uint256 _pid, uint256 _amount, address _investor) external returns (bool);
    
}

interface IOracle{
     function getTokenDetails(uint _poolIndex) external returns(address[] memory,uint[] memory,uint ,uint);
}

contract Pool is ERC20 {
    
    using SafeMath for uint;

	address public constant EXCHANGE_CONTRACT = 0x5e676a2Ed7CBe15119EBe7E96e1BB0f3d157206F;
	address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
	address public constant WETH_ADDRESS = 0x7816fBBEd2C321c24bdB2e2477AF965Efafb7aC0;
        
	address public ASTRTokenAddress;
	
	address public managerAddresses;
	address public ChefAddress;
	address private Oraclecontract;

	uint[] public holders;
	
	uint256 public managmentfees = 2;
	
	uint256 public performancefees = 20;
	
	uint public WethBalance;
	
	address payable public distributor;

    address public OracleAddress;

    struct PoolInfo {
        address[] tokens;    
        uint[]  weights;        
        uint totalWeight;      
        bool active;          
        uint rebaltime;
        uint threshold;
        uint currentRebalance;
        uint lastrebalance;
    }
    
    struct PoolUser 
    { 
        uint currentBalance; 
        uint currentPool; 
        uint pendingBalance; 
        bool active;
        bool isenabled;
    } 
    
     mapping ( uint =>mapping(address => PoolUser)) public poolUserInfo; 
    PoolInfo[] public poolInfo;
    
    uint[] buf; 
    
    address[] _Tokens;
    uint[] _Values;
    
	mapping(uint => mapping(address => uint)) public tokenBalances;
	
	mapping(uint => mapping(address => uint)) public daatokenBalances;
	
	mapping(address => bool) public enabledDAO;
	
	mapping(uint => uint) public totalPoolbalance;
	
	mapping(uint => uint) public poolPendingbalance;
	
	bool public active = true; 
	
	mapping(address => bool) public systemAddresses;
	
	modifier systemOnly {
	    require(systemAddresses[msg.sender], "system only");
	    _;
	}
	
	modifier DaoOnly{
	    require(enabledDAO[msg.sender], "system only");
	    _;
	}
	
	modifier whitelistManager {
	    require(managerAddresses == msg.sender, "Manager only");
	    _;
	}

	modifier OracleOnly {
		require(Oraclecontract == msg.sender, "Only Oracle contract");
		_;
	}
	
	event Transfer(address indexed src, address indexed dst, uint wad);
	event Withdrawn(address indexed from, uint value);
	event WithdrawnToken(address indexed from, address indexed token, uint amount);
	
	function addSystemAddress(address newSystemAddress) public systemOnly { 
	    systemAddresses[newSystemAddress] = true;
	}
	
	constructor(string memory name, string memory symbol, address _ASTRTokenAddress, address _chef) public ERC20(name, symbol) {
		systemAddresses[msg.sender] = true;
        ChefAddress = _chef;
		ASTRTokenAddress = _ASTRTokenAddress;
		managerAddresses = msg.sender;
		distributor = 0x3C0579211A530ac1839CC672847973182bd2da31;
	}
	
    function addNewList() public systemOnly{
        uint _poolIndex = poolInfo.length;
        address[] memory _tokens; 
        uint[] memory _weights;
		uint _threshold;
		uint _rebalanceTime;
        // if(poolInfo.length>0){
        //     _poolIndex = poolInfo.length.sub(1);
        // }
		(_tokens, _weights,_threshold,_rebalanceTime) = IOracle(Oraclecontract).getTokenDetails(_poolIndex);
        require (_tokens.length == _weights.length, "invalid config length");
        uint _totalWeight;
		for(uint i = 0; i < _tokens.length; i++) {
			_totalWeight += _weights[i];
		}
        
		poolInfo.push(PoolInfo({
            tokens : _tokens,   
            weights : _weights,        
            totalWeight : _totalWeight,      
            active : true,          
            rebaltime : _rebalanceTime,
            currentRebalance : 0,
            threshold: _threshold,
            lastrebalance: block.timestamp
        }));
        Chef(ChefAddress).add(100, IERC20(address(this)),true);
    }
    function getTokenDetails(uint _poolIndex) public view returns(address[] memory ,uint[] memory){
        return (poolInfo[_poolIndex].tokens,poolInfo[_poolIndex].weights);
    }
    function buytokens(uint _poolIndex) internal {
     require(_poolIndex<poolInfo.length, "Invalid Pool Index");
     address[] memory returnedTokens;
	 uint[] memory returnedAmounts;
     uint ethValue = poolPendingbalance[_poolIndex]; 
     
     (returnedTokens, returnedAmounts) = swap(ETH_ADDRESS, ethValue, poolInfo[_poolIndex].tokens, poolInfo[_poolIndex].weights, poolInfo[_poolIndex].totalWeight);
     
      for (uint i = 0; i < returnedTokens.length; i++) {
			tokenBalances[_poolIndex][returnedTokens[i]] += returnedAmounts[i];
	  }
	  totalPoolbalance[_poolIndex] = totalPoolbalance[_poolIndex].add(ethValue);
	  poolPendingbalance[_poolIndex] = 0;
	  if (poolInfo[_poolIndex].currentRebalance == 0){
	      poolInfo[_poolIndex].currentRebalance = poolInfo[_poolIndex].currentRebalance.add(1);
	  }
		
    }
    
    function whitelistaddress(address _address, uint _poolIndex) public whitelistManager {
	    //require(!poolUserInfo[_poolIndex][_address].active,"Already whitelisted");
	    PoolUser memory newPoolUser = PoolUser(0, poolInfo[_poolIndex].currentRebalance,0,true,true);
        poolUserInfo[_poolIndex][_address] = newPoolUser;
	}
	
	function whitelistDAOaddress(address _address) public whitelistManager {
	    require(!enabledDAO[_address],"Already whitelisted");
	    enabledDAO[_address] = true;
	  
	}

	function setOracleaddress(address _address) public whitelistManager {
		require(_address != Oraclecontract, "Already set");
		Oraclecontract = _address;
	}

	function setdistributor(address payable _address) public whitelistManager {
		require(_address != distributor, "Already set");
		distributor = _address;
	}
	
	function removeDAOaddress(address _address) public whitelistManager {
	    require(enabledDAO[_address],"Not whitelisted");
	    enabledDAO[_address] = false;
	  
	}
	
	function removefromwhitelist(address _address, uint _poolIndex) public whitelistManager{
	    require(poolUserInfo[_poolIndex][_address].active,"Not whitelisted");
	    poolUserInfo[_poolIndex][_address].isenabled = false;
	}
	
	function updatewhitelistmanager(address _address) public whitelistManager{
	    require(_address != managerAddresses,"Already Manager");
	    managerAddresses = _address;
	}
    
    function updatemanagfees (uint256 _feesper)public DaoOnly{
        require(_feesper<100,"Onlne less than 100");
        managmentfees = _feesper;
    }    

     function updatePerfees (uint256 _feesper) public DaoOnly{
        require(_feesper<100,"Onlne less than 100");
        performancefees = _feesper;
    }
    
    function updateuserinfo(uint _amount,uint _poolIndex) internal { 
        
        if(poolUserInfo[_poolIndex][msg.sender].active){
            if(poolUserInfo[_poolIndex][msg.sender].currentPool < poolInfo[_poolIndex].currentRebalance){
                poolUserInfo[_poolIndex][msg.sender].currentBalance = poolUserInfo[_poolIndex][msg.sender].currentBalance.add(poolUserInfo[_poolIndex][msg.sender].pendingBalance);
                poolUserInfo[_poolIndex][msg.sender].currentPool = poolInfo[_poolIndex].currentRebalance;
                poolUserInfo[_poolIndex][msg.sender].pendingBalance = _amount;
            }
            else{
               poolUserInfo[_poolIndex][msg.sender].pendingBalance = poolUserInfo[_poolIndex][msg.sender].pendingBalance.add(_amount); 
            }
        }
       
    } 
    
    function getuserbalance(uint _poolIndex) public view returns(uint){
        return poolUserInfo[_poolIndex][msg.sender].currentBalance;
    }
    
    function chargepmanagmenfees(uint _amount) internal view returns (uint){
        uint fees = _amount.mul(managmentfees).div(100);
        return fees;  
    }
    
    function chargePerformancefees(uint _amount) internal view returns (uint){
        uint fees = _amount.mul(performancefees).div(100);
        return fees;
        
    }
    function claimRewards(uint _poolIndex) public {
        require(_poolIndex<poolInfo.length, "Invalid Pool Index");
        Chef(ChefAddress).deposit(_poolIndex,0,msg.sender);
    }
    
	function poolIn(address[] memory _tokens, uint[] memory _values, uint _poolIndex) public payable  {
		// require(IERC20(ASTRTokenAddress).balanceOf(msg.sender) > 0, "ASTRToken balance must be greater then 0");
		require(poolUserInfo[_poolIndex][msg.sender].isenabled, "Only whitelisted user");
		require(_poolIndex<poolInfo.length, "Invalid Pool Index");
		uint ethValue;
		uint fees;
		if(_tokens.length == 0) {
			require (msg.value > 0.001 ether, "0.001 ether min pool in");
			ethValue = msg.value;
		} else if(_tokens.length == 1) {
			ethValue =sellTokensForEther(_tokens, _values);
			assert(ethValue > 0.001 ether);
		} else {
			ethValue = sellTokensForEther(_tokens, _values);
			assert(ethValue > 0.001 ether);
		}
		 fees = chargepmanagmenfees(ethValue);
		 distributor.transfer(fees);
		 ethValue = ethValue.sub(fees);
		 poolPendingbalance[_poolIndex] = poolPendingbalance[_poolIndex].add(ethValue);
		 uint checkbalance = totalPoolbalance[_poolIndex].add(poolPendingbalance[_poolIndex]);
		 updateuserinfo(ethValue,_poolIndex);
		  if (poolInfo[_poolIndex].currentRebalance == 0){
		     if(poolInfo[_poolIndex].threshold <= checkbalance){
		        buytokens( _poolIndex);
		     }     
		  }
		 
		updateuserinfo(0,_poolIndex);
		_mint(msg.sender, ethValue);
		approve(ChefAddress,ethValue);
		Chef(ChefAddress).deposit(_poolIndex,ethValue,msg.sender);
	}
	function withdraw(uint _poolIndex) public {
	    require(_poolIndex<poolInfo.length, "Invalid Pool Index");
	    updateuserinfo(0,_poolIndex);
		uint _balance = poolUserInfo[_poolIndex][msg.sender].currentBalance;
		uint localWeight = _balance.mul(1 ether).div(totalPoolbalance[_poolIndex]);
		require(localWeight > 0, "no balance in this pool");
		uint _amount;
		uint _totalAmount;
		uint fees;
		uint[] memory _distribution;
        Chef(ChefAddress).withdraw(_poolIndex,_balance,msg.sender);
		_burn(msg.sender, _balance);
		for (uint i = 0; i < poolInfo[_poolIndex].tokens.length; i++) {
		    uint withdrawBalance = tokenBalances[_poolIndex][poolInfo[_poolIndex].tokens[i]].mul(localWeight).div(1 ether);
		    if (withdrawBalance == 0) {
		        continue;
		    }
		    if (poolInfo[_poolIndex].tokens[i] == WETH_ADDRESS) {
		        _totalAmount += withdrawBalance;
		        continue;
		    }
		    IERC20(poolInfo[_poolIndex].tokens[i]).approve(EXCHANGE_CONTRACT, withdrawBalance);
		    
			(_amount, _distribution) = IOneSplit(EXCHANGE_CONTRACT).getExpectedReturn(IERC20(poolInfo[_poolIndex].tokens[i]), IERC20(WETH_ADDRESS), withdrawBalance, 2, 0);
			if (_amount == 0) {
		        continue;
		    }
			IOneSplit(EXCHANGE_CONTRACT).swap(IERC20(poolInfo[_poolIndex].tokens[i]), IERC20(WETH_ADDRESS), withdrawBalance, _amount, _distribution, 0);
			_totalAmount += _amount;
		}
        // _totalAmount += poolUserInfo[_poolIndex][msg.sender].pendingBalance;
		if(_totalAmount>_balance){
			fees = chargePerformancefees(_totalAmount.sub(_balance));
			IERC20(WETH_ADDRESS).transfer(distributor, fees);
			IERC20(WETH_ADDRESS).transfer(msg.sender, _totalAmount.sub(fees));
		}
		else{
			IERC20(WETH_ADDRESS).transfer(msg.sender, _totalAmount);
		}
		msg.sender.transfer(poolUserInfo[_poolIndex][msg.sender].pendingBalance);

		Chef(ChefAddress).withdraw(_poolIndex,poolUserInfo[_poolIndex][msg.sender].pendingBalance,msg.sender);
		_burn(msg.sender, poolUserInfo[_poolIndex][msg.sender].pendingBalance);

        poolPendingbalance[_poolIndex] = poolPendingbalance[_poolIndex].sub( poolUserInfo[_poolIndex][msg.sender].pendingBalance);
        poolUserInfo[_poolIndex][msg.sender].pendingBalance = 0;
        totalPoolbalance[_poolIndex] = totalPoolbalance[_poolIndex].sub(_balance);
		poolUserInfo[_poolIndex][msg.sender].currentBalance = poolUserInfo[_poolIndex][msg.sender].currentBalance.sub(_balance);
		emit Withdrawn(msg.sender, _balance);
	}

	function updatePool(uint _poolIndex) public systemOnly {	    
	    require(block.timestamp >= poolInfo[_poolIndex].rebaltime," Rebalnce time not reached");
		require(poolUserInfo[_poolIndex][msg.sender].currentBalance>poolInfo[_poolIndex].threshold,"Threshold not reached");
		address[] memory _tokens;
		uint[] memory _weights;
		uint _threshold;
		uint _rebalanceTime;
		(_tokens, _weights,_threshold,_rebalanceTime) = IOracle(Oraclecontract).getTokenDetails(_poolIndex);
		require(_tokens.length == _weights.length, "invalid config length");

	    address[] memory newTokens;
	    uint[] memory newWeights;
	    uint newTotalWeight;
		
		uint _newTotalWeight;

		for(uint i = 0; i < _tokens.length; i++) {
			require (_tokens[i] != ETH_ADDRESS && _tokens[i] != WETH_ADDRESS);			
			_newTotalWeight += _weights[i];
		}
		
		newTokens = _tokens;
		newWeights = _weights;
		newTotalWeight = _newTotalWeight;

		rebalance(newTokens, newWeights,newTotalWeight,_poolIndex);
		poolInfo[_poolIndex].threshold = _threshold;
		poolInfo[_poolIndex].rebaltime = _rebalanceTime;
		if(poolPendingbalance[_poolIndex]>0){
		 buytokens(_poolIndex);   
		}
		
	}
	function setPoolStatus(bool _active,uint _poolIndex) public systemOnly {
		poolInfo[_poolIndex].active = _active;
	}	
	/*
	 * @dev sell array of tokens for ether
	 */
	function sellTokensForEther(address[] memory _tokens, uint[] memory _amounts) internal returns(uint) {
		uint _amount;
		uint _totalAmount;
		uint[] memory _distribution;
		for(uint i = 0; i < _tokens.length; i++) {
		    if (_amounts[i] == 0) {
		        continue;
		    }
		    
		    if (_tokens[i] == WETH_ADDRESS) {
		        _totalAmount += _amounts[i];
		        continue;
		    }
		    IERC20(_tokens[i]).approve(EXCHANGE_CONTRACT, _amounts[i]);
		    
			(_amount, _distribution) = IOneSplit(EXCHANGE_CONTRACT).getExpectedReturn(IERC20(_tokens[i]), IERC20(WETH_ADDRESS), _amounts[i], 2, 0);
			if (_amount == 0) {
		        continue;
		    }
		    
			IOneSplit(EXCHANGE_CONTRACT).swap(IERC20(_tokens[i]), IERC20(WETH_ADDRESS), _amounts[i], _amount, _distribution, 0);

			_totalAmount += _amount;
		}

		return _totalAmount;
	}

	function rebalance(address[] memory newTokens, uint[] memory newWeights,uint newTotalWeight, uint _poolIndex) internal {
	    require(poolInfo[_poolIndex].currentRebalance >0, "No balance in Pool");
		uint[] memory buf2;
		buf = buf2;
		uint ethValue;

		for (uint i = 0; i < poolInfo[_poolIndex].tokens.length; i++) {
			buf.push(tokenBalances[_poolIndex][poolInfo[_poolIndex].tokens[i]]);
			tokenBalances[_poolIndex][poolInfo[_poolIndex].tokens[i]] = 0;
		}
		
		if(totalPoolbalance[_poolIndex]>0){
		 ethValue = sellTokensForEther(poolInfo[_poolIndex].tokens, buf);   
		}

		poolInfo[_poolIndex].tokens = newTokens;
		poolInfo[_poolIndex].weights = newWeights;
		poolInfo[_poolIndex].totalWeight = newTotalWeight;
		poolInfo[_poolIndex].currentRebalance = poolInfo[_poolIndex].currentRebalance.add(1);
		poolInfo[_poolIndex].lastrebalance = block.timestamp;
		
		if (ethValue == 0) {
		    return;
		}
		
		uint[] memory buf3;
		buf = buf3;
		
		if(totalPoolbalance[_poolIndex]>0){
		 swap2(WETH_ADDRESS, ethValue, newTokens, newWeights,newTotalWeight,buf);
		
		for(uint i = 0; i < poolInfo[_poolIndex].tokens.length; i++) {
			tokenBalances[_poolIndex][poolInfo[_poolIndex].tokens[i]] = buf[i];
	    	
		}  
		}
		
	}

	function swap(address _token, uint _value, address[] memory _tokens, uint[] memory _weights, uint _totalWeight) internal returns(address[] memory, uint[] memory) {
		uint _tokenPart;
		uint _amount;
		uint[] memory _distribution;
        
		for(uint i = 0; i < _tokens.length; i++) { 
		    
		    _tokenPart = _value.mul(_weights[i]).div(_totalWeight);

			(_amount, _distribution) = IOneSplit(EXCHANGE_CONTRACT).getExpectedReturn(IERC20(_token), IERC20(_tokens[i]), _tokenPart, 2, 0);

			if (_token == ETH_ADDRESS) {
				IOneSplit(EXCHANGE_CONTRACT).swap.value(_tokenPart)(IERC20(_token), IERC20(_tokens[i]), _tokenPart, _amount, _distribution, 0);
			} else {
			    IERC20(_tokens[i]).approve(EXCHANGE_CONTRACT, _tokenPart);
				IOneSplit(EXCHANGE_CONTRACT).swap(IERC20(_token), IERC20(_tokens[i]), _tokenPart, _amount, _distribution, 0);
			}
			
			_weights[i] = _amount;
		}
		
		return (_tokens, _weights);
	}
	
	function swap2(address _token, uint _value, address[] memory newTokens, uint[] memory newWeights,uint newTotalWeight, uint[] memory _buf) internal {
		uint _tokenPart;
		uint _amount;
		buf = _buf;
		
		uint[] memory _distribution;
		
		IERC20(_token).approve(EXCHANGE_CONTRACT, _value);
		
		for(uint i = 0; i < newTokens.length; i++) {
            
			_tokenPart = _value.mul(newWeights[i]).div(newTotalWeight);
			
			if(_tokenPart == 0) {
			    buf.push(0);
			    continue;
			}
			
			(_amount, _distribution) = IOneSplit(EXCHANGE_CONTRACT).getExpectedReturn(IERC20(_token), IERC20(newTokens[i]), _tokenPart, 2, 0);
			
			IOneSplit(EXCHANGE_CONTRACT).swap(IERC20(_token), IERC20(newTokens[i]), _tokenPart, _amount, _distribution, 0);
            buf.push(_amount);
		}
	}
}