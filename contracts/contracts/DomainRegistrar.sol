

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

    struct CommitmentInfo {
        address bidder;
        bytes32 digest;  // this is the commitment hash
        bytes32 labelHash;
        uint256 bidWei;
        uint256 roundId;
        uint256 deposit;
        bool    revealed;
        bool    valid;
    }

    uint256 public constant  MAX_LABEL_BYTES = 32;  // an unsigned integer of 256 bit integer type with the name MAX_LABEL_BYTES and a value of 32
    uint256 public constant  COMMIT_DURATION = 120 seconds;
    uint256 public constant  REVEAL_DURATION = 120 seconds;
    uint256 public constant  ROUNDS_DURATION = COMMIT_DURATION + REVEAL_DURATION;
    uint256 public immutable auctionStart;

    uint256 public constant COMMIT_DEPOSIT = 0.01 ether;
    uint256 public commitmentCount;
    uint256 public totalLockedDeposits;

    mapping(uint256 => CommitmentInfo) private _commitments;
    mapping(bytes32 => bool) private _usedCommitments;

    event CommitmentSubmitted(
        uint256 indexed commitmentId,
        uint256 indexed roundId,
        address indexed bidder,
        bytes32 digest
    );

    event CommitmentRevealed(
        uint256 indexed commitmentId,
        uint256 indexed roundId,
        uint256         bidWei,
        address indexed bidder,
        string          label,
        bool            valid
    );

    constructor() {
        auctionStart = block.timestamp;
    }

    function commit(uint256 roundId , bytes32 digest) external payable returns (uint256 commitmentId) {
        require(roundId == getCurrentRound(), "WRONG ROUND");
        require(getRound(roundId).phase == Phase.Commit, "NOT COMMIT PHASE");
        require(msg.value == COMMIT_DEPOSIT, "INCORRECT DEPOSIT");
        require(digest != bytes32(0), "EMPTY COMMITMENT");

        bytes32 duplicateKey = keccak256(abi.encode(roundId, msg.sender, digest));

        require(!_usedCommitments[duplicateKey], "DUPLICATE COMMITMENT");

        _usedCommitments[duplicateKey] = true;

        commitmentCount += 1;
        commitmentId = commitmentCount;

        CommitmentInfo storage info = _commitments[commitmentId];
        info.bidder  = msg.sender;
        info.digest  = digest;
        info.roundId = roundId;
        info.deposit = msg.value;

        totalLockedDeposits += msg.value;

        emit CommitmentSubmitted(commitmentId, roundId, msg.sender, digest);

        return commitmentId;
    }

    function reveal(uint256 commitmentId , string memory label , uint256 bidWei , bytes32 salt) external returns (bool valid) {
        require(commitmentId > 0 && commitmentId <= commitmentCount , "INVALID COMMITMENT");

        CommitmentInfo storage info = _commitments[commitmentId];

        require(msg.sender == info.bidder, "NOT BIDDER");  // continue only if this condition is true --> this goes for all require
        require(!info.revealed, "ALREADY REVEALED");
        require(getRound(info.roundId).phase == Phase.Reveal, "NOT REVEAL PHASE");
        require(
            computeCommitment(info.roundId, info.bidder, label, bidWei, salt)  == info.digest,
            "COMMITMENT MISMATCH"
        );

        info.revealed  = true;
        info.labelHash = keccak256(bytes(label));
        info.bidWei    = bidWei;

        valid = isValidLabel(label) && bidWei > 0 && bidWei <= info.deposit;
        info.valid = valid;

        emit CommitmentRevealed(commitmentId, info.roundId, bidWei , info.bidder , label , valid);

        return valid;
    }

    function getCommitment(uint256 commitmentId) public view returns (CommitmentInfo memory) {
        require(commitmentId > 0 && commitmentId <= commitmentCount, "INVALID COMMITMENT");
        return _commitments[commitmentId];
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
