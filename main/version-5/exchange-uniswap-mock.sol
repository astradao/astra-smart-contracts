pragma solidity ^0.5.0;

// import "../../other/token.sol";
import "../../other/1inch.sol";

contract MockExchangeUniswap {
    using SafeMath for uint;
    IERC20 public Token1;
    IERC20 public Token2;
    IERC20 public Token3;
    IERC20 public Token4;
    IERC20 public Astra;
    IERC20 public DAI;
    IERC20 public ETH_ADDRESS;
    address public constant eth = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;


    uint256 public ethbalance;
    uint256 _returnAmount;
    uint8 _distribution;

  constructor(address _token1,address _token2, address _token3, address _token4, address _dai,address _astr) public {
      Token1 = IERC20(_token1);
      Token2 = IERC20(_token2);
      Token3 = IERC20(_token3);
      Token4 = IERC20(_token4);
      Astra = IERC20(_astr);
      DAI = IERC20(_dai);
      ETH_ADDRESS = IERC20(eth);
  }

 function getRate(IERC20 fromToken,IERC20 destToken,uint256 amount) internal view returns(
     uint256,
     uint8
        ){
     if(fromToken == DAI){
         if(destToken == Token1){
             return (amount,_distribution);
         }else if(destToken == Token2){
             return (amount.mul(2),_distribution);
         }else if(destToken == Token3){
             return (amount.mul(3),_distribution);
         }else if(destToken == Token4){
             return (amount.mul(4),_distribution);
         }else {
             return (amount,_distribution);
         }

     }else if(fromToken == ETH_ADDRESS){
         return (amount,_distribution);
     }
     else {

         if(fromToken == Token1){
             return (amount,_distribution);
         }else if(fromToken == Token2){
             return (amount.div(2),_distribution);
         }else if(fromToken == Token3){
             return (amount.div(3),_distribution);
         }else if(fromToken == Token4){
             return (amount.div(4),_distribution);
         }else {
             uint _returnAmount= convertToBaseDecimal(amount,fromToken.decimals());
             return (_returnAmount,_distribution);
         }

     }
     
 }
 function convertToBaseDecimal(uint256 _amount, uint8 _decimal) internal view returns (uint256){
		uint8 baseDecimal = 18;
		uint diff;
		if(baseDecimal>_decimal){
			diff = baseDecimal- _decimal;
            return _amount * 10**diff;
			
		}else{
            diff = _decimal - baseDecimal;
            return _amount / 10**diff;
		}
}
  function getBestExchangeRate(
        IERC20 fromToken,
        IERC20 destToken,
        uint256 amount// See contants in IOneSplit.sol
    )
        public
        payable
        returns(
            uint256 returnAmount,
            uint8 distribution
        )
    {
        return getRate(fromToken,destToken,amount);
    }
    function swapFromBestExchange(
        IERC20 fromToken,
        IERC20 destToken,
        uint256 amount,
        uint256 minReturn,
        uint24 distribution 
    ) public payable returns(uint256) {
        uint256 returnAmount;
        uint8 Distribution;
        (returnAmount,Distribution) = getRate(fromToken,destToken,amount);
        if(fromToken == ETH_ADDRESS){
           destToken.transfer(msg.sender,returnAmount);
           ethbalance = ethbalance.add(msg.value);
        }
        else{
          fromToken.transferFrom(msg.sender,address(this),amount);
          destToken.transfer(msg.sender,returnAmount);
        }
        return returnAmount;
    }

}