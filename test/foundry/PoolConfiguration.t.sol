// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../src/poolConfiguration.sol";
import "../../src/indiciespayment.sol";
import "../../src/astr.sol";
import "../../src/mock/sample-erc20.sol";


contract PoolV2Test is Test {

    PoolConfiguration public poolConfiguration;
    AstraDAOToken public astra;
    IndicesPayment public indicesPayment;
    address public owner = address(this);
    address public user1 = address(1);
    address public user2 = address(2);
    address public testcoin = address(11);

    function setUp() public {
        astra = new AstraDAOToken();
        astra.initialize(address(this));
        poolConfiguration = new PoolConfiguration();
        poolConfiguration.initialize(address(astra));
        indicesPayment = new IndicesPayment();
        indicesPayment.initialize(address(astra), address(poolConfiguration), owner, owner);
        indicesPayment.setAstraAmount(0);
        poolConfiguration.setPaymentAddress(address(indicesPayment));
        
    }

    function testWhitelistDAOaddressFailNotAdmin() public {
        vm.prank(user1);
        vm.expectRevert(bytes("Admin only"));
        poolConfiguration.whitelistDAOaddress(owner);
    }

    function testWhitelistDAOaddress() public {
        assertEq(poolConfiguration.checkDao(owner), false);
        poolConfiguration.whitelistDAOaddress(owner);
        assertEq(poolConfiguration.checkDao(owner), true);
    }

    function testWhitelistDAOaddressFailNotUpdateTwice() public {
        poolConfiguration.whitelistDAOaddress(owner);
        vm.expectRevert(bytes("whitelistDAOaddress: Already whitelisted"));
        poolConfiguration.whitelistDAOaddress(owner);
    }
    
    function testWhitelistDAOaddressFailZeroAddress() public {
        vm.expectRevert(bytes("Zero Address"));
        poolConfiguration.whitelistDAOaddress(address(0));
    }

    function testWhitelistDAOaddressShouldDisable() public {
        assertEq(poolConfiguration.checkDao(owner), false);
        poolConfiguration.whitelistDAOaddress(owner);
        assertEq(poolConfiguration.checkDao(owner), true);
        poolConfiguration.whitelistDAOaddress(user1);
        assertEq(poolConfiguration.checkDao(owner), false);

    }

    function testAdmin() public {
        assert(poolConfiguration.isAdmin(owner));
    }

    function testUpdateAdminFailAlreadyAdmin() public {
        vm.expectRevert(bytes("updateadmin: Already admin"));
        poolConfiguration.updateadmin(owner);
    }

    function testUpdateAdminFailNotAdmin() public {
        vm.prank(user1);
        vm.expectRevert(bytes("Admin only"));
        poolConfiguration.updateadmin(owner);
    }

    function testUpdateAdminFailZeroAddress() public {
        vm.expectRevert(bytes("Zero Address"));
        poolConfiguration.updateadmin(address(0));
    }

    function testUpdateAdmin() public {
        poolConfiguration.updateadmin(user1);
        assertEq(poolConfiguration.adminAddress(), user1);
    }

    function testPerformaceFees() public {
        assertEq(poolConfiguration.getperformancefees(), 20);
    }

    function testUpdatePerfeesFailDaoOnly() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.expectRevert(bytes("dao only"));
        poolConfiguration.updatePerfees(25);
    }

    function testUpdatePerfees() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.prank(user1);
        poolConfiguration.updatePerfees(25);
        assertEq(poolConfiguration.getperformancefees(), 25);
    }

    function testUpdatePerfeesFailLessThan100() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.prank(user1);
        vm.expectRevert(bytes("updatePerfees: Only less than 100"));
        poolConfiguration.updatePerfees(60);
    }

    function testSlippageRate() public {
        assertEq(poolConfiguration.getslippagerate(), 10);
    }

    function testUpdateSlippagerateFailDaoOnly() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.expectRevert(bytes("dao only"));
        poolConfiguration.updateSlippagerate(5);
    }

    function testUpdateSlippageRate() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.prank(user1);
        poolConfiguration.updateSlippagerate(5);
        assertEq(poolConfiguration.getslippagerate(), 5);
    }

    function testUpdateSlippageRateFailLessThan100() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.prank(user1);
        vm.expectRevert(bytes("updateSlippagerate: Only less than 100"));
        poolConfiguration.updateSlippagerate(40);
    }

    function testAddStableFailNotDao() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.expectRevert(bytes("dao only"));
        poolConfiguration.addStable(testcoin);

    }

    function testAddStable() public {
        poolConfiguration.whitelistDAOaddress(user1);
        assertEq(poolConfiguration.checkStableCoin(testcoin), false);
        vm.prank(user1);
        poolConfiguration.addStable(testcoin);
        assertEq(poolConfiguration.checkStableCoin(testcoin), true);
    }

    function testAddStableFailAlreadyAdded() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.prank(user1);
        poolConfiguration.addStable(testcoin);
        assertEq(poolConfiguration.checkStableCoin(testcoin), true);
        vm.prank(user1);
        vm.expectRevert(bytes("addStable: Stable coin already added"));
        poolConfiguration.addStable(testcoin);
    }

    function testAddStableFailZeroAddress() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.prank(user1);
        vm.expectRevert(bytes("Zero Address"));
        poolConfiguration.addStable(address(0));
    }

    function testRemoveStableFailNotDao() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.prank(user1);
        poolConfiguration.addStable(testcoin);
        vm.expectRevert(bytes("dao only"));
        poolConfiguration.removeStable(testcoin);

    }

    function testRemoveStable() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.prank(user1);
        poolConfiguration.addStable(testcoin);
        assertEq(poolConfiguration.checkStableCoin(testcoin), true);
        vm.prank(user1);
        poolConfiguration.removeStable(testcoin);
        assertEq(poolConfiguration.checkStableCoin(testcoin), false);
    }

    function testRemoveStableFailAlreadyRemoved() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.prank(user1);
        vm.expectRevert(bytes("removeStable: Stable coin already removed"));
        poolConfiguration.removeStable(testcoin);
    }

    function testRemoveStableFailZeroAddress() public {
        poolConfiguration.whitelistDAOaddress(user1);
        vm.prank(user1);
        vm.expectRevert(bytes("Zero Address"));
        poolConfiguration.addStable(address(0));
    }

}
