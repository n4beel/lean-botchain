import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import {
  convictionAt,
  averageSince,
  toBotDays,
  formatBotDays,
  share,
  leader,
  formatHeldTime,
  formatRemainingTime,
  formatBot,
  WEI_SECONDS_PER_BOT_DAY,
} from "../lean";
import { decodeContractError } from "../errors";
import {
  validateQuestion,
  validateOptions,
  validateDuration,
  MIN_QUESTION,
  MAX_QUESTION,
  MIN_OPTIONS,
  MAX_OPTIONS,
  MIN_DURATION,
  MAX_DURATION,
} from "../limits";

describe("convictionAt math vectors", () => {
  it("returns 0 when amountSum is 0", () => {
    expect(convictionAt({ amountSum: 0n, weightedSince: 0n }, 1000n, 2000n)).toBe(0n);
  });

  it("calculates exact conviction for single stake: 10 BOT held for 1000 seconds", () => {
    // 10 BOT locked at t=1000. Now is t=2000. endsAt is t=5000.
    const amount = parseEther("10");
    const since = 1000n;
    const totals = {
      amountSum: amount,
      weightedSince: amount * since,
    };

    const conv = convictionAt(totals, 2000n, 5000n);
    // Expected: 10 BOT * (2000 - 1000) = 10,000 BOT·seconds
    expect(conv).toBe(amount * 1000n);
  });

  it("caps conviction at endsAt after poll finishes", () => {
    const amount = parseEther("5");
    const since = 500n;
    const endsAt = 2000n;
    const totals = {
      amountSum: amount,
      weightedSince: amount * since,
    };

    // Before endsAt (t=1500)
    expect(convictionAt(totals, 1500n, endsAt)).toBe(amount * 1000n);
    // At endsAt (t=2000)
    expect(convictionAt(totals, 2000n, endsAt)).toBe(amount * 1500n);
    // Way past endsAt (t=100000)
    expect(convictionAt(totals, 100000n, endsAt)).toBe(amount * 1500n);
  });

  it("calculates exact multi-stake conviction with top-up averaging", () => {
    // Alice locks 2 BOT at t=100
    // Bob locks 3 BOT at t=200
    // At t=300:
    // Alice conviction: 2 BOT * 200s = 400 BOT·s
    // Bob conviction: 3 BOT * 100s = 300 BOT·s
    // Total conviction: 700 BOT·s
    const a1 = parseEther("2");
    const a2 = parseEther("3");
    const totals = {
      amountSum: a1 + a2,
      weightedSince: a1 * 100n + a2 * 200n,
    };

    expect(convictionAt(totals, 300n, 1000n)).toBe(parseEther("700"));
  });
});

describe("averageSince", () => {
  it("computes amount-weighted timestamp correctly", () => {
    const oldAmount = parseEther("1");
    const oldSince = 1000n;
    const addAmount = parseEther("3");
    const nowSec = 2000n;

    // (1 * 1000 + 3 * 2000) / 4 = 7000 / 4 = 1750
    const avg = averageSince(oldAmount, oldSince, addAmount, nowSec);
    expect(avg).toBe(1750n);
  });
});

describe("toBotDays and formatting", () => {
  it("converts 1 BOT held for 1 day (86,400s) to 1.0 BOT·days", () => {
    const conviction = parseEther("1") * 86400n;
    expect(toBotDays(conviction)).toBeCloseTo(1.0, 5);
    expect(formatBotDays(conviction)).toBe("1 BOT·days");
  });

  it("handles 0 BOT·days", () => {
    expect(toBotDays(0n)).toBe(0);
    expect(formatBotDays(0n)).toBe("0 BOT·days");
  });

  it("handles fractional BOT·days", () => {
    const conviction = parseEther("2.5") * 86400n;
    expect(toBotDays(conviction)).toBeCloseTo(2.5, 5);
    expect(formatBotDays(conviction)).toBe("2.5 BOT·days");
  });

  it("formats BOT amount cleanly", () => {
    expect(formatBot(parseEther("1.5"))).toBe("1.5 BOT");
    expect(formatBot(parseEther("100"))).toBe("100 BOT");
    expect(formatBot(parseEther("0.0001"))).toBe("0.0001 BOT");
  });
});

describe("share calculation", () => {
  it("returns equal split when all convictions are 0", () => {
    const shares = share([0n, 0n, 0n]);
    expect(shares.length).toBe(3);
    expect(shares[0]).toBeCloseTo(1 / 3, 5);
    expect(shares[1]).toBeCloseTo(1 / 3, 5);
    expect(shares[2]).toBeCloseTo(1 / 3, 5);
  });

  it("computes proportional shares accurately", () => {
    const shares = share([parseEther("20"), parseEther("80")]);
    expect(shares[0]).toBeCloseTo(0.2, 5);
    expect(shares[1]).toBeCloseTo(0.8, 5);
  });
});

describe("leader and tie resolution", () => {
  it("marks empty or zero-conviction poll as tied", () => {
    expect(leader([0n, 0n])).toEqual({ bestOption: 0, tied: true });
    expect(leader([])).toEqual({ bestOption: 0, tied: true });
  });

  it("identifies a clear single leader", () => {
    expect(leader([100n, 500n, 200n])).toEqual({ bestOption: 1, tied: false });
    expect(leader([900n, 500n, 200n])).toEqual({ bestOption: 0, tied: false });
  });

  it("identifies a tie between top options", () => {
    expect(leader([500n, 500n, 200n])).toEqual({ bestOption: 0, tied: true });
    expect(leader([100n, 800n, 800n])).toEqual({ bestOption: 1, tied: true });
  });
});

describe("time formatters", () => {
  it("formatHeldTime", () => {
    expect(formatHeldTime(1000n, 1030n)).toBe("held for <1m");
    expect(formatHeldTime(1000n, 1900n)).toBe("held for 15m");
    expect(formatHeldTime(1000n, 1000n + 3600n * 3n + 120n)).toBe("held for 3h 2m");
    expect(formatHeldTime(1000n, 1000n + 86400n * 2n + 3600n * 4n)).toBe("held for 2d 4h");
  });

  it("formatRemainingTime", () => {
    expect(formatRemainingTime(1000n, 1500n)).toBe("Ended");
    expect(formatRemainingTime(1000n, 980n)).toBe("<1 min left");
    expect(formatRemainingTime(1000n, 400n)).toBe("10 min left");
    expect(formatRemainingTime(10000n, 10000n - 7200n)).toBe("2 hours left");
    expect(formatRemainingTime(100000n, 100000n - 86400n * 5n)).toBe("5 days left");
  });
});

describe("decodeContractError", () => {
  it("decodes WrongOption with option label", () => {
    const errorMsg = "reverted with custom error 'WrongOption(1)'";
    const decoded = decodeContractError(new Error(errorMsg), ["Apples", "Bananas"]);
    expect(decoded).toBe('You\'ve locked BOT behind "Bananas". Release first to switch.');
  });

  it("decodes WrongOption without option names fallback", () => {
    const errorMsg = "reverted with custom error 'WrongOption(2)'";
    const decoded = decodeContractError(new Error(errorMsg));
    expect(decoded).toBe("You've locked BOT behind option #3. Release first to switch.");
  });

  it("decodes Ended error", () => {
    expect(decodeContractError(new Error("reverted with Ended()"))).toBe("This poll has ended.");
  });

  it("decodes ZeroAmount error", () => {
    expect(decodeContractError(new Error("reverted with ZeroAmount()"))).toBe(
      "Must lock a non-zero amount of BOT."
    );
  });

  it("decodes user rejection", () => {
    expect(decodeContractError(new Error("User rejected the request."))).toBe(
      "Transaction was cancelled in your wallet."
    );
  });
});

describe("limits validation", () => {
  it("validates question", () => {
    expect(validateQuestion("")).toBe("Question is required.");
    expect(validateQuestion("   ")).toBe("Question is required.");
    expect(validateQuestion("Valid question?")).toBeNull();
    expect(validateQuestion("a".repeat(121))).toContain("exceeds maximum");
  });

  it("validates options", () => {
    expect(validateOptions(["A"])).toContain("at least 2 options");
    expect(validateOptions(["A", "B", "C", "D", "E", "F", "G"])).toContain("Cannot exceed 6 options");
    expect(validateOptions(["A", ""])).toContain("Option 2: Option label cannot be empty");
    expect(validateOptions(["Option A", "Option B"])).toBeNull();
  });

  it("validates duration", () => {
    expect(validateDuration(3599)).toContain("at least 1 hour");
    expect(validateDuration(86400)).toBeNull();
    expect(validateDuration(7776001)).toContain("cannot exceed 90 days");
  });
});
