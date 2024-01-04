// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "./library/1inch.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract PoolConfiguration is Initializable {
    
    using SafeMath for uint;
	// Astra contract address
	address public ASTRTokenAddress;
	// Admin address
	address public adminAddress;
	// Early exit fees
	uint256 public earlyexitfees;
	// Performance fees
	uint256 public performancefees;
    // Maximum number of tokens supported by indices
	uint256 private maxTokenSupported;

	address public treasuryAddress;

	// Slippage rate.
	uint256 public slippagerate;
	//Supported stable coins
	mapping(address => bool) public supportedStableCoins;

	// Enabled DAO address
	address public enabledDAO;

	address public paymentContractAddress;
	
	// Admin addresses
	mapping(address => bool) public isBlackListed;

	event SetTreasuryAddress(address indexed _address);
	event WhitelistDAOaddress(address indexed _address);
	event SetPaymentAddress(address indexed _address);
	event UpdateBlackListStatus(address indexed _address, bool _status);
	event AddStable(address indexed _stable);
	event RemoveStable(address indexed _stable);
	event Updateadmin(address indexed _address);
	event UpdateEarlyExitFees(uint256 indexed _feesper);
	event UpdatePerfees(uint256 indexed _feesper);
	event UpdateMaxToken(uint256 indexed _maxTokenSupported);
	event UpdateSlippagerate(uint256 indexed _slippagerate);

	/**
     * @dev Modifier to check if the caller is dao or not
     */
	modifier DaoOnly{
	    require(enabledDAO == msg.sender, "dao only");
	    _;
	}
	/**
     * @dev Modifier to check if the caller is admin or not
     */
	modifier adminOnly {
	    require(adminAddress == msg.sender, "Admin only");
	    _;
	}

	function initialize(address _ASTRTokenAddress) public initializer{
		require(_ASTRTokenAddress != address(0), "Zero Address");
		ASTRTokenAddress = _ASTRTokenAddress;
		adminAddress = msg.sender;
		earlyexitfees = 2;
		performancefees = 20;
		maxTokenSupported = 10;
		slippagerate = 10;
	}
	/**
	 * @notice WhiteList DAO Address
	 * @param _address DAO conractaddress
	 * @dev Add DAO address who can update the function details.
	 */
	
	function whitelistDAOaddress(address _address) external adminOnly {
		require(_address != address(0), "Zero Address");
	    require(enabledDAO !=  _address,"whitelistDAOaddress: Already whitelisted");
	    enabledDAO = _address; 
		emit WhitelistDAOaddress(_address); 
	}

	/**
	 * @notice Set Treasury address
	 * @param _address Treasury address
	 * @dev This address will recieve fees from the index contract.
	 */

	function setTreasuryAddress(address _address) external adminOnly {
		require(_address != address(0), "Zero Address");
		treasuryAddress = _address;
		emit SetTreasuryAddress(_address);
	}

	/**
	 * @notice Set Payment contract address
	 * @param _address Payment address
	 * @dev This contract will validate index payment.
	 */

	function setPaymentAddress(address _address) external adminOnly {
		require(_address != address(0), "Zero Address");
		paymentContractAddress = _address;
		emit SetPaymentAddress(_address);
	}	

	/**
	 * @notice Set Blacklist status
	 * @param _address User address
	 * @param _status Status
	 * @dev Block list any user from depositing in index.
	 */

	function updateBlackListStatus(address _address, bool _status) external adminOnly {
		require(_address != address(0), "Zero Address");
		isBlackListed[_address] = _status;
		emit UpdateBlackListStatus(_address, _status);
	}

	function isAdmin(address _address) external view returns(bool){
		return (adminAddress == _address);
	}

	function addStable(address _stable) external DaoOnly{
		require(_stable != address(0), "Zero Address");
		require(supportedStableCoins[_stable] == false,"addStable: Stable coin already added");
		supportedStableCoins[_stable] = true;
		emit AddStable(_stable);
	}

	function removeStable(address _stable) external DaoOnly{
		require(_stable != address(0), "Zero Address");
		require(supportedStableCoins[_stable] == true,"removeStable: Stable coin already removed");
		supportedStableCoins[_stable] = false;
		emit RemoveStable(_stable);
	}
	
	/**
	 * @notice Remove whitelist admin address
	 * @param _address User address
	 * @dev Update the address of admin. By default it is contract deployer. Admin has permission to update the dao address.
	 */
	function updateadmin(address _address) external adminOnly {
		require(_address != address(0), "Zero Address");
	    require(_address != adminAddress,"updateadmin: Already admin");
	    adminAddress = _address;
		emit Updateadmin(_address);
	}  

	/**
	 * @notice Update Early Exit Fees
	 * @param _feesper New Fees amount
	 * @dev Only DAO can update the Early Exit fees. This will only be called by creating proposal.
	 */  

	function updateEarlyExitFees (uint256 _feesper) external DaoOnly{
        require(_feesper<50,"updateEarlyExitFees: Only less than 100");
        earlyexitfees = _feesper;
		emit UpdateEarlyExitFees(_feesper);
    }

	/**
	 * @notice Update Performance Fees
	 * @param _feesper New Fees amount
	 * @dev Only DAO can update the Performance fees.  This will only be called by creating proposal.
	 */ 

     function updatePerfees (uint256 _feesper) external DaoOnly{
        require(_feesper<50,"updatePerfees: Only less than 100");
        performancefees = _feesper;
		emit UpdatePerfees(_feesper);
    }

    /**
	 * @notice Update maximum token for indices
	 * @param _maxTokenSupported New maximum tokens in a indices
	 * @dev Only DAO can update the maximum tokens.  This will only be called by creating proposal.
	 */ 

     function updateMaxToken (uint256 _maxTokenSupported) external DaoOnly{
        require(_maxTokenSupported<100,"updateMaxToken: Only less than 100");
        maxTokenSupported = _maxTokenSupported;
		emit UpdateMaxToken(_maxTokenSupported);
    }

	/**
	 * @notice Update Slippage Rate
	 * @param _slippagerate New slippage amount
	 * @dev Only DAO can update the Early Exit fees. This will only be called by creating proposal.
	 */ 

	function updateSlippagerate (uint256 _slippagerate) external DaoOnly{
        require(_slippagerate<30,"updateSlippagerate: Only less than 100");
        slippagerate = _slippagerate;
		emit UpdateSlippagerate(_slippagerate);
    }

	/** 
	 * @dev Get the Early exit fees. This will be called by the poolV1 contract to calculate early exit fees.
	 */

	function getEarlyExitfees() external view returns(uint256){
		return earlyexitfees;
	}

	/** 
	 * @dev Get the Performance fees This will be called by the poolV1 contract to calculate performance fees.
	 */

	function getperformancefees() external view returns(uint256){
		return performancefees;
	 } 

	 /** 
	 * @dev Get the max token supported  This will be called by the poolV1 contract to create/update indices.
	 */

	function getmaxTokenSupported() external view returns(uint256){
		return maxTokenSupported;
	 }

	 /** 
	 * @param daoAddress Address to check
	 * @dev Check if Address has dao permission or not. This will be used to check if the account is whitelisted or not.
	 */   
	  function checkDao(address daoAddress) external view returns(bool){
		  return enabledDAO == daoAddress;
	  }

	 /** 
	 * @dev Get the Performance fees. This will be called by the poolV1 contract to calculate slippage.
	 */

	 function getslippagerate() external view returns(uint256){
		 return slippagerate;
	 }  

	 function checkStableCoin(address _stable) external view returns(bool){
		 return supportedStableCoins[_stable];
	 }
}