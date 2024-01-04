// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../src/timelock.sol";
import "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol";


contract TimelockTest is Test {
    Timelock public timelock;
    uint delay;
    address target;
    uint value = 0;
    string chain = "Ethereum";
    string signature = "setDelay(uint256)" ;
    bytes data;
    bytes revertData;
    uint eta;
    uint differenteta;
    address public owner = address(this);
    address public user1 = address(1);
    address public user2 = address(2);

    function setUp() public {
        delay = 120;
        IAxelarGasService sampleGasService = IAxelarGasService(address(this));
        IAxelarGateway sampleAxelarGateway = IAxelarGateway(address(this));

        timelock = new Timelock("Ethereum", address(this), 120, address(sampleAxelarGateway), address(sampleGasService));
    }

    function testConstructorSetsAdmin() public {
        assertEq(timelock.admin(), address(this));
    }

    function testConstructorSetsDelay() public {
        assertEq(timelock.delay(), 120);
    }

    function testSetDelayFail() public {
        vm.expectRevert(bytes("Timelock::setDelay: Call must come from Timelock."));
        timelock.setDelay(600000);
    }

    function testSetPendingAdminFail() public {
        vm.prank(user1);
        vm.expectRevert(bytes("Timelock::setPendingAdmin: First call must come from admin."));
        timelock.setPendingAdmin(user1);
    }

    function testSetPendingAdmin() public {
        timelock.setPendingAdmin(user1);
        assertEq(timelock.pendingAdmin(), user1);
    }

    function testAcceptAdminFail() public {
        timelock.setPendingAdmin(user1);
        vm.expectRevert(bytes("Timelock::acceptAdmin: Call must come from pendingAdmin."));
        timelock.acceptAdmin();
    }

    function testAcceptAdmin() public {
        timelock.setPendingAdmin(user1);
        vm.prank(user1);
        timelock.acceptAdmin();
        assertEq(timelock.pendingAdmin(), address(0));
        assertEq(timelock.admin(), user1);
    }

    function testSetL2GovernanceContractFailNotAdmin() public {
        vm.prank(user1);
        vm.expectRevert(bytes("Timelock::setL2GovernanceContract: Call must come from Timelock."));
        timelock.setL2GovernanceContract("arbitrum", address(10));
    }

    function testQueueTransactionFailNotAdmin() public {
        eta = block.timestamp + delay;
        target = address(timelock);
        data = abi.encode(50000);
        vm.prank(user1);
        vm.expectRevert(bytes("Timelock::queueTransaction: Call must come from admin."));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
    }

    function testQueueTransactionFail() public {
        eta = block.timestamp + delay - 1;
        target = address(timelock);
        data = abi.encode(50000);
        vm.expectRevert(bytes("Timelock::queueTransaction: Estimated execution block must satisfy delay."));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
    }

    function testQueueTransaction() public {
        eta = block.timestamp + delay ;
        target = address(timelock);
        data = abi.encode(50000);
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        assertEq(timelock.queuedTransactions(queuedtxnHash), false);
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
    }

    function testCancelTransactionFail() public {
        eta = block.timestamp + delay ;
        target = address(timelock);
        data = abi.encode(50000);
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        vm.prank(user1);
        vm.expectRevert(bytes("Timelock::cancelTransaction: Call must come from admin."));
        timelock.cancelTransaction(chain, target, value, signature, data, eta);
    }

    function testCancelTransaction() public {
        eta = block.timestamp + delay;
        target = address(timelock);
        data = abi.encode(50000);
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
        timelock.cancelTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), false);
    }

    function testEmptyQueueAndCancelTransaction() public {
        eta = block.timestamp + delay ;
        target = address(timelock);
        signature = "";
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        assertEq(timelock.queuedTransactions(queuedtxnHash), false);
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
        timelock.cancelTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), false);
    }

    function testExecuteTransactionFailNotAdmin() public {
        eta = eta + delay + 100;
        target = address(timelock);
        data = abi.encode(50000);
        data = abi.encode(50000000);
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        timelock.queueTransaction(chain, target, value, signature, revertData, eta);
        vm.prank(user1);
        vm.expectRevert(bytes("Timelock::executeTransaction: Call must come from admin."));
        timelock.executeTransaction(chain, target, value, signature, data, eta);
    }

    function testExecuteTransactionFailTxnNotQueued() public {
        eta = eta + delay + 100;
        differenteta = eta + 10;
        target = address(timelock);
        data = abi.encode(50000);
        revertData = abi.encodePacked(abi.encode(["uint256"], [50000000000]));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        timelock.queueTransaction(chain, target, value, signature, revertData, eta);
        vm.expectRevert(bytes("Timelock::executeTransaction: Transaction hasn't been queued."));
        timelock.executeTransaction(chain, target, value, signature, data, differenteta);
    }

    function testExecuteTransactionFailTimestamp() public {
        eta = eta + delay + 100;
        differenteta = eta + 10;
        target = address(timelock);
        data = abi.encode(50000);
        revertData = abi.encodePacked(abi.encode(["uint256"], [50000000000]));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        timelock.queueTransaction(chain, target, value, signature, revertData, eta);
        vm.expectRevert(bytes("Timelock::executeTransaction: Transaction hasn't surpassed time lock."));
        timelock.executeTransaction(chain, target, value, signature, data, eta);
    }

    function testExecuteTransaction() public {
        eta = eta + delay + 100;
        target = address(timelock);
        data = abi.encode(50000);
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
        vm.warp(eta + delay);
        timelock.executeTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), false);
        assertEq(timelock.delay(), 50000); 
    }

    function testExecuteTransactionFailTxnStale() public {
        delay = 604800;
        eta = eta + delay + 100;
        target = address(timelock);
        data = abi.encode(50000);
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
        vm.warp(eta + delay + delay + 100);
        vm.expectRevert(bytes("Timelock::executeTransaction: Transaction is stale."));
        timelock.executeTransaction(chain, target, value, signature, data, eta);
    }

    function testExecuteTransactionFailTxnReverted() public {
        eta = eta + delay + 100;
        target = address(timelock);
        data = abi.encode(50000);
        revertData = abi.encode(500000000);
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        timelock.queueTransaction(chain, target, value, signature, revertData, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
        vm.warp(eta);
        vm.expectRevert(bytes("Timelock::executeTransaction: Transaction execution reverted."));
        timelock.executeTransaction(chain, target, value, signature, revertData, eta);

    }

    function testExecuteSetPendingAdminFailNotAdmin() public {
        timelock.setPendingAdmin(address(timelock));
        target = address(timelock);
        signature = "acceptAdmin()";
        eta = block.timestamp + delay + 10;
        data = abi.encode(address(timelock));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        vm.prank(user1);
        vm.expectRevert(bytes("Timelock::executeTransaction: Call must come from admin."));
        timelock.executeTransaction(chain, target, value, signature, data, eta);
    }

    function testExecuteSetPendingAdminFailTxnNotQueued() public {
        timelock.setPendingAdmin(address(timelock));
        target = address(timelock);
        signature = "acceptAdmin()";
        eta = block.timestamp + delay + 10;
        differenteta = eta + 1;
        data = abi.encode(address(timelock));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        vm.expectRevert(bytes("Timelock::executeTransaction: Transaction hasn't been queued."));
        timelock.executeTransaction(chain, target, value, signature, data, differenteta);
    }

    function testExecuteSetPendingAdminFailTimelock() public {
        timelock.setPendingAdmin(address(timelock));
        target = address(timelock);
        signature = "acceptAdmin()";
        eta = block.timestamp + delay + 10;
        data = abi.encode(address(timelock));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        vm.expectRevert(bytes("Timelock::executeTransaction: Transaction hasn't surpassed time lock."));
        timelock.executeTransaction(chain, target, value, signature, data, eta);
    }
    
    function testExecuteSetPendingAdminFailTxnStale() public {
        delay = 604800;
        timelock.setPendingAdmin(address(timelock));
        target = address(timelock);
        signature = "acceptAdmin()";
        eta = block.timestamp + delay + 10;
        data = abi.encode(address(timelock));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        vm.warp(eta+delay+delay+100);
        vm.expectRevert(bytes("Timelock::executeTransaction: Transaction is stale."));
        timelock.executeTransaction(chain, target, value, signature, data, eta);
    }

    function testExecuteSetPendingAdmin() public {
        timelock.setPendingAdmin(address(timelock));
        target = address(timelock);
        signature = "acceptAdmin()";
        eta = block.timestamp + delay + 10;
        data = abi.encode(address(timelock));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.pendingAdmin(), address(timelock));
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
        vm.warp(eta+delay+100);
        timelock.executeTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), false);
        assertEq(timelock.admin(), address(timelock));
        assertEq(timelock.pendingAdmin(), address(0));
    }

}