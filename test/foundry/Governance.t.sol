// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../src/timelock.sol";
import "../../src/chefv2.sol";
import "../../src/astr.sol";
import "../../src/mock/sample-erc20.sol";
import "../../src/governance.sol";
import "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";
import "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol";

contract governanceTest is Test {
    GovernorAlpha public governance;
    AstraDAOToken public astra;
    MasterChefV2 public chefV2;
    TESTERC20 public lp;
    TESTERC20 public weth;
    Timelock public timelock;
    address public owner = address(this);
    address public user1 = address(1);
    address public user2 = address(2);
    // Parameters for a proposal 
    address[] public targets;
    uint256[] public values;
    string[] public signatures;
    bytes[] public calldatas;
    string public description;
    bool public fundametalChanges;


    /// @notice Possible states that a proposal may be in
    enum ProposalState {
        Pending,
        Active,
        Canceled,
        Defeated,
        Succeeded,
        Queued,
        Expired,
        Executed
    }

    function setUp() public {
        weth = new TESTERC20("Weth", "WETH", 18);
        lp = new TESTERC20("LPToken", "LP", 18);
        astra = new AstraDAOToken();
        astra.initialize(address(this));

        IAxelarGasService sampleGasService = IAxelarGasService(address(this));
        IAxelarGateway sampleAxelarGateway = IAxelarGateway(address(this));

        timelock = new Timelock("Ethereum", address(this), 120, address(sampleAxelarGateway), address(sampleGasService));
        chefV2 = new MasterChefV2();
        chefV2.initialize(astra, 0, 1000, 1000000);
        governance = new GovernorAlpha();
        governance.initialize(address(timelock), address(astra), address(chefV2));
        chefV2.whitelistDepositContract(address(governance), true);
        //Configure Astra contract
        astra.transfer(user1, 100000 * (10**18));
        astra.transfer(user2, 100000 * (10**18));
        timelock.setPendingAdmin(address(governance));
        governance._acceptAdmin();
        astra.approve(address(chefV2), 1000000000 * (10**18));
        chefV2.deposit(100 * (10**18), 0, 0, false);
        chefV2.deposit(1000000 * (10**18), 12, 0, false);
        vm.prank(user1);
        astra.approve(address(chefV2), 1000000000 * (10**18));
        vm.prank(user1);
        chefV2.deposit(100000 * (10**18), 12, 0, false);
        vm.prank(user2);
        astra.approve(address(chefV2), 1000000000 * (10**18));
        vm.prank(user2);
        chefV2.deposit(100000 * (10**18), 12, 0, false);

    }

    function testCreatePropose() public {
        
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        assertEq(governance.proposalCount(), 1);
    }

    function testCreateProposeFailOnlyOneProposalPerDay() public {

        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.expectRevert(bytes("GovernorAlpha::propose: Only one proposal can be create in one day"));
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
    }

    function testCreateProposeFailForUnregisteredChain() public {

        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.expectRevert(bytes("GovernorAlpha::propose: Governance Contract not set for chain"));
        governance.propose("arbitrum", targets, values, signatures, calldatas, description, fundametalChanges);
    }

    function testCreateProposeFailInfoMismatch() public {
        targets.push(address(governance));  
        values.push(0);        
        //signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(bytes("GovernorAlpha::propose: proposal function information arity mismatch"));
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
    }

    function testCreateProposeFailNoAction() public {
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(bytes("GovernorAlpha::propose: must provide actions"));
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
    }

    function testCreateProposeFailOnlyOneActiveProposalPerUser() public {
        
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(bytes("GovernorAlpha::propose: one live proposal per proposer, found an already pending proposal"));
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
    }

    function testVote() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.roll(3);
        governance.castVote(1, true);
    }

    function testVoteFailVotingClosed() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.roll(455001);
        vm.expectRevert(bytes("GovernorAlpha::_castVote: voting is closed"));
        governance.castVote(1, true);
    }

    function testVoteFailVoterVoted() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.roll(3);
        governance.castVote(1, true);
        vm.expectRevert(bytes("GovernorAlpha::_castVote: voter already voted"));
        governance.castVote(1, true);
    }

    function testQueue() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.roll(3);
        address user = address(0);
        for( uint160 i = 1; i <= 33;i++) {
            user = address(i);
            astra.transfer(user, 100000 * (10**18));
            vm.startPrank(user);

            astra.approve(address(chefV2), 1000000000 * (10**18));
            chefV2.deposit(10000 * (10**18), 12, 0, false);
            astra.approve(address(governance), 1000000000000000000000000000000);
            governance.castVote(1, true);

            vm.stopPrank();

        } 
        vm.roll(455005);
        // console.log(uint(governance.state(1)));
        // (,uint256 governors) = governance.votersInfo(1);
        // console.log(governors);       
        governance.queue(1);
        assertEq(uint(governance.state(1)), 5);

    }

    function testQueueFailVotingNotEnd() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);  
        vm.expectRevert(bytes("GovernorAlpha::queue: proposal can only be queued if it is succeeded"));
        governance.queue(1);

    }

    function testExecuteFailNotQueued() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.roll(3);
        address user = address(0);
        for( uint160 i = 1; i <= 33;i++) {
            user = address(i);
            astra.transfer(user, 100000 * (10**18));
            vm.startPrank(user);

            astra.approve(address(chefV2), 1000000000 * (10**18));
            chefV2.deposit(10000 * (10**18), 12, 0, false);
            astra.approve(address(governance), 1000000000000000000000000000000);
            governance.castVote(1, true);

            vm.stopPrank();

        } 
        vm.roll(455005);
        vm.expectRevert(bytes("GovernorAlpha::execute: proposal can only be executed if it is queued"));
        governance.execute(1);

    }

    function testExecuteFailTimelock() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.roll(3);
        address user = address(0);
        for( uint160 i = 1; i <= 33;i++) {
            user = address(i);
            astra.transfer(user, 100000 * (10**18));
            vm.startPrank(user);

            astra.approve(address(chefV2), 1000000000 * (10**18));
            chefV2.deposit(10000 * (10**18), 12, 0, false);
            astra.approve(address(governance), 1000000000000000000000000000000);
            governance.castVote(1, true);

            vm.stopPrank();

        } 
        vm.roll(455005);
        governance.queue(1);
        vm.expectRevert(bytes("Timelock::executeTransaction: Transaction hasn't surpassed time lock."));
        governance.execute(1);

    }

    function testExecute() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.roll(3);
        address user = address(0);
        for( uint160 i = 1; i <= 33;i++) {
            user = address(i);
            astra.transfer(user, 100000 * (10**18));
            vm.startPrank(user);

            astra.approve(address(chefV2), 1000000000 * (10**18));
            chefV2.deposit(10000 * (10**18), 12, 0, false);
            astra.approve(address(governance), 1000000000000000000000000000000);
            governance.castVote(1, true);

            vm.stopPrank();

        } 
        vm.roll(455005);
        governance.queue(1);
        vm.warp(block.timestamp + 1 days + 1150);
        governance.execute(1);
        assertEq(uint(governance.state(1)), 7);

    }

    function testProposalDefeatedNotenoughGovernor() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.roll(3);
        governance.castVote(1, true);
        vm.roll(455005);
        assertEq(uint(governance.state(1)), 3);

    }

    function testCancelFailProposalExecuted() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.roll(3);
        address user = address(0);
        for( uint160 i = 1; i <= 33;i++) {
            user = address(i);
            astra.transfer(user, 100000 * (10**18));
            vm.startPrank(user);

            astra.approve(address(chefV2), 1000000000 * (10**18));
            chefV2.deposit(10000 * (10**18), 12, 0, false);
            astra.approve(address(governance), 1000000000000000000000000000000);
            governance.castVote(1, true);

            vm.stopPrank();

        } 
        vm.roll(455005);
        governance.queue(1);
        vm.warp(block.timestamp + 1 days + 1150);
        governance.execute(1);
        vm.expectRevert(bytes("GovernorAlpha::cancel: cannot cancel executed proposal"));
        governance.cancel(1);

    }

    function testCancelFailNotCreator() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.roll(3);
        governance.castVote(1, true);
        vm.prank(user1);
        vm.expectRevert(bytes("GovernorAlpha::cancel: Only creator can cancel"));
        governance.cancel(1);
    }

    function testCancel() public {
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);
        vm.roll(3);
        governance.castVote(1, true);
        governance.cancel(1);
        assertEq(uint(governance.state(1)), 2);
    }

}
