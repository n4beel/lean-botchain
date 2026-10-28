// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Lean
 * @notice Time-weighted conviction polling on BOT Chain.
 * Conviction grows linearly with amount and elapsed time:
 * conviction = amountSum * min(block.timestamp, endsAt) - weightedSince
 */
contract Lean {
    // Protocol Limits
    uint256 public constant MIN_QUESTION = 1;
    uint256 public constant MAX_QUESTION = 120;
    uint256 public constant MIN_OPTIONS = 2;
    uint256 public constant MAX_OPTIONS = 6;
    uint256 public constant MIN_OPTION_LABEL = 1;
    uint256 public constant MAX_OPTION_LABEL = 32;
    uint256 public constant MIN_DURATION = 3600; // 1 hour
    uint256 public constant MAX_DURATION = 7776000; // 90 days (90 * 86400)
    uint256 public constant MAX_BATCH = 50;

    struct Poll {
        address asker;
        uint64 endsAt;
        uint8 optionCount;
        string question;
    }

    struct Stake {
        uint128 amount;
        uint64 since;
        uint8 option;
    }

    struct OptionTotals {
        uint256 amountSum;
        uint256 weightedSince;
    }

    mapping(uint256 => Poll) private _polls;
    mapping(uint256 => string[]) private _options;
    mapping(uint256 => mapping(uint8 => OptionTotals)) private _totals;
    mapping(uint256 => mapping(address => Stake)) private _stakes;
    mapping(address => uint256) public pending;
    uint256 public pollCount;

    // Reentrancy guard
    uint256 private _locked = 1;

    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    // Custom errors matching spec
    error BadQuestion();
    error BadOptions();
    error BadDuration();
    error Ended();
    error ZeroAmount();
    error BadOption();
    error WrongOption(uint8 currentOption);
    error NoStake();
    error NotFound();
    error NothingToWithdraw();
    error TransferFailed();

    // Events matching spec §2.2
    event Created(uint256 indexed id, address indexed asker, string question, uint64 endsAt);
    event Leaned(uint256 indexed id, address indexed who, uint8 indexed option, uint128 amount, uint64 since);
    event Released(uint256 indexed id, address indexed who, uint128 amount, bool countedAtEnd);
    event Withdrawn(address indexed to, uint256 amount);

    /**
     * @notice Create a new time-weighted poll.
     */
    function create(
        string calldata question,
        string[] calldata options,
        uint64 durationSecs
    ) external returns (uint256 id) {
        bytes memory qBytes = bytes(question);
        if (qBytes.length < MIN_QUESTION || qBytes.length > MAX_QUESTION) revert BadQuestion();

        if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) revert BadOptions();
        for (uint256 i = 0; i < options.length; i++) {
            bytes memory optBytes = bytes(options[i]);
            if (optBytes.length < MIN_OPTION_LABEL || optBytes.length > MAX_OPTION_LABEL) revert BadOptions();
        }

        if (durationSecs < MIN_DURATION || durationSecs > MAX_DURATION) revert BadDuration();

        unchecked {
            pollCount++;
            id = pollCount;
        }

        uint64 endsAt = uint64(block.timestamp + durationSecs);
        _polls[id] = Poll({
            asker: msg.sender,
            endsAt: endsAt,
            optionCount: uint8(options.length),
            question: question
        });

        for (uint256 i = 0; i < options.length; i++) {
            _options[id].push(options[i]);
        }

        emit Created(id, msg.sender, question, endsAt);
    }

    /**
     * @notice Lock BOT behind an option. If caller already has a stake, it must be the same option,
     * and since timestamp is updated as an amount-weighted average.
     */
    function lean(uint256 id, uint8 option) external payable {
        if (id == 0 || id > pollCount) revert NotFound();
        Poll storage p = _polls[id];
        if (block.timestamp >= p.endsAt) revert Ended();
        if (msg.value == 0) revert ZeroAmount();
        if (option >= p.optionCount) revert BadOption();

        Stake storage s = _stakes[id][msg.sender];
        OptionTotals storage tot = _totals[id][option];

        if (s.amount > 0) {
            // Must be same option
            if (s.option != option) revert WrongOption(s.option);

            uint128 oldAmount = s.amount;
            uint64 oldSince = s.since;
            uint256 oldWeighted = uint256(oldAmount) * uint256(oldSince);

            uint128 addAmount = uint128(msg.value);
            uint128 newAmount = oldAmount + addAmount;
            uint256 newWeightedTotal = oldWeighted + (uint256(addAmount) * uint256(block.timestamp));

            uint64 newSince = uint64(newWeightedTotal / uint256(newAmount));
            uint256 storedWeighted = uint256(newAmount) * uint256(newSince);

            // Update storage and totals
            tot.amountSum += addAmount;
            tot.weightedSince = tot.weightedSince - oldWeighted + storedWeighted;

            s.amount = newAmount;
            s.since = newSince;
        } else {
            // New stake
            uint128 amount = uint128(msg.value);
            uint64 since = uint64(block.timestamp);

            s.amount = amount;
            s.since = since;
            s.option = option;

            tot.amountSum += amount;
            tot.weightedSince += (uint256(amount) * uint256(since));
        }

        emit Leaned(id, msg.sender, option, s.amount, s.since);
    }

    /**
     * @notice Release locked stake and credit caller's pending till balance.
     * If the poll is still open, contribution is removed from the option's tally.
     * If poll has ended, tallies remain frozen.
     */
    function release(uint256 id) external {
        if (id == 0 || id > pollCount) revert NotFound();
        Stake storage s = _stakes[id][msg.sender];
        if (s.amount == 0) revert NoStake();

        Poll storage p = _polls[id];
        uint128 amount = s.amount;
        uint8 option = s.option;
        uint64 since = s.since;

        bool countedAtEnd = (block.timestamp >= p.endsAt);
        if (!countedAtEnd) {
            OptionTotals storage tot = _totals[id][option];
            tot.amountSum -= amount;
            tot.weightedSince -= (uint256(amount) * uint256(since));
        }

        delete _stakes[id][msg.sender];
        pending[msg.sender] += amount;

        emit Released(id, msg.sender, amount, countedAtEnd);
    }

    /**
     * @notice Pull payment withdrawal for accrued pending balances.
     */
    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pending[msg.sender] = 0;

        (bool sent, ) = msg.sender.call{value: amount}("");
        if (!sent) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Calculate conviction score for an option at current effective time.
     * conviction = amountSum * min(now, endsAt) - weightedSince (in wei * seconds).
     */
    function convictionOf(uint256 id, uint8 option) public view returns (uint256) {
        if (id == 0 || id > pollCount) return 0;
        Poll storage p = _polls[id];
        if (option >= p.optionCount) return 0;

        OptionTotals storage tot = _totals[id][option];
        if (tot.amountSum == 0) return 0;

        uint256 tEff = block.timestamp < p.endsAt ? block.timestamp : p.endsAt;
        uint256 positive = tot.amountSum * tEff;
        if (positive <= tot.weightedSince) return 0;
        return positive - tot.weightedSince;
    }

    /**
     * @notice Conviction scores for all options of a poll.
     */
    function convictions(uint256 id) external view returns (uint256[] memory list_) {
        if (id == 0 || id > pollCount) return new uint256[](0);
        Poll storage p = _polls[id];
        list_ = new uint256[](p.optionCount);
        for (uint8 i = 0; i < p.optionCount; i++) {
            list_[i] = convictionOf(id, i);
        }
    }

    /**
     * @notice Determine the leading option and whether there is a tie.
     * Tied is true if the top conviction is shared by multiple options or if all are 0.
     */
    function leader(uint256 id) public view returns (uint8 bestOption, bool tied) {
        if (id == 0 || id > pollCount) return (0, true);
        Poll storage p = _polls[id];
        if (p.optionCount == 0) return (0, true);

        uint256 maxConv = 0;
        uint8 best = 0;
        bool isTie = false;
        uint256 nonZeroCount = 0;

        for (uint8 i = 0; i < p.optionCount; i++) {
            uint256 c = convictionOf(id, i);
            if (c > 0) nonZeroCount++;
            if (c > maxConv) {
                maxConv = c;
                best = i;
                isTie = false;
            } else if (c == maxConv && i > 0 && maxConv > 0) {
                isTie = true;
            }
        }

        if (maxConv == 0) {
            return (0, true);
        }

        return (best, isTie);
    }

    /**
     * @notice View poll metadata.
     */
    function pollOf(uint256 id) external view returns (Poll memory) {
        if (id == 0 || id > pollCount) revert NotFound();
        return _polls[id];
    }

    /**
     * @notice View options for a poll.
     */
    function optionsOf(uint256 id) external view returns (string[] memory) {
        if (id == 0 || id > pollCount) revert NotFound();
        return _options[id];
    }

    /**
     * @notice View user's stake on a poll.
     */
    function stakeOf(uint256 id, address who) external view returns (Stake memory) {
        return _stakes[id][who];
    }

    /**
     * @notice View raw totals for an option.
     */
    function totalsOf(uint256 id, uint8 option) external view returns (OptionTotals memory) {
        return _totals[id][option];
    }

    /**
     * @notice Query latest polls up to max batch of 50.
     */
    function latest(uint256 offset, uint256 count) external view returns (Poll[] memory list_) {
        if (pollCount == 0 || offset >= pollCount) {
            return new Poll[](0);
        }
        uint256 limit = count;
        if (limit > MAX_BATCH) {
            limit = MAX_BATCH;
        }
        if (offset + limit > pollCount) {
            limit = pollCount - offset;
        }
        list_ = new Poll[](limit);
        for (uint256 i = 0; i < limit; i++) {
            uint256 pId = pollCount - offset - i;
            list_[i] = _polls[pId];
        }
    }
}
