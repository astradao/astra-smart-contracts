// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../src/timelock.sol";


contract TimelockTestArbitrum is Test {
    Timelock public timelock;
    uint delay;
    address target;
    uint value = 0;
    string chain = "arbitrum";
    string signature = "setManagerChain(string)" ;
    bytes data;
    bytes revertData;
    uint eta;
    uint differenteta;
    address public owner = address(this);
    address public user1 = address(1);
    address public user2 = address(2);
    address GovernorBetacontract;

    function setUp() public {
        delay = 604800;
        // AxelarGasSerive contract on L1
        address gasService = address(0x013459EC3E8Aeced878C5C4bFfe126A366cd19E9);
        // AxelarGateway contract on L1
        address axelarGateway = address(0x28f8B50E1Be6152da35e923602a2641491E71Ed8);
        // GovernorBetacontract on L2, put in the address from script
        GovernorBetacontract = address(1);

        timelock = new Timelock("Ethereum", address(this), delay, axelarGateway, gasService);
        target = GovernorBetacontract;
    }

    function testConstructorSetsAdmin() public {
        assertEq(timelock.admin(), address(this));
        assertEq(address(timelock.AxelarGasService()), address(0x013459EC3E8Aeced878C5C4bFfe126A366cd19E9));
    }

    function testConstructorSetsDelay() public {
        assertEq(timelock.delay(), delay);
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
        data = abi.encode("Polygon");
        vm.prank(user1);
        vm.expectRevert(bytes("Timelock::queueTransaction: Call must come from admin."));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
    }

    function testQueueTransactionFail() public {
        eta = block.timestamp + delay - 1;
        data = abi.encode("Polygon");
        vm.expectRevert(bytes("Timelock::queueTransaction: Estimated execution block must satisfy delay."));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
    }

    function testQueueTransaction() public {
        eta = block.timestamp + delay ;
        data = abi.encode("Polygon");
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        assertEq(timelock.queuedTransactions(queuedtxnHash), false);
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
    }

    function testCancelTransactionFail() public {
        eta = block.timestamp + delay ;
        data = abi.encode("Polygon");
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        vm.prank(user1);
        vm.expectRevert(bytes("Timelock::cancelTransaction: Call must come from admin."));
        timelock.cancelTransaction(chain, target, value, signature, data, eta);
    }

    function testCancelTransaction() public {
        eta = block.timestamp + delay;
        data = abi.encode("Polygon");
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
        timelock.cancelTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), false);
    }

    function testEmptyQueueAndCancelTransaction() public {
        eta = block.timestamp + delay ;
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
        data = abi.encode("Polygon");
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        timelock.queueTransaction(chain, target, value, signature, revertData, eta);
        vm.prank(user1);
        vm.expectRevert(bytes("Timelock::executeTransaction: Call must come from admin."));
        timelock.executeTransaction(chain, target, value, signature, data, eta);
    }

    function testExecuteTransactionFailTxnNotQueued() public {
        eta = eta + delay + 100;
        differenteta = eta + 10;
        data = abi.encode("Polygon");
        revertData = abi.encodePacked(abi.encode(["string"], ["Polygon"]));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        timelock.queueTransaction(chain, target, value, signature, revertData, eta);
        vm.expectRevert(bytes("Timelock::executeTransaction: Transaction hasn't been queued."));
        timelock.executeTransaction(chain, target, value, signature, data, differenteta);
    }

    function testExecuteTransactionFailTimestamp() public {
        eta = eta + delay + 100;
        data = abi.encode("Polygon");
        revertData = abi.encodePacked(abi.encode(["string"], ["Polygon"]));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        timelock.queueTransaction(chain, target, value, signature, revertData, eta);
        vm.expectRevert(bytes("Timelock::executeTransaction: Transaction hasn't surpassed time lock."));
        timelock.executeTransaction(chain, target, value, signature, data, eta);
    }

    function testSetL2GovernanceContract() public {
        eta = eta + delay + 100;
        chain = "Ethereum";
        target = address(timelock);
        signature = "setL2GovernanceContract(string,address)";
        data = abi.encode("arbitrum", GovernorBetacontract);
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
        vm.warp(eta + delay);
        timelock.executeTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), false);
        assertEq(timelock.getL2GovernanceContract("arbitrum"), GovernorBetacontract);
    }

    function testExecuteTransaction() public {
        
        testSetL2GovernanceContract();

        eta = eta + delay + delay + 100;
        chain = "arbitrum";
        target = address(GovernorBetacontract);
        signature = "setManagerChain(string)";
        data = abi.encode("Polygon");
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
        vm.warp(eta + delay);
        timelock.executeTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), false);
    }

    function testExecuteTransactionFailTxnStale() public {
        eta = eta + delay + 100;
        data = abi.encode("Polygon");
        bytes32 queuedtxnHash = keccak256(abi.encode(chain, target, value, signature, data, eta));
        timelock.queueTransaction(chain, target, value, signature, data, eta);
        assertEq(timelock.queuedTransactions(queuedtxnHash), true);
        vm.warp(eta + delay + delay + 100);
        vm.expectRevert(bytes("Timelock::executeTransaction: Transaction is stale."));
        timelock.executeTransaction(chain, target, value, signature, data, eta);
    }

}