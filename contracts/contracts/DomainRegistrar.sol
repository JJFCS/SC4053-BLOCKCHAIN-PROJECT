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
		uint256 pendingDomainCount;
		uint256 deposit;
		uint256 nonRevealPenalty;
		address treasury;
    }

	// These timestamps are stored when a round is explicitly started.
	// getRound() adds the phase calculated from the current block timestamp.
	struct RoundSchedule {
		uint256 startTime;
		uint256 commitEnd;
		uint256 revealEnd;
		uint256 pendingDomainCount;
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
		bool finalized;
    }

    struct DomainInfo {
        address owner;
        uint256 roundId;
        uint256 winningCommitmentId;
        uint256 priceWei;
        address resolutionAddress;
    }

	uint256 public constant MIN_LABEL_BYTES = 3;
    uint256 public constant  MAX_LABEL_BYTES = 32;  // an unsigned integer of 256 bit integer type with the name MAX_LABEL_BYTES and a value of 32
    uint256 public constant  COMMIT_DURATION = 120 seconds;
    uint256 public constant  REVEAL_DURATION = 120 seconds;
    uint256 public constant  ROUNDS_DURATION = COMMIT_DURATION + REVEAL_DURATION;
	uint256 private _latestRoundId;
	mapping(uint256 => RoundSchedule) private _rounds;

	uint256 public constant COMMIT_DEPOSIT = 0.1 ether;
	uint256 public constant NON_REVEAL_PENALTY = 0.001 ether;
    uint256 public commitmentCount;
    uint256 public totalLockedDeposits;

    address public immutable treasury;
	uint256 public totalWithdrawalCredits;
    bool private _withdrawing;

    mapping(uint256 => CommitmentInfo) private _commitments;
	mapping(uint256 => mapping(address => uint256)) private _commitmentIds;
	mapping(uint256 => mapping(bytes32 => AuctionInfo)) private _auctions;
	mapping(bytes32 => uint256) private _reservedRounds;
    mapping(bytes32 => DomainInfo)     private _domains;
	mapping(address => uint256) public withdrawalCredits;

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

	event Withdrawn(address indexed account, uint256 amountWei);

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

	constructor(address treasuryAddress) {
		require(treasuryAddress != address(0), "ZERO TREASURY");
		require(NON_REVEAL_PENALTY > 0 && NON_REVEAL_PENALTY < COMMIT_DEPOSIT, "INVALID PENALTY");
		treasury = treasuryAddress;
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

		_rounds[roundId] = RoundSchedule({
			startTime: startTime,
			commitEnd: commitEnd,
			revealEnd: revealEnd,
			pendingDomainCount: 0
		});
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

	function commitBid(uint256 roundId, bytes32 digest) external payable {
		_commitBid(roundId, digest);
	}

	// Keep the earlier entry point, with the same one-per-wallet checks.
	function commit(uint256 roundId, bytes32 digest) external payable returns (uint256 commitmentId) {
		return _commitBid(roundId, digest);
	}

	function _commitBid(uint256 roundId, bytes32 digest) internal returns (uint256 commitmentId) {
		RoundInfo memory round = getRound(roundId);
		require(roundId == _latestRoundId, "WRONG ROUND");
		require(round.phase == Phase.Commit, "NOT COMMIT PHASE");
        require(msg.value == COMMIT_DEPOSIT, "INCORRECT DEPOSIT");
        require(digest != bytes32(0), "EMPTY COMMITMENT");

		require(_commitmentIds[roundId][msg.sender] == 0, "ALREADY COMMITTED");

        commitmentCount += 1;
        commitmentId = commitmentCount;
		_commitmentIds[roundId][msg.sender] = commitmentId;

        CommitmentInfo storage info = _commitments[commitmentId];
        info.bidder  = msg.sender;
        info.digest  = digest;
        info.roundId = roundId;
        info.deposit = msg.value;

        totalLockedDeposits += msg.value;

        emit CommitmentSubmitted(commitmentId, roundId, msg.sender, digest);

        return commitmentId;
    }

	function revealBid(uint256 roundId, string calldata label, uint256 bidWei, bytes32 salt) external {
		uint256 commitmentId = getCommitmentId(roundId, msg.sender);
		require(commitmentId != 0, "NO COMMITMENT");
		_revealBid(commitmentId, label, bidWei, salt);
	}

	function reveal(uint256 commitmentId, string memory label, uint256 bidWei, bytes32 salt) external returns (bool valid) {
		return _revealBid(commitmentId, label, bidWei, salt);
	}

	function _revealBid(uint256 commitmentId, string memory label, uint256 bidWei, bytes32 salt) internal returns (bool) {
        require(commitmentId > 0 && commitmentId <= commitmentCount , "INVALID COMMITMENT");

        CommitmentInfo storage info = _commitments[commitmentId];

        require(msg.sender == info.bidder, "NOT BIDDER");  // continue only if this condition is true --> this goes for all require
        require(!info.revealed, "ALREADY REVEALED");
        require(getRound(info.roundId).phase == Phase.Reveal, "NOT REVEAL PHASE");
		require(isValidLabel(label), "INVALID LABEL");
		require(bidWei > 0 && bidWei <= info.deposit, "INVALID BID");

		bytes32 labelHash = keccak256(bytes(label));
		require(_domains[labelHash].owner == address(0), "ALREADY REGISTERED");
		uint256 reservation = _reservedRounds[labelHash];
		require(reservation == 0 || reservation == info.roundId, "NAME RESERVED");
        require(
            computeCommitment(info.roundId, info.bidder, label, bidWei, salt)  == info.digest,
            "COMMITMENT MISMATCH"
        );

		// Every validation above must pass before the commitment is consumed.
		info.revealed = true;
		info.valid = true;
		info.labelHash = labelHash;
		info.bidWei = bidWei;

		AuctionInfo storage auction = _auctions[info.roundId][labelHash];
		if (auction.winningCommitmentId == 0) {
			auction.roundId = info.roundId;
			_reservedRounds[labelHash] = info.roundId;
			_rounds[info.roundId].pendingDomainCount += 1;
		}

		// A smaller commitment ID means an earlier on-chain commit sequence.
		bool becomesLeader = auction.winningCommitmentId == 0 || bidWei > auction.highestBidWei ||
			(bidWei == auction.highestBidWei && commitmentId < auction.winningCommitmentId);
		if (becomesLeader) {
			auction.winningCommitmentId = commitmentId;
			auction.highestBidder = info.bidder;
			auction.highestBidWei = bidWei;
		}

		emit CommitmentRevealed(commitmentId, info.roundId, info.bidder, label, bidWei, true);
		return true;
    }

	function withdraw() external nonReentrant {
		_withdraw();
	}

	// Earlier withdrawal names use the same account balance and shared guard.
	function withdrawRefund() external nonReentrant returns (uint256) {
		return _withdraw();
	}

	function withdrawTreasury() external nonReentrant returns (uint256) {
		require(msg.sender == treasury, "NOT TREASURY");
		return _withdraw();
	}

	function _withdraw() internal returns (uint256 amount) {
		amount = withdrawalCredits[msg.sender];
		require(amount > 0, "NO CREDIT");
		withdrawalCredits[msg.sender] = 0;
		totalWithdrawalCredits -= amount;

		(bool success, ) = payable(msg.sender).call{value: amount}("");
		require(success, "ETH TRANSFER FAILED");
		emit Withdrawn(msg.sender, amount);
		return amount;
	}

	function settleBid(uint256 roundId) external {
		uint256 commitmentId = getCommitmentId(roundId, msg.sender);
		require(commitmentId != 0, "NO COMMITMENT");
		_settleBid(commitmentId);
	}

	function settleCommit(uint256 commitmentId) external returns (uint256 refundWei, uint256 proceedsWei) {
		return _settleBid(commitmentId);
	}

	function _settleBid(uint256 commitmentId) internal returns (uint256 refundWei, uint256 proceedsWei) {
		require(commitmentId > 0 && commitmentId <= commitmentCount, "INVALID COMMITMENT");
		CommitmentInfo storage info = _commitments[commitmentId];
		require(msg.sender == info.bidder, "NOT BIDDER");
		require(!info.settled, "ALREADY SETTLED");
		require(getRound(info.roundId).phase == Phase.Ended, "ROUND NOT ENDED");

		if (!info.revealed) {
			proceedsWei = NON_REVEAL_PENALTY;
			refundWei = info.deposit - proceedsWei;
		} else {
			AuctionInfo storage auction = _auctions[info.roundId][info.labelHash];
			require(auction.finalized, "DOMAIN NOT FINALIZED");
			refundWei = auction.winningCommitmentId == commitmentId
				? info.deposit - info.bidWei
				: info.deposit;
		}

		info.settled = true;
		// The winning payment was already removed from locked deposits at finalization.
		totalLockedDeposits -= refundWei + proceedsWei;
		_credit(info.bidder, refundWei);
		_credit(treasury, proceedsWei);
		emit CommitmentSettled(commitmentId, info.roundId, info.bidder, refundWei, proceedsWei);
		return (refundWei, proceedsWei);
	}

	function _credit(address account, uint256 amount) internal {
		withdrawalCredits[account] += amount;
		totalWithdrawalCredits += amount;
	}

    function finalizeName(string memory label) external returns (address owner) {
        require(isValidLabel(label), "INVALID LABEL");
        bytes32 labelHash = keccak256(bytes(label));
		uint256 roundId = _reservedRounds[labelHash];
		if (roundId == 0) {
			roundId = _domains[labelHash].roundId;
		}
		require(roundId != 0, "NO WINNING BID");
		return _finalizeDomain(roundId, labelHash, label);
	}

	function finalizeDomain(uint256 roundId, string memory label) external returns (address owner) {
		require(isValidLabel(label), "INVALID LABEL");
		return _finalizeDomain(roundId, keccak256(bytes(label)), label);
	}

	function _finalizeDomain(
		uint256 roundId,
		bytes32 labelHash,
		string memory label
	) internal returns (address owner) {
		RoundInfo memory round = getRound(roundId);
		AuctionInfo storage auction = _auctions[roundId][labelHash];
		DomainInfo storage domain = _domains[labelHash];

		require(auction.winningCommitmentId != 0, "NO WINNING BID");
		require(!auction.finalized && domain.owner == address(0), "ALREADY FINALIZED");
		require(round.phase == Phase.Ended, "ROUND NOT ENDED");
		require(_reservedRounds[labelHash] == roundId, "WRONG RESERVATION");

		owner = auction.highestBidder;

        domain.owner = owner;
		domain.roundId = roundId;
        domain.winningCommitmentId = auction.winningCommitmentId;
        domain.priceWei = auction.highestBidWei;
        domain.resolutionAddress = owner;
		auction.finalized = true;
		delete _reservedRounds[labelHash];
		_rounds[roundId].pendingDomainCount -= 1;
		// Allocate the price once, without sending ETH during finalization.
		totalLockedDeposits -= auction.highestBidWei;
		_credit(treasury, auction.highestBidWei);

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
		return _reservedRounds[keccak256(bytes(label))];
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
		// Label-only access resolves the active reservation or registered history.
		bytes32 labelHash = keccak256(bytes(label));
		uint256 roundId = _reservedRounds[labelHash];
		if (roundId == 0) {
			roundId = _domains[labelHash].roundId;
		}
		return _auctions[roundId][labelHash];
    }

	function getAuctionForRound(uint256 roundId, string memory label) public view returns (AuctionInfo memory) {
		require(roundId > 0 && roundId <= _latestRoundId, "INVALID ROUND");
		require(isValidLabel(label), "INVALID LABEL");
		return _auctions[roundId][keccak256(bytes(label))];
	}

    function getCommitment(uint256 commitmentId) public view returns (CommitmentInfo memory) {
        require(commitmentId > 0 && commitmentId <= commitmentCount, "INVALID COMMITMENT");
        return _commitments[commitmentId];
    }

	function getCommitmentId(uint256 roundId, address bidder) public view returns (uint256) {
		require(roundId > 0 && roundId <= _latestRoundId, "INVALID ROUND");
		return _commitmentIds[roundId][bidder];
	}

	function getCommitmentForRound(uint256 roundId, address bidder) public view returns (CommitmentInfo memory) {
		return _commitments[getCommitmentId(roundId, bidder)];
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
		info.pendingDomainCount = schedule.pendingDomainCount;
		info.deposit = COMMIT_DEPOSIT;
		info.nonRevealPenalty = NON_REVEAL_PENALTY;
		info.treasury = treasury;

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

        if (length < MIN_LABEL_BYTES || length > MAX_LABEL_BYTES) {  // require 3-32 ASCII characters
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
