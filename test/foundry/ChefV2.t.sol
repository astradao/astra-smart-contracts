// // SPDX-License-Identifier: BUSL-1.1
// pragma solidity 0.8.19;

// import "forge-std/Test.sol";
// import "forge-std/console.sol";
// import "../../src/poolv2.sol";
// import "../../src/poolConfiguration.sol";
// //import "../../src/itoken-staking.sol";
// import "../../src/itoken.sol";
// import "../../src/governance.sol";
// import "../../src/chefv2.sol";
// import "../../src/astr.sol";
// import "../../src/mock/sample-erc20.sol";
// import "../../src/swapV2.sol";
// import "../../src/indiciespayment.sol";


// contract MasterChefV2Test is Test{
//     AstraDAOToken public astra;
//     MasterChefV2 public chef;
//     GovernorAlphaMock public governance;

//     address public owner = address(this);
//     address public user1 = address(1);
//     address public user2 = address(2);
//     address public user3 = address(3);

//     uint256 BASE_AMOUNT = 1000000;
//     uint256 TOTAL_REWARD = 10000;

//     address constant public ASTRA_ADDRESS = 0x7E9c15C43f0D6C4a12E6bdfF7c7D55D0f80e3E23;

//     function setUp() public {
//         astra = AstraDAOToken(ASTRA_ADDRESS);

//         uint256 startBlock = block.number + 20;
//         uint256 endBlock = startBlock + 100;

//         chef = new MasterChefV2();
//         chef.initialize(astra, startBlock, endBlock, TOTAL_REWARD * 1e18);
//         governance = new GovernorAlphaMock();

//         chef.setGovernanceAddress(address(governance));

//         astra.approve(address(chef), TOTAL_REWARD * 1e18);
        
//         astra.transfer(user1, BASE_AMOUNT * 1e18);
//         vm.prank(user1);
//         astra.approve(address(chef), BASE_AMOUNT * 1e18);

//         astra.transfer(user2, BASE_AMOUNT * 1e18);
//         vm.prank(user2);
//         astra.approve(address(chef), BASE_AMOUNT * 1e18);

//         astra.transfer(address(0), BASE_AMOUNT * 1e18);
//         vm.prank(address(0));
//         astra.approve(address(chef), BASE_AMOUNT * 1e18);

//         astra.transfer(address(chef), TOTAL_REWARD * 1e18);
//     }

// }