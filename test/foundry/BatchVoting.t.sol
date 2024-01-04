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
import "../../src/batchVote.sol";

contract batchVoteTest is Test {
    GovernorAlpha public governance;
    BatchVote public batchVote;
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
    bytes32 public r;
    bytes32 public s;
    uint8 public v;
    address public gaslessvoter = 0xd6aC61adC3aF34A9797EE49F9c81F2535823d112;
    BatchVote.CastVoteSignature[] public sigs;

    event VoteCast(address voter, uint proposalId, bool support, uint votes);

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
        chefV2.setGovernanceAddress(address(governance));
        batchVote = new BatchVote();
        batchVote.initialize(address(governance));
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
        targets.push(address(governance));  
        values.push(0);        
        signatures.push("updateMinProposalTimeIntervalSec(uint256)");
        calldatas.push("0x0000000000000000000000000000000000000000000000000000000000000078");
        description = "Description";
        fundametalChanges = false;
        astra.approve(address(governance), 1000000000000000000000000000000);
        vm.warp(block.timestamp + 1 days);
        governance.propose("Ethereum", targets, values, signatures, calldatas, description, fundametalChanges);

    }

    function testDeployment() public {
        assertEq(astra.owner(), owner);
    }

    function testProposalCreatedSuccessfully() public {
        assertEq(governance.proposalCount(), 1);
    }

    function testCastVoteWithoutSig() public {
        vm.roll(3);
        vm.expectEmit(false, false, false, true);
        emit VoteCast(owner, 1, true, 1800142970236383338499998);
        governance.castVote(1, true);
    }

    function testCastVoteWithSig() public {
        r = 0x9e229dd39e842b3734c8de84d409d3b4cd7b006113c555404c9464e1a09b57e5;
        s = 0x7f814b6443ee144f7d85e6ee7071ed973c3e1e6394ffe231735018d158a47e9c;
        v = 27;
        vm.roll(3);
        vm.expectEmit(false, false, false, true);
        emit VoteCast(0xF4E02D5619b63d77575Bb3Ff74d9375a3F9793d5, 1, true, 0);
        governance.castVoteBySig(1, true, v, r, s);

    }

    function testCastVoteWithSigMultipleUser() public {
        vm.roll(3);
        BatchVote.CastVoteSignature memory sig1 = BatchVote.CastVoteSignature({
            proposalId: 1,
            support: true,
            v: 27,
            r: 0x9e229dd39e842b3734c8de84d409d3b4cd7b006113c555404c9464e1a09b57e5,
            s: 0x7f814b6443ee144f7d85e6ee7071ed973c3e1e6394ffe231735018d158a47e9c
        });
        sigs.push(sig1);
        BatchVote.CastVoteSignature memory  sig2 = BatchVote.CastVoteSignature({
            proposalId: 1,
            support: true,
            v: 27,
            r: 0x184f8560c4f6cbd08ccb060c8deac3af3d784785f0dab5bd6d14d5f31f33d5b9,
            s: 0x0bd314778c93fd10df658a1b23b413f6a03192bac5a1728d44b6e7d6f18d87ed
        });
        sigs.push(sig2);
        vm.expectEmit(false, false, false, true);
        emit VoteCast(0xF4E02D5619b63d77575Bb3Ff74d9375a3F9793d5, 1, true, 0);
        batchVote.castVoteBySigs(sigs);

        
    }
}
