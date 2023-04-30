pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract sampleNFTToken is ERC721 {
    constructor() ERC721("Sample", "Sample") public{}

    address public _token0;
    address public _token1;
    uint128 public _returnValue;

    function safeMint(address to, uint256 tokenId) public {
        _safeMint(to, tokenId);
    }

    function setTokens(address __token0, address __token1) external {
        _token0 = __token0;
        _token1 = __token1;
    }

    function setReturnValue(uint128 __returnValue) external{
        _returnValue = __returnValue;
    }

    function factory() external view returns(address){
        return address(this);
    }

    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address pool){
        if(tokenA == _token0 || tokenA == _token1){
            return address(this);
        }else{
            return address(0);
        }
    }

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        ){
            return(uint96(0), _token0, _token0, _token1,uint24(0),int24(0),int24(0), _returnValue,uint256(0),uint256(0),uint128(0),uint128(0));
        }

}