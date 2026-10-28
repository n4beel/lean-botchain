// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Lean.sol";

contract MaliciousRecipient {
    Lean public target;
    bool public attacked;

    constructor(Lean _target) {
        target = _target;
    }

    function attack() external payable {
        target.withdraw();
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            (bool s, bytes memory data) = address(target).call(abi.encodeWithSignature("withdraw()"));
            require(!s, "Reentrancy allowed");
            bytes memory expected = abi.encodeWithSignature("Error(string)", "REENTRANCY");
            require(keccak256(data) == keccak256(expected), "Not REENTRANCY error");
        }
    }
}

contract LeanTest is Test {
    Lean public lean;

    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public charlie = address(0xCC);

    string[] public sampleOptions;

    function setUp() public {
        lean = new Lean();

        sampleOptions = new string[](3);
        sampleOptions[0] = "Option Alpha";
        sampleOptions[1] = "Option Beta";
        sampleOptions[2] = "Option Gamma";

        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(charlie, 1000 ether);
    }

    function test_CreatePollHappyPath() public {
        vm.prank(alice);
        uint256 id = lean.create("Should we deploy protocol v2?", sampleOptions, 86400);
        assertEq(id, 1);
        assertEq(lean.pollCount(), 1);

        Lean.Poll memory p = lean.pollOf(1);
        assertEq(p.asker, alice);
        assertEq(p.optionCount, 3);
        assertEq(p.endsAt, block.timestamp + 86400);
        assertEq(p.question, "Should we deploy protocol v2?");

        string[] memory opts = lean.optionsOf(1);
        assertEq(opts.length, 3);
        assertEq(opts[0], "Option Alpha");
    }

    function test_LeanLocksAndStarts() public {
        vm.prank(alice);
        uint256 id = lean.create("Test Question", sampleOptions, 86400);

        vm.prank(bob);
        lean.lean{value: 2 ether}(id, 0);

        Lean.Stake memory s = lean.stakeOf(id, bob);
        assertEq(s.amount, 2 ether);
        assertEq(s.option, 0);
        assertEq(s.since, block.timestamp);

        Lean.OptionTotals memory tot = lean.totalsOf(id, 0);
        assertEq(tot.amountSum, 2 ether);
        assertEq(tot.weightedSince, 2 ether * block.timestamp);

        // Conviction at same second is 0
        assertEq(lean.convictionOf(id, 0), 0);
    }

    function test_ConvictionGrowsLinearly() public {
        vm.prank(alice);
        uint256 id = lean.create("Linear Test", sampleOptions, 86400);

        vm.prank(bob);
        lean.lean{value: 1 ether}(id, 0);

        vm.warp(block.timestamp + 10);
        assertEq(lean.convictionOf(id, 0), 1 ether * 10);

        vm.warp(block.timestamp + 10);
        assertEq(lean.convictionOf(id, 0), 1 ether * 20);
    }

    function test_TopUpAveragesSince() public {
        vm.warp(1000);
        vm.prank(alice);
        uint256 id = lean.create("TopUp Test", sampleOptions, 86400);

        // Bob locks 1 ether at t=1000
        vm.prank(bob);
        lean.lean{value: 1 ether}(id, 0);

        // Advance to t=1300 (dt = 300)
        vm.warp(1300);

        // Bob tops up 3 ether at t=1300
        // Expected since: (1 * 1000 + 3 * 1300) / 4 = (1000 + 3900) / 4 = 4900 / 4 = 1225
        vm.prank(bob);
        lean.lean{value: 3 ether}(id, 0);

        Lean.Stake memory s = lean.stakeOf(id, bob);
        assertEq(s.amount, 4 ether);
        assertEq(s.since, 1225);

        Lean.OptionTotals memory tot = lean.totalsOf(id, 0);
        assertEq(tot.amountSum, 4 ether);
        assertEq(tot.weightedSince, 4 ether * 1225);

        // At t=1300, conviction = 4 * (1300 - 1225) = 4 * 75 = 300 ether*s
        assertEq(lean.convictionOf(id, 0), 4 ether * 75);
    }

    function test_WrongOptionTopUpReverts_ArgsCurrent() public {
        vm.prank(alice);
        uint256 id = lean.create("Question", sampleOptions, 86400);

        vm.prank(bob);
        lean.lean{value: 1 ether}(id, 0);

        // Trying to top up on option 1 should revert with WrongOption(0)
        vm.expectRevert(abi.encodeWithSelector(Lean.WrongOption.selector, uint8(0)));
        vm.prank(bob);
        lean.lean{value: 1 ether}(id, 1);
    }

    function test_ReleaseWhileOpenRemovesWeight() public {
        vm.prank(alice);
        uint256 id = lean.create("Question", sampleOptions, 86400);

        vm.prank(bob);
        lean.lean{value: 2 ether}(id, 0);

        vm.warp(block.timestamp + 50);
        assertEq(lean.convictionOf(id, 0), 2 ether * 50);

        // Bob releases while open
        vm.prank(bob);
        lean.release(id);

        // Option 0 totals zeroed out
        Lean.OptionTotals memory tot = lean.totalsOf(id, 0);
        assertEq(tot.amountSum, 0);
        assertEq(tot.weightedSince, 0);
        assertEq(lean.convictionOf(id, 0), 0);

        // Stake cleared
        Lean.Stake memory s = lean.stakeOf(id, bob);
        assertEq(s.amount, 0);

        // Pending till credited
        assertEq(lean.pending(bob), 2 ether);

        // Bob withdraws
        uint256 balBefore = bob.balance;
        vm.prank(bob);
        lean.withdraw();
        assertEq(bob.balance, balBefore + 2 ether);
        assertEq(lean.pending(bob), 0);
    }

    function test_ReleaseAfterEndKeepsFrozenTally() public {
        vm.warp(1000);
        vm.prank(alice);
        uint256 id = lean.create("Question", sampleOptions, 3600); // ends at 4600

        vm.prank(bob);
        lean.lean{value: 2 ether}(id, 0); // since 1000

        // Warp past endsAt
        vm.warp(5000);

        // Conviction frozen at endsAt = 4600: 2 ether * (4600 - 1000) = 2 ether * 3600 = 7200 ether*s
        uint256 frozenConviction = lean.convictionOf(id, 0);
        assertEq(frozenConviction, 2 ether * 3600);

        // Bob releases after end
        vm.prank(bob);
        lean.release(id);

        // Tallies should remain frozen!
        assertEq(lean.convictionOf(id, 0), frozenConviction);
        Lean.OptionTotals memory tot = lean.totalsOf(id, 0);
        assertEq(tot.amountSum, 2 ether);
        assertEq(tot.weightedSince, 2 ether * 1000);

        // Bob received refund in till
        assertEq(lean.pending(bob), 2 ether);
    }

    function test_LeaderAndTie() public {
        vm.prank(alice);
        uint256 id = lean.create("Question", sampleOptions, 86400);

        // Initially no stakes -> tied
        (uint8 bestOpt, bool isTie) = lean.leader(id);
        assertTrue(isTie);

        // Bob leans 1 ether on option 0
        vm.prank(bob);
        lean.lean{value: 1 ether}(id, 0);

        // Warp 10 seconds
        vm.warp(block.timestamp + 10);
        (bestOpt, isTie) = lean.leader(id);
        assertFalse(isTie);
        assertEq(bestOpt, 0);

        // Charlie leans 2 ether on option 1 at same second
        vm.prank(charlie);
        lean.lean{value: 2 ether}(id, 1);

        // Warp 10 more seconds
        // Conviction option 0: 1 * 20 = 20
        // Conviction option 1: 2 * 10 = 20
        // Tied!
        vm.warp(block.timestamp + 10);
        (bestOpt, isTie) = lean.leader(id);
        assertTrue(isTie);

        // Warp another 1 second
        // Conviction option 0: 1 * 21 = 21
        // Conviction option 1: 2 * 11 = 22
        // Option 1 leads!
        vm.warp(block.timestamp + 1);
        (bestOpt, isTie) = lean.leader(id);
        assertFalse(isTie);
        assertEq(bestOpt, 1);
    }

    function test_EndedPollRejectsLean() public {
        vm.prank(alice);
        uint256 id = lean.create("Question", sampleOptions, 3600);

        vm.warp(block.timestamp + 3601);
        vm.expectRevert(Lean.Ended.selector);
        vm.prank(bob);
        lean.lean{value: 1 ether}(id, 0);
    }

    function test_ZeroAmountReverts() public {
        vm.prank(alice);
        uint256 id = lean.create("Question", sampleOptions, 3600);

        vm.expectRevert(Lean.ZeroAmount.selector);
        vm.prank(bob);
        lean.lean{value: 0}(id, 0);
    }

    function test_ConvictionExactForFixedVectors() public {
        vm.warp(1000);
        vm.prank(alice);
        uint256 id = lean.create("Fixed Vectors", sampleOptions, 3600);

        // Alice locks 2 ether at t=1000 on option 0
        vm.prank(alice);
        lean.lean{value: 2 ether}(id, 0);

        // Warp to 1050
        vm.warp(1050);

        // Bob locks 3 ether at t=1050 on option 0
        vm.prank(bob);
        lean.lean{value: 3 ether}(id, 0);

        // At t=1100:
        // Alice conviction: 2 ether * 100s = 200 ether*s
        // Bob conviction: 3 ether * 50s = 150 ether*s
        // Total expected: 350 ether*s
        vm.warp(1100);
        assertEq(lean.convictionOf(id, 0), 350 ether);

        uint256[] memory list = lean.convictions(id);
        assertEq(list.length, 3);
        assertEq(list[0], 350 ether);
        assertEq(list[1], 0);
        assertEq(list[2], 0);
    }

    function test_NoOverflowAtLargeValues() public {
        vm.warp(1000);
        vm.prank(alice);
        uint256 id = lean.create("Big Numbers", sampleOptions, 7776000); // 90 days

        // 10^27 wei (1 billion ether)
        uint256 hugeAmount = 1e27;
        vm.deal(bob, hugeAmount * 2);

        vm.prank(bob);
        lean.lean{value: hugeAmount}(id, 0);

        // Warp full 90 days
        vm.warp(1000 + 7776000);

        uint256 c = lean.convictionOf(id, 0);
        // Expected: 1e27 * 7776000 = 7.776e33
        assertEq(c, hugeAmount * 7776000);
    }

    function test_ReentrantWithdrawBlocked() public {
        vm.prank(alice);
        uint256 id = lean.create("Reentrancy Test", sampleOptions, 3600);

        MaliciousRecipient attacker = new MaliciousRecipient(lean);
        vm.deal(address(attacker), 10 ether);

        vm.prank(address(attacker));
        lean.lean{value: 5 ether}(id, 0);

        vm.prank(address(attacker));
        lean.release(id);

        assertEq(lean.pending(address(attacker)), 5 ether);

        attacker.attack();
        assertEq(address(attacker).balance, 10 ether);
        assertEq(lean.pending(address(attacker)), 0);
    }

    function test_DoubleWithdrawReverts() public {
        vm.prank(alice);
        uint256 id = lean.create("Double Withdraw", sampleOptions, 3600);

        vm.prank(bob);
        lean.lean{value: 1 ether}(id, 0);

        vm.prank(bob);
        lean.release(id);

        vm.prank(bob);
        lean.withdraw();

        vm.expectRevert(Lean.NothingToWithdraw.selector);
        vm.prank(bob);
        lean.withdraw();
    }

    function test_BoundaryValidation() public {
        // BadQuestion length 0
        vm.expectRevert(Lean.BadQuestion.selector);
        lean.create("", sampleOptions, 86400);

        // BadQuestion length > 120
        string memory longQ = "This question is intentionally crafted to exceed the maximum permitted length limit of one hundred and twenty bytes total!";
        vm.expectRevert(Lean.BadQuestion.selector);
        lean.create(longQ, sampleOptions, 86400);

        // BadOptions < 2
        string[] memory oneOpt = new string[](1);
        oneOpt[0] = "Solo";
        vm.expectRevert(Lean.BadOptions.selector);
        lean.create("Question?", oneOpt, 86400);

        // BadOptions > 6
        string[] memory sevenOpts = new string[](7);
        for (uint256 i = 0; i < 7; i++) sevenOpts[i] = "Opt";
        vm.expectRevert(Lean.BadOptions.selector);
        lean.create("Question?", sevenOpts, 86400);

        // BadOptions label empty
        string[] memory emptyLabel = new string[](2);
        emptyLabel[0] = "";
        emptyLabel[1] = "Valid";
        vm.expectRevert(Lean.BadOptions.selector);
        lean.create("Question?", emptyLabel, 86400);

        // BadOptions label > 32
        string[] memory longLabel = new string[](2);
        longLabel[0] = "This option label is way too long to fit in 32 bytes";
        longLabel[1] = "Valid";
        vm.expectRevert(Lean.BadOptions.selector);
        lean.create("Question?", longLabel, 86400);

        // BadDuration < 3600
        vm.expectRevert(Lean.BadDuration.selector);
        lean.create("Question?", sampleOptions, 3599);

        // BadDuration > 7776000 (90 days)
        vm.expectRevert(Lean.BadDuration.selector);
        lean.create("Question?", sampleOptions, 7776001);

        // Create valid poll
        uint256 id = lean.create("Valid Poll", sampleOptions, 86400);

        // BadOption index >= 3
        vm.expectRevert(Lean.BadOption.selector);
        lean.lean{value: 1 ether}(id, 3);

        // Release with NoStake
        vm.expectRevert(Lean.NoStake.selector);
        vm.prank(charlie);
        lean.release(id);

        // NotFound id
        vm.expectRevert(Lean.NotFound.selector);
        lean.pollOf(999);
    }

    function test_LatestView() public {
        for (uint256 i = 0; i < 5; i++) {
            lean.create("Q", sampleOptions, 86400);
        }
        assertEq(lean.pollCount(), 5);

        Lean.Poll[] memory recents = lean.latest(0, 3);
        assertEq(recents.length, 3);

        Lean.Poll[] memory emptyList = lean.latest(10, 5);
        assertEq(emptyList.length, 0);
    }

    function testFuzz_ConservationOfBalance(uint128 amt1, uint128 amt2) public {
        vm.assume(amt1 > 0 && amt1 < 50 ether);
        vm.assume(amt2 > 0 && amt2 < 50 ether);

        vm.prank(alice);
        uint256 id = lean.create("Fuzz Poll", sampleOptions, 86400);

        vm.prank(bob);
        lean.lean{value: amt1}(id, 0);

        vm.prank(charlie);
        lean.lean{value: amt2}(id, 1);

        assertEq(address(lean).balance, amt1 + amt2);

        // Bob releases
        vm.prank(bob);
        lean.release(id);

        assertEq(address(lean).balance, amt1 + amt2);
        assertEq(lean.pending(bob), amt1);

        // Bob withdraws
        vm.prank(bob);
        lean.withdraw();
        assertEq(address(lean).balance, amt2);
    }

    function testFuzz_TotalsMatchStakes(uint128 amt1, uint128 amt2, uint32 dt) public {
        vm.assume(amt1 > 0 && amt1 < 100 ether);
        vm.assume(amt2 > 0 && amt2 < 100 ether);
        vm.assume(dt > 0 && dt < 86400);

        vm.warp(1000);
        vm.prank(alice);
        uint256 id = lean.create("Fuzz Totals", sampleOptions, 172800);

        vm.prank(bob);
        lean.lean{value: amt1}(id, 0);

        vm.warp(1000 + dt);
        vm.prank(charlie);
        lean.lean{value: amt2}(id, 0);

        Lean.OptionTotals memory tot = lean.totalsOf(id, 0);
        assertEq(tot.amountSum, amt1 + amt2);

        Lean.Stake memory sBob = lean.stakeOf(id, bob);
        Lean.Stake memory sCharlie = lean.stakeOf(id, charlie);

        uint256 expectedWeighted = (uint256(sBob.amount) * uint256(sBob.since)) +
            (uint256(sCharlie.amount) * uint256(sCharlie.since));
        assertEq(tot.weightedSince, expectedWeighted);
    }
}
