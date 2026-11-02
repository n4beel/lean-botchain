# Lean

> The longer you hold, the more it weighs.

A time-weighted conviction polling protocol on BOT Chain where community sentiment is measured in **capital and duration held**, not just momentary balance. Built under **Archetype AI · Tilt**.

## What it is

A governance signal mechanism where conviction grows dynamically:
- **Time-Weighted Staking with an $O(1)$ Tally**:
  $$\text{conviction}(id, option, t) = \text{amountSum} \times \min(t, \text{endsAt}) - \text{weightedSince}$$
  Scores grow continuously every second by the amount of BOT locked behind an option.
- **Capital Parking, Never Spent**: Locked BOT is never forfeited or spent. It remains held in escrow until released.
- **Amount-Weighted Average Duration**: Stakers can top up an existing stake on the same option at any time. The contract calculates the exact amount-weighted average timestamp:
  $$\text{since}_{\text{new}} = \frac{\text{amount}_{\text{old}} \cdot \text{since}_{\text{old}} + \text{amount}_{\text{add}} \cdot t_{\text{now}}}{\text{amount}_{\text{old}} + \text{amount}_{\text{add}}}$$
- **Releasing Mechanics**:
  - Releasing while a poll is open removes the staker's contribution and weight from the live tally.
  - Releasing after the poll ends leaves the final tally completely frozen.
  - In both cases, the exact principal is credited to the caller's pull-payment till (`pending[caller]`).
- **Non-Reentrant Pull Payments**: Accumulated till funds are withdrawn safely via `withdraw()`.

## What it cannot do (stated on the main screen)

- **Weight follows money and time, not people.** An early large lock dominates.
- **Release early and your weight leaves the tally.** The result at the end is what is *still locked* when time is up.
- **The result is a signal. Nothing is executed.** The contract decides nothing automatically on-chain.

## Archetype AI · Tilt

- **Ground**: Aqua Tint `#E6FFFA`
- **Surface**: Pure White `#FFFFFF` / Elevated `#F4FDFB` / Overlay `#DFFAF4`
- **Text**: Deep Teal Ink `#06292E`, Muted Slate `#3D6469`, Tertiary `#6B9EA4`
- **Accent**: Coral `#FF4D6D` (`#FFFFFF` accent ink)
- **Borders**: Subtle `#D5F2EE`, Default `#BDE3DF`, Strong `#8ECAC4`
- **Status Colors**: Success `#1F7A3D`, Warning `#8A5A00`, Danger `#B3261E`
- **Wallet Menu**: `--menu-bg #FFFFFF` · `--menu-fg #06292E` · `--menu-muted #3D6469` · `--menu-border #BDE3DF` · `--menu-hover-bg #DDF7F2` · `--menu-danger #B3261E`
- **Typography**: Unbounded (display headings), Instrument Sans (UI labels), Martian Mono (figures and numbers).

## Signature Components

- **TiltScale (`TiltScale.tsx`)**: Central horizontal scale anchored to a vertical fulcrum. Bars extend horizontally representing their conviction share and grow in real-time every 250 ms. The whole group tilts 2° toward the leading option (with reduced-motion support).
- **OptionBar (`OptionBar.tsx`)**: Individual option bar showing label, conviction share, score in BOT·days, locked BOT, holder count, and user's coral stake marker with held duration.
- **MiniScale (`MiniScale.tsx`)**: Compact tilting mini-scale for the home page index list.
- **WeightNotice (`WeightNotice.tsx`)**: Clear limitation placard communicating protocol design constraints.
- **ReleaseButton (`ReleaseButton.tsx`)**: Quiet button requiring explicit confirmation that weight will leave the tally upon early release.

### Protocol Limits (from contract constants)

- `MIN_QUESTION = 1`
- `MAX_QUESTION = 120`
- `MIN_OPTIONS = 2`
- `MAX_OPTIONS = 6`
- `MIN_OPTION_LABEL = 1`
- `MAX_OPTION_LABEL = 32`
- `MIN_DURATION = 3600` (1 hour)
- `MAX_DURATION = 7776000` (90 days)
- `MAX_BATCH = 50`

## Contract Architecture (`contracts/src/Lean.sol`)

- `create(string question, string[] options, uint64 durationSecs) external returns (uint256 id)`: Validates bounds, stores question, options, endsAt, emits `Created`.
- `lean(uint256 id, uint8 option) external payable`: Enforces open state (`Ended`), non-zero value (`ZeroAmount`), valid option index (`BadOption`). Updates staker's weighted average timestamp and option totals. Emits `Leaned`.
- `release(uint256 id) external`: Verifies active stake (`NoStake`). If open, deducts weight from option totals. If ended, leaves totals frozen. Credits `pending[msg.sender] += amount`. Emits `Released`.
- `withdraw() external nonReentrant`: Pull-payment till transfer. Emits `Withdrawn`.
- Views: `pollOf(id)`, `optionsOf(id)`, `stakeOf(id, who)`, `totalsOf(id, option)`, `convictionOf(id, option)`, `convictions(id)`, `leader(id)`, `latest(offset, count)`, `pollCount()`, `pending(who)`.

## Verification & Testing

- **Foundry Unit & Fuzz Tests**: 18 tests passing with stateful fuzzing (conservation of balance and totals matching stakes over 256 runs).
- **Foundry Invariant Suites**: Stateful invariant suites verifying balance conservation, monotonic time tallies, and stake/totals synchronization across 32,768 calls.
- **Mutation Testing**: 25/25 mutants tested and documented in `contracts/DECISIONS.md`.
- **Vitest Unit & Integration**: 70 unit tests + 11 on-chain integration tests passing on port `8630`.
- **Quality Gates**: `check-ui-contract.py`, `check-tokens.py`, `check-honesty.py`, `check-distinct.py` all exit 0.
