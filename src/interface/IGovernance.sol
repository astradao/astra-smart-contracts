// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

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