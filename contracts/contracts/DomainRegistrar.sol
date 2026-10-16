

// SPDX-License-Identifier: UNLICENSED

// COMMENTARY
// - note that a smart contract groups functions and data and when it is deployed it will live at an ETH address
// - note that hardhat compiles and tests that program
// - for now our contract only has one job where it will receive a label and answer whether it follows our naming rules and conventions

pragma solidity 0.8.34;

contract DomainRegistrar {

    enum Phase {
        NotStarted,
        Commit,
        Reveal,
        Ended
    }

    struct RoundInfo {
        // this is our record type containing 3 timestamps and one phase
        uint256 startTime;
        uint256 commitEnd;
        uint256 revealEnd;
        Phase   phase;
    }

    uint256 public constant  MAX_LABEL_BYTES = 32;  // an unsigned integer of 256 bit integer type with the name MAX_LABEL_BYTES and a value of 32
    uint256 public constant  COMMIT_DURATION = 120 seconds;
    uint256 public constant  REVEAL_DURATION = 120 seconds;
    uint256 public constant  ROUNDS_DURATION = COMMIT_DURATION + REVEAL_DURATION;
    uint256 public immutable auctionStart;

    constructor() {
        auctionStart = block.timestamp;
    }

    function getCurrentRound() public view returns (uint256) {
        uint256 elapsed = block.timestamp - auctionStart;
        return (elapsed / ROUNDS_DURATION) + 1;  // ofc when you divide by integers it drops the fractional part so we need to add 1 to get the round
    }

    function getRound(uint256 roundId) public view returns (RoundInfo memory info) {
        require(roundId > 0 , "INVALID ROUND");

        info.startTime = auctionStart + (roundId - 1) * ROUNDS_DURATION;
        info.commitEnd = info.startTime + COMMIT_DURATION;
        info.revealEnd = info.commitEnd + REVEAL_DURATION;

        if (block.timestamp < info.startTime) {
            info.phase = Phase.NotStarted;
        } else if (block.timestamp < info.commitEnd) {
            info.phase = Phase.Commit;
        } else if (block.timestamp < info.revealEnd) {
            info.phase = Phase.Reveal;
        } else {
            info.phase = Phase.Ended;
        }

        return info;
    }

    function computeCommitment(uint256 roundId , address bidder , string memory label , uint256 bidWei , bytes32 salt) public view returns (bytes32) {
        // the salt is our secret value that will add randomness so harder to guess the name and bid from the hash
        // we include the blockchain and registrar address to make this commitend specific to that deployment
            return keccak256(
                abi.encode(block.chainid , address(this) , roundId , bidder , label , bidWei , salt)
            );
        }

    function isValidLabel(string memory label) public pure returns (bool) {  // e.g. isValidLabel("James") gives the function the text "James" under the input name `label`
        bytes memory characters = bytes(label);
        uint256 length = characters.length;

        if (length == 0 || length > MAX_LABEL_BYTES) {  // basically if the input is empty or more than 32 bytes
            return false;
        }

        if (characters[0] == 0x2d || characters[length - 1] == 0x2d) {  // this one is where we reject having a "-" at the beg. or end
            return false;
        }

        for (uint256 i = 0; i < length; ++i) {
            bytes1 character = characters[i];

            bool isLowercase = character >= 0x61 && character <= 0x7a;
            bool isDigit     = character >= 0x30 && character <= 0x39;
            bool isHyphen    = character == 0x2d;

            if (!isLowercase && !isDigit && !isHyphen) {  // if it passes one of the checks above then the whole conditional block is skipped
                return false;
            }
        }

        return true;
    }
}
