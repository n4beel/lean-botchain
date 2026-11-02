"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  convictionAt,
  share,
  leader,
  formatRemainingTime,
  formatBotDays,
  type OptionTotals,
} from "@/lib/lean";

interface MiniScaleProps {
  id: bigint;
  question: string;
  endsAt: bigint;
  options: string[];
  totals: OptionTotals[];
  nowSec: number;
}

export default function MiniScale({
  id,
  question,
  endsAt,
  options,
  totals,
  nowSec,
}: MiniScaleProps) {
  const isEnded = BigInt(nowSec) >= endsAt;

  const convictions = useMemo(() => {
    return totals.map((tot) => convictionAt(tot, BigInt(nowSec), endsAt));
  }, [totals, nowSec, endsAt]);

  const shares = useMemo(() => share(convictions), [convictions]);
  const { bestOption, tied } = useMemo(() => leader(convictions), [convictions]);

  const tiltDirection = useMemo(() => {
    if (tied) return "none";
    return bestOption === 0 ? "left" : "right";
  }, [tied, bestOption]);

  const totalConviction = convictions.reduce((a, b) => a + b, 0n);

  return (
    <Link
      href={`/poll/${id.toString()}`}
      className="block no-underline group"
    >
      <div
        className="tilt-group p-4 md:p-5 rounded-[var(--radius-md)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all"
        data-tilt={tiltDirection}
        style={{
          border: isEnded ? "1px solid var(--border-subtle)" : "1px solid var(--border-default)",
        }}
      >
        {/* Top line: Poll #ID + Status Badge + Remaining / Ended */}
        <div className="flex items-center justify-between gap-2 mb-2 text-[11px] uppercase tracking-[0.06em]">
          <div className="flex items-center gap-2">
            <span
              className="font-bold"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
            >
              #{id.toString()}
            </span>
            <span
              className="px-1.5 py-0.5 rounded-sm font-semibold"
              style={{
                background: isEnded ? "var(--bg-overlay)" : "var(--bg-elevated)",
                border: `1px solid ${isEnded ? "var(--border-subtle)" : "var(--border-strong)"}`,
                color: isEnded ? "var(--text-muted)" : "var(--success)",
              }}
            >
              {isEnded ? "Ended" : "Open"}
            </span>
          </div>

          <div
            className="font-medium"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}
          >
            {formatRemainingTime(endsAt, nowSec)}
          </div>
        </div>

        {/* Question Heading in Unbounded */}
        <h3
          className="text-[15px] md:text-[17px] font-semibold leading-snug mb-3 group-hover:text-[var(--accent)] transition-colors line-clamp-2"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          {question}
        </h3>

        {/* Mini Bars Stack */}
        <div className="space-y-2 mb-3">
          {options.map((optLabel, idx) => {
            const optShare = shares[idx] ?? 0;
            const percent = Math.round(optShare * 100);
            const isLeading = !tied && bestOption === idx;

            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-[12px] gap-2">
                  <span
                    className="truncate font-medium"
                    style={{
                      fontFamily: "var(--font-sans)",
                      color: isLeading ? "var(--text-primary)" : "var(--text-secondary)",
                      fontWeight: isLeading ? 600 : 400,
                    }}
                  >
                    {optLabel}
                  </span>
                  <span
                    className="shrink-0 font-medium"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                  >
                    {percent}%
                  </span>
                </div>
                <div
                  className="w-full h-[6px] rounded-full overflow-hidden"
                  style={{ background: "var(--bg-overlay)" }}
                >
                  <div
                    className="mini-tilt-bar"
                    style={{
                      width: `${Math.max(2, Math.min(100, percent))}%`,
                      background: isLeading ? "var(--accent)" : "var(--border-strong)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom meta: Total conviction score */}
        <div
          className="flex items-center justify-between pt-2 text-[11px]"
          style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >
          <span>{options.length} options</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>
            Total: {formatBotDays(totalConviction)}
          </span>
        </div>
      </div>
    </Link>
  );
}
