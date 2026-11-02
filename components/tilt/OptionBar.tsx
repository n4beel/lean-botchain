"use client";

import { formatBotDays, formatBot, formatHeldTime } from "@/lib/lean";

interface OptionBarProps {
  index: number;
  label: string;
  share: number; // 0 to 1
  conviction: bigint;
  amountSum: bigint;
  holders?: number | string;
  isLeader?: boolean;
  isTied?: boolean;
  userStake?: { amount: bigint; since: bigint; option: number } | null;
  nowSec: number;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (index: number) => void;
}

export default function OptionBar({
  index,
  label,
  share,
  conviction,
  amountSum,
  holders = "—",
  isLeader = false,
  isTied = false,
  userStake,
  nowSec,
  selectable = false,
  selected = false,
  onSelect,
}: OptionBarProps) {
  const percent = Math.round(share * 100);
  const hasUserStake = userStake && userStake.option === index && userStake.amount > 0n;

  return (
    <div
      onClick={selectable && onSelect ? () => onSelect(index) : undefined}
      className={[
        "relative p-4 rounded-[var(--radius-md)] transition-all",
        selectable ? "cursor-pointer" : "",
        selected
          ? "ring-2 ring-[var(--accent)] bg-[var(--bg-elevated)]"
          : "bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]",
      ].join(" ")}
      style={{
        border: selected
          ? "1px solid var(--accent)"
          : isLeader && !isTied
            ? "1px solid var(--accent)"
            : "1px solid var(--border-default)",
      }}
    >
      {/* Header row: Option Index + Name + Badges + Conviction Score */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0"
            style={{
              background: isLeader && !isTied ? "var(--accent)" : "var(--bg-overlay)",
              color: isLeader && !isTied ? "var(--accent-ink)" : "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {index + 1}
          </span>
          <span
            className="text-[14px] font-semibold truncate"
            style={{ fontFamily: "var(--font-sans)", color: "var(--text-primary)" }}
          >
            {label}
          </span>
          {isLeader && !isTied && (
            <span
              className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-[0.06em] rounded-sm shrink-0"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              Leading
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className="text-[13px] font-semibold"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}
          >
            {formatBotDays(conviction)}
          </span>
          <span
            className="text-[12px] font-medium"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
          >
            ({percent}%)
          </span>
        </div>
      </div>

      {/* Bar track container */}
      <div
        className="relative w-full h-[28px] rounded-[var(--radius-sm)] overflow-hidden"
        style={{ background: "var(--bg-overlay)" }}
      >
        <div
          className="tilt-bar flex items-center px-3"
          style={{
            width: `${Math.max(2, Math.min(100, percent))}%`,
            background: isLeader && !isTied ? "var(--accent)" : "var(--border-strong)",
          }}
        >
          {hasUserStake && (
            <div
              className="tilt-stake-marker"
              title={`Your stake: ${formatHeldTime(userStake.since, nowSec)}`}
            />
          )}
        </div>
      </div>

      {/* Footer stats: locked BOT, holders count, user stake info */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 text-[12px]">
        <div className="flex items-center gap-3" style={{ color: "var(--text-secondary)" }}>
          <span>
            <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {formatBot(amountSum)}
            </strong>{" "}
            locked
          </span>
          <span>·</span>
          <span>
            <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {holders}
            </strong>{" "}
            {typeof holders === "number" && holders === 1 ? "holder" : "holders"}
          </span>
        </div>

        {hasUserStake && (
          <div
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--accent)",
              color: "var(--accent)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--accent)" }}
            />
            <span>You: {formatBot(userStake.amount)}</span>
            <span>({formatHeldTime(userStake.since, nowSec)})</span>
          </div>
        )}
      </div>
    </div>
  );
}
