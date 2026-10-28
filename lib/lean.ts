import { formatEther } from "viem";

export interface OptionTotals {
  amountSum: bigint;
  weightedSince: bigint;
}

export interface PollData {
  id: bigint;
  asker: `0x${string}`;
  endsAt: bigint;
  optionCount: number;
  question: string;
  options: string[];
  totals: OptionTotals[];
  convictions: bigint[];
  leader: {
    bestOption: number;
    tied: boolean;
  };
}

export interface UserStake {
  amount: bigint;
  since: bigint;
  option: number;
}

/**
 * Calculates time-weighted conviction in wei * seconds.
 * conviction = amountSum * min(t, endsAt) - weightedSince
 */
export function convictionAt(
  totals: { amountSum: bigint; weightedSince: bigint },
  t: bigint | number,
  endsAt: bigint | number
): bigint {
  const tBig = typeof t === "number" ? BigInt(t) : t;
  const endsAtBig = typeof endsAt === "number" ? BigInt(endsAt) : endsAt;

  if (totals.amountSum === 0n) return 0n;

  const tEff = tBig < endsAtBig ? tBig : endsAtBig;
  const positive = totals.amountSum * tEff;

  if (positive <= totals.weightedSince) return 0n;
  return positive - totals.weightedSince;
}

/**
 * Computes amount-weighted average since timestamp for top-ups.
 */
export function averageSince(
  oldAmount: bigint,
  oldSince: bigint,
  addAmount: bigint,
  nowSec: bigint
): bigint {
  const totalAmount = oldAmount + addAmount;
  if (totalAmount === 0n) return nowSec;
  const oldWeighted = oldAmount * oldSince;
  const addWeighted = addAmount * nowSec;
  return (oldWeighted + addWeighted) / totalAmount;
}

/**
 * 1 BOT·day = 1e18 wei * 86,400 seconds = 8.64e22 wei·seconds.
 */
export const WEI_SECONDS_PER_BOT_DAY = 10n ** 18n * 86400n;

/**
 * Converts conviction in wei * seconds into numeric BOT·days.
 */
export function toBotDays(convictionWeiSec: bigint): number {
  if (convictionWeiSec === 0n) return 0;
  // Use floating division scaled to avoid loss of small values
  const numerator = Number(convictionWeiSec / 10n ** 12n);
  const denominator = Number(WEI_SECONDS_PER_BOT_DAY / 10n ** 12n);
  return numerator / denominator;
}

/**
 * Formats BOT·days nicely for UI display (e.g., "14.2 BOT·days" or "0.05 BOT·days").
 */
export function formatBotDays(convictionWeiSec: bigint, decimals = 2): string {
  const val = toBotDays(convictionWeiSec);
  if (val === 0) return "0 BOT·days";
  if (val < 0.001) return "<0.001 BOT·days";
  return `${val.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })} BOT·days`;
}

/**
 * Computes conviction share (0.0 to 1.0) for each option.
 * If all are 0, returns equal shares (1 / N) so bars balance evenly at zero.
 */
export function share(convictions: bigint[]): number[] {
  if (convictions.length === 0) return [];
  const total = convictions.reduce((acc, c) => acc + c, 0n);
  if (total === 0n) {
    const equal = 1 / convictions.length;
    return convictions.map(() => equal);
  }

  // Convert to numbers with high precision
  const totalNum = Number(total / 10n ** 12n) || 1;
  return convictions.map((c) => {
    const cNum = Number(c / 10n ** 12n);
    return Math.max(0, Math.min(1, cNum / totalNum));
  });
}

/**
 * Determines leader and tie status from conviction array.
 */
export function leader(convictions: bigint[]): { bestOption: number; tied: boolean } {
  if (convictions.length === 0) return { bestOption: 0, tied: true };

  let maxConv = 0n;
  let best = 0;
  let tied = false;

  for (let i = 0; i < convictions.length; i++) {
    const c = convictions[i];
    if (c > maxConv) {
      maxConv = c;
      best = i;
      tied = false;
    } else if (c === maxConv && i > 0 && maxConv > 0n) {
      tied = true;
    }
  }

  if (maxConv === 0n) {
    return { bestOption: 0, tied: true };
  }

  return { bestOption: best, tied };
}

/**
 * Format elapsed time held: "held for 2d 4h" or "held for 15m" or "held for <1m"
 */
export function formatHeldTime(sinceSec: bigint | number, nowSec: bigint | number): string {
  const s = typeof sinceSec === "number" ? BigInt(sinceSec) : sinceSec;
  const n = typeof nowSec === "number" ? BigInt(nowSec) : nowSec;

  if (n <= s) return "held for <1m";
  const diffSec = Number(n - s);

  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  if (days > 0) {
    return `held for ${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `held for ${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `held for ${minutes}m`;
  }
  return "held for <1m";
}

/**
 * Format remaining time until endsAt: "10 minutes left", "3 days left", "Ended"
 */
export function formatRemainingTime(endsAtSec: bigint | number, nowSec: bigint | number): string {
  const e = typeof endsAtSec === "number" ? BigInt(endsAtSec) : endsAtSec;
  const n = typeof nowSec === "number" ? BigInt(nowSec) : nowSec;

  if (n >= e) return "Ended";
  const diffSec = Number(e - n);

  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  if (days > 1) {
    return `${days} days left`;
  }
  if (days === 1) {
    return `1 day ${hours}h left`;
  }
  if (hours > 1) {
    return `${hours} hours left`;
  }
  if (hours === 1) {
    return `1 hour ${minutes}m left`;
  }
  if (minutes > 0) {
    return `${minutes} min left`;
  }
  return "<1 min left";
}

/**
 * Formats BOT amount cleanly.
 */
export function formatBot(wei: bigint, maxDecimals = 4): string {
  const str = formatEther(wei);
  const parts = str.split(".");
  if (parts.length === 1) return `${parts[0]} BOT`;
  const decimals = parts[1].slice(0, maxDecimals).replace(/0+$/, "");
  return decimals.length > 0 ? `${parts[0]}.${decimals} BOT` : `${parts[0]} BOT`;
}
