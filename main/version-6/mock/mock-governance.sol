pragma solidity 0.8.19;

contract GovernanceMock {
    constructor() public {}

    mapping(address => bool) public isBlackListed;

    function blackListUser(address _address, bool _value) public {
        isBlackListed[_address] = _value;
    }

    function getVotingStatus(address _user) external view returns (bool) {
        return !isBlackListed[_user];
    }
}
