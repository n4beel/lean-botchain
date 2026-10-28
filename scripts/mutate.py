import os
import subprocess
import sys

ORIGINAL_SOL = "contracts/src/Lean.sol"
BACKUP_SOL = "contracts/src/Lean.sol.orig"

mutants = [
    # M01: Allow question < MIN_QUESTION
    ("M01", "create", "qBytes.length < MIN_QUESTION ||", "false ||"),
    # M02: Allow question > MAX_QUESTION
    ("M02", "create", "qBytes.length > MAX_QUESTION", "false"),
    # M03: Allow options < MIN_OPTIONS
    ("M03", "create", "options.length < MIN_OPTIONS ||", "false ||"),
    # M04: Allow options > MAX_OPTIONS
    ("M04", "create", "options.length > MAX_OPTIONS", "false"),
    # M05: Allow option label < MIN_OPTION_LABEL
    ("M05", "create", "optBytes.length < MIN_OPTION_LABEL ||", "false ||"),
    # M06: Allow option label > MAX_OPTION_LABEL
    ("M06", "create", "optBytes.length > MAX_OPTION_LABEL", "false"),
    # M07: Allow duration < MIN_DURATION
    ("M07", "create", "durationSecs < MIN_DURATION ||", "false ||"),
    # M08: Allow duration > MAX_DURATION
    ("M08", "create", "durationSecs > MAX_DURATION", "false"),
    # M09: Allow lean on ended poll
    ("M09", "lean", "if (block.timestamp >= p.endsAt) revert Ended();", "/* if (block.timestamp >= p.endsAt) revert Ended(); */"),
    # M10: Allow zero amount lean
    ("M10", "lean", "if (msg.value == 0) revert ZeroAmount();", "/* if (msg.value == 0) revert ZeroAmount(); */"),
    # M11: Allow out-of-range option index
    ("M11", "lean", "if (option >= p.optionCount) revert BadOption();", "/* if (option >= p.optionCount) revert BadOption(); */"),
    # M12: Allow top-up on different option
    ("M12", "lean", "if (s.option != option) revert WrongOption(s.option);", "/* if (s.option != option) revert WrongOption(s.option); */"),
    # M13: Omit tot.amountSum update on top-up
    ("M13", "lean", "tot.amountSum += addAmount;", "/* tot.amountSum += addAmount; */"),
    # M14: Corrupt top-up since calculation
    ("M14", "lean", "uint64 newSince = uint64(newWeightedTotal / uint256(newAmount));", "uint64 newSince = uint64(block.timestamp);"),
    # M15: Omit weightedSince on new stake
    ("M15", "lean", "tot.weightedSince += (uint256(amount) * uint256(since));", "/* tot.weightedSince += (uint256(amount) * uint256(since)); */"),
    # M16: Allow release with zero stake
    ("M16", "release", "if (s.amount == 0) revert NoStake();", "/* if (s.amount == 0) revert NoStake(); */"),
    # M17: Deduct totals even after poll ends
    ("M17", "release", "bool countedAtEnd = (block.timestamp >= p.endsAt);", "bool countedAtEnd = false;"),
    # M18: Do not credit pending on release
    ("M18", "release", "pending[msg.sender] += amount;", "/* pending[msg.sender] += amount; */"),
    # M19: Do not deduct amountSum on open release
    ("M19", "release", "tot.amountSum -= amount;", "/* tot.amountSum -= amount; */"),
    # M20: Do not deduct weightedSince on open release
    ("M20", "release", "tot.weightedSince -= (uint256(amount) * uint256(since));", "/* tot.weightedSince -= (uint256(amount) * uint256(since)); */"),
    # M21: Allow zero withdrawal
    ("M21", "withdraw", "if (amount == 0) revert NothingToWithdraw();", "/* if (amount == 0) revert NothingToWithdraw(); */"),
    # M22: Remove reentrancy guard from withdraw
    ("M22", "withdraw", "function withdraw() external nonReentrant {", "function withdraw() external {"),
    # M23: Do not cap conviction calculation at endsAt
    ("M23", "convictionOf", "uint256 tEff = block.timestamp < p.endsAt ? block.timestamp : p.endsAt;", "uint256 tEff = block.timestamp;"),
    # M24: Corrupt strict inequality in leader determination
    ("M24", "leader", "if (c > maxConv) {", "if (c >= maxConv) {"),
    # M25: Do not mark zero-conviction poll as tied
    ("M25", "leader", "if (maxConv == 0) {\n            return (0, true);\n        }", "/* if (maxConv == 0) { return (0, true); } */"),
]

def run_test():
    res = subprocess.run(
        ["forge", "test", "--match-contract", "LeanTest"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd="contracts"
    )
    return res.returncode == 0

def main():
    with open(ORIGINAL_SOL, "r") as f:
        original_code = f.read()

    with open(BACKUP_SOL, "w") as f:
        f.write(original_code)

    killed = 0
    survived = []

    print(f"Running mutation testing across {len(mutants)} mutants...")

    try:
        for mid, fn, target, replacement in mutants:
            if target not in original_code:
                print(f"ERROR: Mutant {mid} target not found in {ORIGINAL_SOL}: {target}")
                sys.exit(1)

            mutated = original_code.replace(target, replacement, 1)
            with open(ORIGINAL_SOL, "w") as f:
                f.write(mutated)

            passed = run_test()
            if not passed:
                killed += 1
                print(f"[{mid}] {fn:12}: KILLED (test caught mutation)")
            else:
                survived.append((mid, fn, target))
                print(f"[{mid}] {fn:12}: SURVIVED (test did not catch mutation)")

    finally:
        with open(ORIGINAL_SOL, "w") as f:
            f.write(original_code)
        if os.path.exists(BACKUP_SOL):
            os.remove(BACKUP_SOL)

    print("-" * 50)
    total = len(mutants)
    rate = (killed / total) * 100
    print(f"Mutation score: {killed}/{total} ({rate:.1f}%)")
    if survived:
        print(f"Survived mutants: {survived}")
        sys.exit(1)
    else:
        print("All mutants killed! 100% kill rate achieved.")

if __name__ == "__main__":
    main()
