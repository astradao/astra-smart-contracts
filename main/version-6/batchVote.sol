// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";


// Governance contract interface used at the time of voting.
interface IGovernance {
    function castVoteBySig(
        uint256 proposalId,
        bool support,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

contract BatchVote is
    Initializable,
    Ownable2StepUpgradeable
{
    // Governance contract address
    address public governance;

    // Structure used for batch vote
    struct CastVoteSignature {
        uint256 proposalId;
        bool support;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    event UpdatedGovernanceAddress(address indexed _governance);

    function initialize(address _governance)
        public
        initializer
    {
        __Ownable2Step_init();
        require(
            _governance != address(0),
            "updatedGovernanceAddress: Zero address"
        );
        governance = _governance;
    }

    /**
     * @notice Update Governance contract address.
     * @dev Owner can update the governance contract address.
     */
    function updatedGovernanceAddress(address _governance) external onlyOwner {
        require(
            _governance != address(0),
            "updatedGovernanceAddress: Zero address"
        );
        governance = _governance;
        emit UpdatedGovernanceAddress(_governance);
    }

    /**
     * @notice Batch voting using user signatures.
     * @dev Any user can call this function to cast votes in batch.
     */
    function castVoteBySigs(CastVoteSignature[] memory sigs)
        external
    {
        require(sigs.length<200, "castVoteBySigs: must be in range");
        for (uint256 i = 0; i < sigs.length; i++) {
            CastVoteSignature memory sig = sigs[i];
            IGovernance(governance).castVoteBySig(
                sig.proposalId,
                sig.support,
                sig.v,
                sig.r,
                sig.s
            );
        }
    }
}