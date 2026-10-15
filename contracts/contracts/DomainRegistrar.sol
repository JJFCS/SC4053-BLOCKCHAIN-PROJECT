
// COMMENTARY
// - note that a smart contract groups functions and data and when it is deployed it will live at an ETH address
// - note that hardhat compiles and tests that program
// - for now our contract only has one job where it will receive a label and answer whether it follows our naming rules and conventions

pragma solidity 0.8.34;

contract DomainRegistrar {
    uint256 public constant MAX_LABEL_BYTES = 32;  // an unsigned integer of 256 bit integer type with the name MAX_LABEL_BYTES and a value of 32

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
