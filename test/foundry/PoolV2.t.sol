// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../src/poolv2.sol";
import "../../src/poolConfiguration.sol";
//import "../../src/itoken-staking.sol";
import "../../src/itoken.sol";
import "../../src/chefv2.sol";
import "../../src/astr.sol";
import "../../src/mock/sample-erc20.sol";
import "../../src/swapv2.sol";
import "../../src/mock/sample-erc20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../src/indiciespayment.sol";

contract PoolV2Test is Test {

    PoolConfiguration public poolConfiguration;
    AstraDAOToken public astra;
    PoolV2 public poolV2;

    itokendeployer public itokenDeployer;
    SwapV2 public swapV2;
    MasterChefV2 public chefV2;
    IndicesPayment public indicesPayment;
    address constant public SUSHISWAP_ROUTER = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;
    address constant public UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address constant public UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address constant public UNISWAP_V3_QUOTER = 0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6;
    address constant public ETH_ADDRESS = 0x0000000000000000000000000000000000000000;
    address constant public DAI_ADDRESS = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address constant public USDC_ADDRESS = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant public ASTRA_ADDRESS = 0x7E9c15C43f0D6C4a12E6bdfF7c7D55D0f80e3E23;
    address constant public WETH_ADDRESS = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    IERC20 public aaveToken = IERC20(0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9);
    IERC20 public apeToken = IERC20(0x4d224452801ACEd8B2F0aebE155379bb5D594381);
    IERC20 public daiToken = IERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    IERC20 public usdcToken = IERC20(USDC_ADDRESS);
    IERC20 public usdtToken = IERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7);
    address[] public _tokens;
    address[] public indexTokens;
    uint[] public indexTokenWeights;
    address public owner = address(this);
    address public user1 = address(1);
    address public user2 = address(2);




    function setUp() public {
        astra = AstraDAOToken(ASTRA_ADDRESS);
        swapV2 = new SwapV2();
        swapV2.initialize(SUSHISWAP_ROUTER, UNISWAP_V2_ROUTER, UNISWAP_V3_ROUTER, UNISWAP_V3_QUOTER);
        _tokens.push(ETH_ADDRESS);
        _tokens.push(DAI_ADDRESS);
        _tokens.push(USDC_ADDRESS);
        swapV2.setTokensPath(_tokens);
        chefV2 = new MasterChefV2();
        chefV2.initialize(astra, block.number, block.number+1000, 10000000000000000000);
        itokenDeployer = new itokendeployer();
        poolConfiguration = new PoolConfiguration();
        poolConfiguration.initialize(address(astra));
        indicesPayment = new IndicesPayment();
        indicesPayment.initialize(address(astra), address(poolConfiguration), owner, owner);
        indicesPayment.setAstraAmount(0);
        poolConfiguration.setPaymentAddress(address(indicesPayment));
        poolV2 = new PoolV2();
        poolV2.initialize(ASTRA_ADDRESS, address(poolConfiguration), address(itokenDeployer), address(chefV2), address(swapV2), WETH_ADDRESS, USDC_ADDRESS);
        indicesPayment.setdaaAddress(address(poolV2));
        chefV2.whitelistDepositContract(address(poolV2),true);
        itokenDeployer.addDaaAdress(address(poolV2));
        indexTokens.push(address(apeToken));
        indexTokens.push(ASTRA_ADDRESS);
        indexTokenWeights.push(2);
        indexTokenWeights.push(2);
        poolV2.addPublicPool(indexTokens, indexTokenWeights,100,100,"First Itoken","ITOKEN1","Test Description");

    }

}

