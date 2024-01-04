// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract DummyContract {
    address private admin;
    string public message;

    constructor(address _admin, string memory _message) {
        admin = _admin;
        message = _message;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can execute this function");
        _;
    }

    function getAdmin() public view returns (address) {
        return admin;
    }

    function setAdmin(address newAdmin) public onlyAdmin {
        admin = newAdmin;
    }

    function setMessage(string memory newMessage) public onlyAdmin {
        message = newMessage;
    }

    function getMessage() public view returns (string memory) {
        return message;
    }
}
