# Architecture Decisions & Invariants — Lean

## 1. Product Architecture & Protocol Boundaries

Lean is a time-weighted conviction polling protocol on BOT Chain (Bohr testnet, chain ID 968). Conviction is measured in time held, not just money. Groups that want decisions to reflect participants willing to wait and hold, rather than whoever arrives last with a large balance, use Lean.

### Core Protocol Decisions

1. **$O(1)$ Time-Weighted Conviction Tally**:
   - Rather than iterating over active stakers, conviction is computed in $O(1)$ operations via:
     $$\text{conviction}(id, \text{option}, t) = \text{amountSum} \times \min(t, \text{endsAt}) - \text{weightedSince}$$
   - Where:
     - $\text{amountSum} = \sum \text{amount}$
     - $\text{weightedSince} = \sum (\text{amount} \times \text{since})$
   - Units are wei · seconds.

2. **Top-Up with Since Averaging**:
   - A participant can top up their stake behind an existing option.
   - To preserve fairness without splitting stakes into multiple storage slots, the effective `since` timestamp is updated to the amount-weighted average:
     $$\text{newSince} = \frac{\text{oldAmount} \times \text{oldSince} + \text{addAmount} \times \text{now}}{\text{oldAmount} + \text{addAmount}}$$
   - The OptionTotals `weightedSince` is adjusted by the delta, maintaining exact invariant equality.
   - If a participant attempts to top up behind a different option, the contract reverts with `WrongOption(currentOption)`.

3. **Release Dynamics**:
   - **While open (`now < endsAt`)**: releasing returns the participant's locked BOT into `pending[caller]` and **deducts** their `amount` and `amount * since` from the option totals.
   - **After ended (`now >= endsAt`)**: the poll is frozen. The participant still claims back their locked BOT into `pending[caller]`, but the option totals remain frozen so the historical outcome is permanently fixed.

4. **Pull Payments via `withdraw()`**:
   - Released stakes credit `pending[address]`.
   - Withdrawals follow checks-effects-interactions with a non-reentrant mutex.

5. **Leader and Tie Resolution**:
   - `leader(id)` evaluates conviction across all options in $O(N)$ (where $N \le 6$).
   - If maximum conviction is 0 (no stakes or zero elapsed time), or if two or more options share the top conviction, `tied` is returned as `true`.

---

## 2. Invariants & Formal Properties

The contract was formally verified via stateful invariant testing (`contracts/test/LeanInvariant.t.sol`) with 256 runs × 128 depth (32,768 calls) with 0 failures:

1. **Escrow Balance Conservation**:
   $$\text{address(this).balance} == \sum \text{pending} + \sum_{\text{all active stakes}} \text{stake.amount}$$
   - Every single wei deposited into `lean` is strictly accounted for in either pending balances or active stakes.

2. **Totals Match Active Stakes (Open Polls)**:
   $$\forall \text{ open poll } id, \forall \text{ option } i:$$
   $$\text{amountSum} == \sum_{s \in \text{stakes}(id, i)} s.\text{amount}$$
   $$\text{weightedSince} == \sum_{s \in \text{stakes}(id, i)} s.\text{amount} \times s.\text{since}$$

3. **Conviction Non-Negativity & Monotonicity**:
   - For all active stakes, $\text{tot.amountSum} \times \min(\text{now}, \text{endsAt}) \ge \text{tot.weightedSince}$.
   - Conviction is strictly non-negative and non-decreasing over time while stakes remain.

---

## 3. Mutation Analysis

25 deliberate mutants were tested against the test suite (`scripts/mutate.py`) to verify test completeness:

| Mutant ID | Function | Mutation Description | Result |
|---|---|---|---|
| M01 | `create` | Allowed question < `MIN_QUESTION` | KILLED |
| M02 | `create` | Allowed question > `MAX_QUESTION` | KILLED |
| M03 | `create` | Allowed options < `MIN_OPTIONS` | KILLED |
| M04 | `create` | Allowed options > `MAX_OPTIONS` | KILLED |
| M05 | `create` | Allowed option label < `MIN_OPTION_LABEL` | KILLED |
| M06 | `create` | Allowed option label > `MAX_OPTION_LABEL` | KILLED |
| M07 | `create` | Allowed duration < `MIN_DURATION` | KILLED |
| M08 | `create` | Allowed duration > `MAX_DURATION` | KILLED |
| M09 | `lean` | Allowed lean on ended poll | KILLED |
| M10 | `lean` | Allowed zero amount lean | KILLED |
| M11 | `lean` | Allowed out-of-range option index | KILLED |
| M12 | `lean` | Allowed top-up on different option | KILLED |
| M13 | `lean` | Omitted `tot.amountSum` update on top-up | KILLED |
| M14 | `lean` | Corrupted top-up since calculation | KILLED |
| M15 | `lean` | Omitted `weightedSince` on new stake | KILLED |
| M16 | `release` | Allowed release with zero stake | KILLED |
| M17 | `release` | Deducted totals even after poll ends | KILLED |
| M18 | `release` | Did not credit pending on release | KILLED |
| M19 | `release` | Did not deduct `amountSum` on open release | KILLED |
| M20 | `release` | Did not deduct `weightedSince` on open release | KILLED |
| M21 | `withdraw` | Allowed zero withdrawal | KILLED |
| M22 | `withdraw` | Removed reentrancy guard from withdraw | KILLED |
| M23 | `convictionOf` | Did not cap conviction calculation at `endsAt` | KILLED |
| M24 | `leader` | Corrupted strict inequality in leader determination | KILLED |
| M25 | `leader` | Did not mark zero-conviction poll as tied | KILLED |

**Mutation Score: 25/25 (100.0%)**

---

## 4. Gas Report Snapshot

| Function | Min Gas | Avg Gas | Median Gas | Max Gas |
|---|---|---|---|---|
| `create` | 23,569 | 185,478 | 187,999 | 188,239 |
| `lean` (first stake) | 26,104 | 87,372 | 96,118 | 96,130 |
| `release` | 26,000 | 53,059 | 53,171 | 53,171 |
| `withdraw` | 28,498 | 32,279 | 32,294 | 32,294 |
| `convictionOf` | 7,165 | 9,605 | 9,847 | 9,993 |
| `leader` | 14,073 | 17,439 | 18,084 | 19,514 |
