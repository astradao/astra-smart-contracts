// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

interface TimelockInterface {

    function getL2GovernanceContract(string calldata chain) external view returns (address);
    function delay() external view returns (uint);
    function GRACE_PERIOD() external view returns (uint);
    function acceptAdmin() external;
    function queuedTransactions(bytes32 hash) external view returns (bool);
    function queueTransaction(string calldata chain, address target, uint value, string calldata signature, bytes calldata data, uint eta) external returns (bytes32);
    function cancelTransaction(string calldata chain, address target, uint value, string calldata signature, bytes calldata data, uint eta) external;
    function executeTransaction(string calldata chain, address target, uint value, string calldata signature, bytes calldata data, uint eta) external payable;

}
