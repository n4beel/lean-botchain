"use client";

import Panel from "@/components/ui/Panel";

/**
 * Archetype AI · Tilt — Limitation Placard.
 *
 * Outlines the protocol's fundamental boundaries per spec §1 and §3.4:
 * 1. Capital and time dictate weight, not individual wallet headcount.
 * 2. Early release completely removes accumulated weight from tally.
 * 3. The poll produces a decentralized signal, not automated execution.
 */
export default function WeightNotice() {
  return (
    <Panel surface className="p-5 md:p-6 my-6 border border-[var(--border-subtle)]">
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden="true"
          className="inline-block w-2 h-2 rotate-45 shrink-0"
          style={{ background: "var(--accent)" }}
        />
        <h2
          className="text-[13px] font-bold uppercase tracking-[0.06em]"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          What weight means here
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[13px] leading-relaxed">
        <div
          className="p-3.5 rounded-[var(--radius)]"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
            Capital & Time
          </p>
          <p style={{ color: "var(--text-muted)" }}>
            It follows money and time, not people. An early large lock dominates.
          </p>
        </div>

        <div
          className="p-3.5 rounded-[var(--radius)]"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
            Releasing Early
          </p>
          <p style={{ color: "var(--text-muted)" }}>
            Release early and your weight leaves the tally.
          </p>
        </div>

        <div
          className="p-3.5 rounded-[var(--radius)]"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
        >
          <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
            Pure Signal
          </p>
          <p style={{ color: "var(--text-muted)" }}>
            The result is a signal. Nothing is executed.
          </p>
        </div>
      </div>
    </Panel>
  );
}
