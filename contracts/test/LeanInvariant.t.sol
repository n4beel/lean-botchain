// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Lean.sol";

contract LeanHandler is Test {
    Lean public lean;

    address[] public actors;
    uint256[] public createdIds;

    constructor(Lean _lean) {
        lean = _lean;
        actors.push(address(0x1111));
        actors.push(address(0x2222));
        actors.push(address(0x3333));
        actors.push(address(0x4444));

        for (uint256 i = 0; i < actors.length; i++) {
            vm.deal(actors[i], 100_000 ether);
        }
    }

    function create(uint256 actorSeed, uint8 optCountSeed, uint64 durationSeed) external returns (uint256 id) {
        address creator = actors[actorSeed % actors.length];
        uint8 optCount = uint8(bound(optCountSeed, 2, 4));
        uint64 duration = uint64(bound(durationSeed, 3600, 86400 * 7));

        string[] memory opts = new string[](optCount);
        for (uint8 i = 0; i < optCount; i++) {
            if (i == 0) opts[i] = "Alpha";
            else if (i == 1) opts[i] = "Beta";
            else if (i == 2) opts[i] = "Gamma";
            else opts[i] = "Delta";
        }

        vm.prank(creator);
        try lean.create("Invariant Poll", opts, duration) returns (uint256 newId) {
            createdIds.push(newId);
            id = newId;
        } catch {}
    }

    function leanStake(
        uint256 actorSeed,
        uint256 idSeed,
        uint8 optSeed,
        uint128 amountSeed
    ) external {
        if (createdIds.length == 0) return;
        uint256 id = createdIds[idSeed % createdIds.length];
        address actor = actors[actorSeed % actors.length];

        Lean.Poll memory p;
        try lean.pollOf(id) returns (Lean.Poll memory _p) {
            p = _p;
        } catch {
            return;
        }

        if (block.timestamp >= p.endsAt) return;

        Lean.Stake memory s = lean.stakeOf(id, actor);
        uint8 option;
        if (s.amount > 0) {
            // Already staked: top up on same option
            option = s.option;
        } else {
            option = uint8(optSeed % p.optionCount);
        }

        uint256 amount = bound(amountSeed, 0.01 ether, 50 ether);

        vm.prank(actor);
        try lean.lean{value: amount}(id, option) {} catch {}
    }

    function release(uint256 actorSeed, uint256 idSeed) external {
        if (createdIds.length == 0) return;
        uint256 id = createdIds[idSeed % createdIds.length];
        address actor = actors[actorSeed % actors.length];

        Lean.Stake memory s = lean.stakeOf(id, actor);
        if (s.amount == 0) return;

        vm.prank(actor);
        try lean.release(id) {} catch {}
    }

    function withdraw(uint256 actorSeed) external {
        address actor = actors[actorSeed % actors.length];
        if (lean.pending(actor) == 0) return;

        vm.prank(actor);
        try lean.withdraw() {} catch {}
    }

    function warp(uint32 warpSeconds) external {
        uint32 dt = uint32(bound(warpSeconds, 1, 7200));
        vm.warp(block.timestamp + dt);
    }

    function getCreatedIds() external view returns (uint256[] memory) {
        return createdIds;
    }

    function getActors() external view returns (address[] memory) {
        return actors;
    }
}

contract LeanInvariantTest is Test {
    Lean public lean;
    LeanHandler public handler;

    function setUp() public {
        lean = new Lean();
        handler = new LeanHandler(lean);

        targetContract(address(handler));
    }

    function invariant_ConservationOfBalance() public view {
        uint256 expectedBalance = 0;

        // Sum pending balances of all actors
        address[] memory actors = handler.getActors();
        for (uint256 i = 0; i < actors.length; i++) {
            expectedBalance += lean.pending(actors[i]);
        }

        // Sum all active stakes across all created polls
        uint256[] memory ids = handler.getCreatedIds();
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            for (uint256 a = 0; a < actors.length; a++) {
                Lean.Stake memory s = lean.stakeOf(id, actors[a]);
                expectedBalance += s.amount;
            }
        }

        assertEq(address(lean).balance, expectedBalance, "Conservation of balance violated");
    }

    function invariant_TotalsMatchActiveStakes() public view {
        uint256[] memory ids = handler.getCreatedIds();
        address[] memory actors = handler.getActors();

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            Lean.Poll memory p = lean.pollOf(id);

            // Invariant only holds for open polls, because after endsAt, release() freezes totals
            if (block.timestamp < p.endsAt) {
                for (uint8 opt = 0; opt < p.optionCount; opt++) {
                    uint256 expectedAmountSum = 0;
                    uint256 expectedWeightedSince = 0;

                    for (uint256 a = 0; a < actors.length; a++) {
                        Lean.Stake memory s = lean.stakeOf(id, actors[a]);
                        if (s.amount > 0 && s.option == opt) {
                            expectedAmountSum += s.amount;
                            expectedWeightedSince += uint256(s.amount) * uint256(s.since);
                        }
                    }

                    Lean.OptionTotals memory tot = lean.totalsOf(id, opt);
                    assertEq(tot.amountSum, expectedAmountSum, "amountSum mismatch in open poll");
                    assertEq(tot.weightedSince, expectedWeightedSince, "weightedSince mismatch in open poll");
                }
            }
        }
    }

    function invariant_ConvictionNeverDecreasesWhileStaked() public view {
        uint256[] memory ids = handler.getCreatedIds();

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            Lean.Poll memory p = lean.pollOf(id);
            uint256 tEff = block.timestamp < p.endsAt ? block.timestamp : p.endsAt;

            for (uint8 opt = 0; opt < p.optionCount; opt++) {
                Lean.OptionTotals memory tot = lean.totalsOf(id, opt);
                if (tot.amountSum > 0) {
                    // weightedSince must not exceed amountSum * tEff (average since <= tEff)
                    assertTrue(
                        tot.amountSum * tEff >= tot.weightedSince,
                        "tot.weightedSince exceeds amountSum * tEff"
                    );
                }
                uint256 conv = lean.convictionOf(id, opt);
                // In non-staked option conviction is 0, in staked option conviction >= 0
                assertTrue(conv >= 0, "Conviction negative");
            }
        }
    }
}
