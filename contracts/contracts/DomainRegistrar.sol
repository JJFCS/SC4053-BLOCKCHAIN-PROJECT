// SPDX-License-Identifier: UNLICENSED

// COMMENTARY
// - note that a smart contract groups functions and data and when it is deployed it will live at an ETH address
// - note that hardhat compiles and tests that program
// - this registrar manages domain auctions, ownership, resolution and checked ETH payments

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

	// These timestamps are stored when a round is explicitly started.
	// getRound() adds the phase calculated from the current block timestamp.
	struct RoundSchedule {
		uint256 startTime;
		uint256 commitEnd;
		uint256 revealEnd;
	}

    struct CommitmentInfo {
        address bidder;
        bytes32 digest;  // this is the commitment hash
        uint256 roundId;
        uint256 deposit;
        bool    revealed;
        bool    valid;
        bytes32 labelHash;
        uint256 bidWei;
        bool    settled;
    }

    struct AuctionInfo {
        uint256 roundId;
        uint256 winningCommitmentId;  // this is tracking which bid is currently in the lead
        address highestBidder;
        uint256 highestBidWei;
    }

    struct DomainInfo {
        address owner;
        uint256 roundId;
        uint256 winningCommitmentId;
        uint256 priceWei;
        address resolutionAddress;
    }

    uint256 public constant  MAX_LABEL_BYTES = 32;  // an unsigned integer of 256 bit integer type with the name MAX_LABEL_BYTES and a value of 32
    uint256 public constant  COMMIT_DURATION = 120 seconds;
    uint256 public constant  REVEAL_DURATION = 120 seconds;
    uint256 public constant  ROUNDS_DURATION = COMMIT_DURATION + REVEAL_DURATION;
	uint256 private _latestRoundId;
	mapping(uint256 => RoundSchedule) private _rounds;

    uint256 public constant COMMIT_DEPOSIT = 0.01 ether;
    uint256 public commitmentCount;
    uint256 public totalLockedDeposits;

    address public immutable treasury;
    uint256 public totalRefundCredits;
    uint256 public treasuryCredit;
    bool private _withdrawing;

    mapping(uint256 => CommitmentInfo) private _commitments;
    mapping(bytes32 => bool)           private _usedCommitments;
    mapping(bytes32 => AuctionInfo)    private _auctions;
    mapping(bytes32 => DomainInfo)     private _domains;
    mapping(address => uint256)        public refundCredits;

	event RoundStarted(
		uint256 indexed roundId,
		address indexed starter,
		uint256 startTime,
		uint256 commitEnd,
		uint256 revealEnd
	);

    event CommitmentSubmitted(
        uint256 indexed commitmentId,
        uint256 indexed roundId,
        address indexed bidder,
        bytes32 digest
    );

    event CommitmentRevealed(
        uint256 indexed commitmentId,
        uint256 indexed roundId,
        address indexed bidder,
        string          label,
        uint256         bidWei,
        bool            valid
    );

    event DomainFinalized(
        bytes32 indexed labelHash,
        uint256 indexed roundId,
        address indexed owner,
        string          label,
        uint256         winningCommitmentId,
        uint256         priceWei
    );

    event CommitmentSettled(
        uint256 indexed commitmentId,
        uint256 indexed roundId,
        address indexed bidder,
        uint256         refundWei,
        uint256         proceedsWei
    );

    event RefundWithdrawn(
        address indexed bidder,
        uint256 amountWei
    );

    event TreasuryWithdrawn(
        address indexed recipient,
        uint256 amountWei
    );

    event AddressUpdated(
        bytes32 indexed labelHash,
        address indexed owner,
        address indexed target,
        string label
    );

    event DomainPayment(
        bytes32 indexed labelHash,
        address indexed sender,
        address indexed recipient,
        string  label,
        uint256 amountWei
    );

    constructor() {
        treasury = msg.sender;
    }

	function startRound() external returns (uint256 roundId) {
		if (_latestRoundId != 0) {
			require(
				block.timestamp >= _rounds[_latestRoundId].revealEnd,
				"ROUND NOT ENDED"
			);
		}

		roundId = _latestRoundId + 1;
		uint256 startTime = block.timestamp;
		uint256 commitEnd = startTime + COMMIT_DURATION;
		uint256 revealEnd = commitEnd + REVEAL_DURATION;

		_rounds[roundId] = RoundSchedule(startTime, commitEnd, revealEnd);
		_latestRoundId = roundId;

		emit RoundStarted(roundId, msg.sender, startTime, commitEnd, revealEnd);
		return roundId;
	}

    modifier nonReentrant() {
        require(!_withdrawing, "REENTRANT WITHDRAWAL");
        _withdrawing = true;
        _;  // we are running the function's body here
        _withdrawing = false;
    }

    function commit(uint256 roundId , bytes32 digest) external payable returns (uint256 commitmentId) {
		RoundInfo memory round = getRound(roundId);
		require(roundId == _latestRoundId, "WRONG ROUND");
		require(round.phase == Phase.Commit, "NOT COMMIT PHASE");
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

        AuctionInfo storage auction = _auctions[info.labelHash];

        valid = isValidLabel(label) && bidWei > 0 && bidWei <= info.deposit &&
            (auction.roundId == 0 || auction.roundId == info.roundId);
        info.valid = valid;

        if (valid) {
            if (auction.roundId == 0) {
                auction.roundId = info.roundId;
            }

            // so this checks the first bid , the higher bidder , and also if there is
            // an earlier bid but with a earlier commitment ID
            bool becomesLeader = auction.winningCommitmentId == 0 || bidWei > auction.highestBidWei ||
                (bidWei == auction.highestBidWei && commitmentId < auction.winningCommitmentId);

            if (becomesLeader) {
                auction.winningCommitmentId = commitmentId;
                auction.highestBidder = info.bidder;
                auction.highestBidWei = bidWei;
            }
        }

        emit CommitmentRevealed(commitmentId , info.roundId , info.bidder , label , bidWei , valid);

        return valid;
    }

    function withdrawRefund() external nonReentrant returns (uint256 amount) {
        amount = refundCredits[msg.sender];
        require(amount > 0, "NO REFUND");

        refundCredits[msg.sender] = 0;
        totalRefundCredits -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");

        require(success, "ETH TRANSFER FAILED");
        emit RefundWithdrawn(msg.sender, amount);
        return amount;
    }

    function withdrawTreasury() external nonReentrant returns (uint256 amount) {
        require(msg.sender == treasury, "NOT TREASURY");
        amount = treasuryCredit;
        require(amount > 0, "NO TREASURY CREDIT");
        treasuryCredit = 0;

        (bool success, ) = payable(treasury).call{value: amount}("");

        require(success, "ETH TRANSFER FAILED");
        emit TreasuryWithdrawn(treasury, amount);
        return amount;
    }

    function settleCommit(uint256 commitmentId) external returns (uint256 refundWei, uint256 proceedsWei) {
        require(commitmentId > 0 && commitmentId <= commitmentCount,"INVALID COMMITMENT");
        CommitmentInfo storage info = _commitments[commitmentId];

        require(!info.settled, "ALREADY SETTLED");
        require(getRound(info.roundId).phase == Phase.Ended,"ROUND NOT ENDED");

        if (!info.revealed) {
            proceedsWei = info.deposit;
        } else if (!info.valid) {
            refundWei   = info.deposit;
        } else {
            AuctionInfo storage auction = _auctions[info.labelHash];
            if (auction.winningCommitmentId == commitmentId) {
                proceedsWei = info.bidWei;
                refundWei   = info.deposit - info.bidWei;
            } else {
                refundWei   = info.deposit;
            }
        }

        info.settled = true;

        totalLockedDeposits -= info.deposit;
        refundCredits[info.bidder] += refundWei;
        totalRefundCredits += refundWei;
        treasuryCredit += proceedsWei;

        emit CommitmentSettled(commitmentId,info.roundId,info.bidder,refundWei,proceedsWei);

        return (refundWei, proceedsWei);
    }

    function finalizeName(string memory label) external returns (address owner) {
        require(isValidLabel(label), "INVALID LABEL");

        bytes32 labelHash = keccak256(bytes(label));
        AuctionInfo storage auction = _auctions[labelHash];

        require(auction.winningCommitmentId != 0,"NO WINNING BID");
        require(getRound(auction.roundId).phase == Phase.Ended,"ROUND NOT ENDED");

        DomainInfo storage domain = _domains[labelHash];

        require(domain.owner == address(0), "ALREADY FINALIZED");

        owner = auction.highestBidder;  // this will use the winning bidder regardless of who calls the finalizeName()

        domain.owner = owner;
        domain.roundId = auction.roundId;
        domain.winningCommitmentId = auction.winningCommitmentId;
        domain.priceWei = auction.highestBidWei;
        domain.resolutionAddress = owner;

        emit DomainFinalized(
            labelHash,
            domain.roundId,
            owner,
            label,
            domain.winningCommitmentId,
            domain.priceWei
        );

        return owner;
    }

    function getDomain(string memory label) public view returns (DomainInfo memory) {
        return _domains[keccak256(bytes(label))];
    }



    function ownerOf(string memory label) public view returns (address) {
        require(isValidLabel(label),  "INVALID LABEL");
        return _domains[keccak256(bytes(label))].owner;
    }

    function reservedRound(string memory label) public view returns (uint256) {
        require(isValidLabel(label), "INVALID LABEL");
        bytes32 labelHash   = keccak256(bytes(label));
        if (_domains[labelHash].owner != address(0)) {
            return 0;
        }
        return _auctions[labelHash].roundId;
    }

    function resolve(string memory label) public view returns (address) {
        require(isValidLabel(label), "INVALID LABEL");
        return _domains[keccak256(bytes(label))].resolutionAddress;
    }

    function setAddress(string memory label, address target) external {
        require(isValidLabel(label), "INVALID LABEL");
        bytes32 labelHash   = keccak256(bytes(label));
        DomainInfo storage domain = _domains[labelHash];

        require(domain.owner != address(0), "UNREGISTERED NAME");
        require(msg.sender == domain.owner, "NOT OWNER");
        require(target != address(0), "ZERO ADDRESS");
        require(target != address(this), "INVALID TARGET");

        domain.resolutionAddress = target;

        emit AddressUpdated(labelHash, domain.owner, target, label);
    }

    function sendToDomain(string memory label,address expectedRecipient) external payable nonReentrant {
        require(isValidLabel(label), "INVALID LABEL");
        require(msg.value > 0, "ZERO PAYMENT");

        bytes32 labelHash = keccak256(bytes(label));
        DomainInfo storage domain = _domains[labelHash];

        require(domain.owner != address(0), "UNREGISTERED NAME");

        address recipient = domain.resolutionAddress;

        require(recipient != address(0), "ZERO ADDRESS");
        require(recipient != address(this), "INVALID TARGET");
        require(recipient == expectedRecipient, "RECIPIENT CHANGED");

        (bool success, ) = payable(recipient).call{value: msg.value}("");

        require(success, "ETH TRANSFER FAILED");

        emit DomainPayment(labelHash, msg.sender, recipient, label, msg.value);
    }

    function getAuction(string memory label) public view returns (AuctionInfo memory) {
        // so we can eventually call something like getAuction("alice") to display our leading bid
        // note that an unknown name returns a record containing zero values
        return _auctions[keccak256(bytes(label))];
    }

    function getCommitment(uint256 commitmentId) public view returns (CommitmentInfo memory) {
        require(commitmentId > 0 && commitmentId <= commitmentCount, "INVALID COMMITMENT");
        return _commitments[commitmentId];
    }

    function getCurrentRound() public view returns (uint256) {
		// This is the latest started round, including while it is already ended.
		return _latestRoundId;
    }

    function getRound(uint256 roundId) public view returns (RoundInfo memory info) {
		require(roundId > 0 && roundId <= _latestRoundId, "INVALID ROUND");

		RoundSchedule storage schedule = _rounds[roundId];
		info.startTime = schedule.startTime;
		info.commitEnd = schedule.commitEnd;
		info.revealEnd = schedule.revealEnd;

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
