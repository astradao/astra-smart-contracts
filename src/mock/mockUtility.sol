pragma solidity >=0.8.0;
pragma experimental ABIEncoderV2;

contract UniswapV3PositionUtilityMock {

    // INonfungiblePositionManager public PositionManager = IERC721(0xC36442b4a4522E871399CD717aBDD847Ab11FE88);
    function getAstraAmount (uint256 tokenID) external view returns (uint256) {
        return tokenID * 10 ** 18;
    }

}