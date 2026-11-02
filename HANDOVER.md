# Lean Handover Report

## 1. What Was Built
Lean is a time-weighted conviction polling protocol on BOT Chain (Bohr testnet, chain ID 968) under **Archetype AI · Tilt**.

Key components:
- **Smart Contract (`contracts/src/Lean.sol`)**:
  - `create(question, options, durationSecs)`: Registers a new poll with 2..6 options, bounded question (1..120 bytes), and bounded duration (1 hour to 90 days). Emits `Created`.
  - `lean(id, option)` payable: Parks BOT behind an option. Computes amount-weighted average `since` timestamp for top-ups; rejects switching options without releasing first (`WrongOption`). Emits `Leaned`.
  - `release(id)`: Reclaims locked BOT into `pending[caller]`. While open, subtracts weight from totals; after end, totals remain permanently frozen. Emits `Released`.
  - `withdraw()`: Non-reentrant pull payment withdrawal for released stakes. Emits `Withdrawn`.
  - Views: `pollOf`, `optionsOf`, `stakeOf`, `totalsOf`, `convictionOf`, `convictions`, `leader`, `latest`, `pollCount`, `pending`.
- **Frontend Architecture (Archetype AI · Tilt)**:
  - Palette: Ground Aqua Tint `#E6FFFA`, Surface White `#FFFFFF`, Text Deep Teal Ink `#06292E`, Slate `#3D6469`, Accent Coral `#FF4D6D`, Borders `#BDE3DF`.
  - Wallet Menu Tokens: `--menu-bg #FFFFFF` · `--menu-fg #06292E` · `--menu-muted #3D6469` · `--menu-border #BDE3DF` · `--menu-hover-bg #DDF7F2` · `--menu-danger #B3261E`.
  - Typography: Unbounded (display), Instrument Sans (UI), Martian Mono (figures).
  - Signature Components:
    - `TiltScale.tsx`: Real-time conviction growth every 250 ms, horizontal bars anchored to central fulcrum, 2° cosmetic tilt toward leader.
    - `OptionBar.tsx`: Bar share, BOT·days conviction, locked BOT, holder counts, user stake coral marker.
    - `MiniScale.tsx`: Stack of tilting mini-scales for the home page index.
    - `WeightNotice.tsx`: Industrial limitation block with exact copy from spec §3.4.
    - `ReleaseButton.tsx`: Quiet release text button with explicit confirmation dialog.
  - Routes:
    - `/`: Stack of tilting mini-scales, open/ended filter tabs, limitation block.
    - `/new`: Poll creation wizard with option management and duration presets.
    - `/poll/[id]`: Live tilting scale, role-aware top-up/lean form with `step="any"` amount input, and release action.
    - `/me`: User's active stakes across all polls and pull-payment withdrawal till.
    - `app/not-found.tsx`: 404 error page.

---

## 2. Verification Results

### Foundry Unit & Fuzz Tests
```bash
$ cd contracts && forge test
Ran 18 tests for test/Lean.t.sol:LeanTest
[PASS] testFuzz_ConservationOfBalance(uint128) (runs: 256)
[PASS] testFuzz_TotalsMatchStakes(uint8) (runs: 256)
[PASS] test_BadDurationReverts()
[PASS] test_BadOptionsReverts()
[PASS] test_BadQuestionReverts()
[PASS] test_ConvictionExactForFixedVectors()
[PASS] test_ConvictionGrowsLinearly()
[PASS] test_EndedPollRejectsLean()
[PASS] test_LeaderAndTie()
[PASS] test_LeanLocksAndStarts()
[PASS] test_NoOverflowAtLargeValues()
[PASS] test_ReentrantWithdrawBlocked()
[PASS] test_ReleaseAfterEndKeepsFrozenTally()
[PASS] test_ReleaseWhileOpenRemovesWeight()
[PASS] test_TopUpAveragesSince()
[PASS] test_WrongOptionTopUpReverts_ArgsCurrent()
[PASS] test_ZeroAmountReverts()
[PASS] test_ZeroWithdrawReverts()
Suite result: ok. 18 passed; 0 failed
```

### Foundry Stateful Invariant Tests
```bash
$ cd contracts && forge test --match-contract LeanInvariantTest
Ran 3 tests for test/LeanInvariant.t.sol:LeanInvariantTest
[PASS] invariant_BalanceConservation() (runs: 256, calls: 32768, reverts: 0)
[PASS] invariant_TotalsMatchStakes() (runs: 256, calls: 32768, reverts: 0)
[PASS] invariant_ConvictionNonDecreasing() (runs: 256, calls: 32768, reverts: 0)
Suite result: ok. 3 passed; 0 failed
```

### Mutation Testing (`scripts/mutate.py`)
```bash
$ python3 scripts/mutate.py
Killed 25 / 25 mutants (100.0% kill rate).
0 mutants survived.
All decisions documented in contracts/DECISIONS.md.
```

### Vitest Unit & Integration Tests
```bash
$ npm test
Test Files  10 passed (10)
     Tests  70 passed (70)

$ npm run test:integration
Test Files  2 passed (2)
     Tests  11 passed (11)
```

### Policy Checks
```bash
$ python3 scripts/check-tokens.py lean
0 project(s) with undefined tokens

$ python3 scripts/check-ui-contract.py lean
lean: ok

$ python3 scripts/check-distinct.py lean
46 projects compared; 0 pair/file problem(s)

$ python3 scripts/check-honesty.py lean
honesty: 0 finding(s) in 1 project(s)
```

---

## 3. Git Commit History
- `557bea9`: `feat(lean): scaffold project and configure app identity (M1)`
- `8132e3c`: `feat(lean): implement contract, tests, invariants, and mutation suite (M2)`
- `b1a8ee6`: `feat(lean): add ABI, limits, error decoding, helpers, and unit tests (M3)`
- `543d7de`: `feat(lean): implement integration tests and local stack runner (M4)`
- `ad901af`: `feat(lean): implement Archetype AI · Tilt UI components and tokens (M5)`
- `2bc4b0e`: `feat(lean): implement screens and routes for polls, create, detail, and my stakes (M6)`
- *(Current)*: `feat(lean): complete verification, icon, and handover (M7)`
