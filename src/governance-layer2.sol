// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.19;

import "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol";
import "@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
/**
 * @title GovernorBeta
 * @notice Governance contract for the AstraDAO Ecosystem on Layer2s using Axelar.
 * @author Manav Garg
 */
contract GovernorBeta is Ownable, AxelarExecutable {
    string public managerChain;
    string public managerAddress;

    modifier onlyEthereumGovernanceExecutor(
        string calldata _sourceChain,
        string calldata _sourceAddress
    ) {
        bytes32 source = keccak256(abi.encodePacked(_sourceChain, _sourceAddress));
        bytes32 manager = keccak256(abi.encodePacked(managerChain, managerAddress));

        require(source == manager, "Not allowed to call this contract");
        _;
    }

    constructor(address _gateway, string memory _managerChain, string memory _managerAddress) AxelarExecutable(_gateway) {
        // managerChain = "Ethereum";
        // managerAddress = "0xc80B0a04D51f3fd4C91e9D28525709261936Bed1";
        managerChain = _managerChain;
        managerAddress = _managerAddress;
    }

    receive() external payable {
    }

    /**
     * @notice Update managerChain variable.
     * @param newManagerChain The new name.
     */
    function setManagerChain(string memory newManagerChain) external onlyOwner {
        managerChain = newManagerChain;
    }

    /**
     * @notice Update managerChain variable.
     * @param newManagerAddress The new address of the manager.
     */
    function setManagerAddress(string memory newManagerAddress) external onlyOwner {
        managerAddress = newManagerAddress;
    }

    // Handles calls created by setAndSend. Updates this contract's value
    function _execute(
        string calldata sourceChain_,
        string calldata sourceAddress_,
        bytes calldata payload_
    ) internal override onlyEthereumGovernanceExecutor(sourceChain_, sourceAddress_) {

        (address target, uint value, string memory signature, bytes memory data) = abi.decode(payload_, (address, uint, string, bytes));

        bytes memory callData;

        if (bytes(signature).length == 0) {
            callData = data;
        } else {
            callData = abi.encodePacked(bytes4(keccak256(bytes(signature))), data);
        }

        (bool success, ) = target.call{value : value}(callData);
        require(success, "GovernorBeta::executeTransaction: Transaction execution reverted.");
    }
}