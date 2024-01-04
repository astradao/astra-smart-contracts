// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "./interface/IPoolConfiguration.sol";
import "./interface/IDexAggregator.sol";

contract IndicesPayment is Initializable, Ownable2StepUpgradeable {
    
    using SafeMathUpgradeable for uint;
	using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 public astraAmount;

    mapping(address => uint256) public depositedAmount;

    mapping(address => uint256) public amountUtilised;

    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // ASTRA token Address
	address public ASTRTokenAddress;
    address public treasury;
    address public poolConf;
    address public exchangeContract;
    address public daaAddress;
    address private _pendingOwner;

    event Deposit(address user, uint256 amount);
    event SetAstraAmount(uint256 indexed _amount);
    event SetTreasury(address indexed _treasury);
    event SetdaaAddress(address indexed _daaAddress);

    function initialize(address _ASTRTokenAddress, address _poolConf,address _exchangeContract, address _treasury) public initializer{
		require(_ASTRTokenAddress != address(0), "zero address");
        require(_poolConf != address(0), "zero address");
        require(_exchangeContract != address(0), "zero address");
        require(_treasury != address(0), "zero address");
        poolConf = _poolConf;
        __Ownable2Step_init();
        exchangeContract = _exchangeContract;
		ASTRTokenAddress = _ASTRTokenAddress;
        treasury = _treasury;
        astraAmount = 5000000000 * uint256(10)**uint256(18);
	}

    // React to receiving ether
    fallback() external payable { }
    receive() external payable { }

    /**
	* @param _amount Amount to check for slippage.
    * @dev Function to calculate the Minimum return for slippage
    */
	function calculateMinimumReturn(uint _amount) internal view returns (uint){
		// This will get the slippage rate from configuration contract and calculate how much amount user can get after slippage.
		uint256 sliprate= IPoolConfiguration(poolConf).getslippagerate();
        uint rate = _amount.mul(sliprate).div(100);
        // Return amount after calculating slippage
		return _amount.sub(rate);
        
    }

    function validateIndicesCreation(address _userAddress) external returns(bool){
        require(msg.sender == daaAddress, "Only DAA can call");
        require(depositedAmount[_userAddress].sub(amountUtilised[_userAddress]) >= astraAmount, "Not enough balance");
        amountUtilised[_userAddress] = amountUtilised[_userAddress].add(astraAmount);
        return true;
    }

    function swapAndTransfer(address _token, uint _value) internal returns(uint) {
        uint256 minReturn;

    	(uint256 _amount,,) = DexAggregator(exchangeContract).getBestExchangeRate(_token, ASTRTokenAddress, _value);
		// Approve before selling the tokens
        if (_token == ETH_ADDRESS) {
            minReturn = calculateMinimumReturn(_amount);
			_amount = DexAggregator(exchangeContract).swapFromBestExchange{value:_value}(_token, ASTRTokenAddress, _value, minReturn);
		} else {
            IERC20Upgradeable(_token).approve(exchangeContract, _value);
		    minReturn = calculateMinimumReturn(_amount);
		    _amount = DexAggregator(exchangeContract).swapFromBestExchange(_token, ASTRTokenAddress, _value, minReturn);
		}
        require(_amount>=astraAmount,"Not enough amount");
        IERC20Upgradeable(ASTRTokenAddress).transfer(treasury, _amount);
		return _amount;
	}

    function setAstraAmount(uint256 _amount) external onlyOwner{
        astraAmount = _amount;
        emit SetAstraAmount(_amount);
    }

    function setTreasury(address _treasury) external onlyOwner{
        treasury = _treasury;
        emit SetTreasury(_treasury);
    }

    function setdaaAddress(address _daaAddress) external onlyOwner{
        daaAddress = _daaAddress;
        emit SetdaaAddress(_daaAddress);
    }

    function deposit(address _tokenAddress,uint256 _amount) external payable{
        uint returnedAmount;
        if(_tokenAddress == ETH_ADDRESS){
            require(msg.value > 0, "Amount should be greater than 0");
            returnedAmount = swapAndTransfer(_tokenAddress, msg.value);
        }else if (_tokenAddress == ASTRTokenAddress) {
            require(_amount > 0, "Amount should be greater than 0");
            require(_amount>=astraAmount,"Not enough amount");
            require(IERC20Upgradeable(ASTRTokenAddress).balanceOf(msg.sender) >= _amount, "Not enough balance");
            returnedAmount = _amount;
            IERC20Upgradeable(ASTRTokenAddress).transferFrom(msg.sender,treasury, _amount);
        }
        else{
            require(_amount > 0, "Amount should be greater than 0");
            require(IPoolConfiguration(poolConf).checkStableCoin(_tokenAddress) == true,"Not supported token");
            require(IERC20Upgradeable(_tokenAddress).balanceOf(msg.sender) >= _amount, "Not enough balance");
            IERC20Upgradeable(_tokenAddress).transferFrom(msg.sender,address(this), _amount);
            returnedAmount = swapAndTransfer(_tokenAddress, _amount);
        }

        depositedAmount[msg.sender] = depositedAmount[msg.sender].add(returnedAmount);
        emit Deposit(msg.sender, returnedAmount);

    }
}