"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import MiniScale from "@/components/tilt/MiniScale";
import WeightNotice from "@/components/tilt/WeightNotice";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import Panel from "@/components/ui/Panel";
import { useLean } from "@/lib/useLean";
import { app } from "@/lib/app-config";
import type { PollData } from "@/lib/lean";

const TABS = [
  { href: "/", label: "Polls" },
  { href: "/new", label: "Create" },
  { href: "/me", label: "My Stakes & Till" },
];

export default function HomePage() {
  const { isContractDeployed, getLatestPolls } = useLean();

  const [polls, setPolls] = useState<PollData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "ended">("open");
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));

  // Ticker for elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch polls
  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const data = await getLatestPolls(0n, 50n);
        if (mounted) setPolls(data);
      } catch {
        // Handled silently
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [getLatestPolls]);

  // Separate open and ended polls
  const openPolls = useMemo(() => {
    return polls
      .filter((p) => BigInt(nowSec) < p.endsAt)
      .sort((a, b) => (a.endsAt < b.endsAt ? -1 : a.endsAt > b.endsAt ? 1 : 0)); // soonest ending first
  }, [polls, nowSec]);

  const endedPolls = useMemo(() => {
    return polls
      .filter((p) => BigInt(nowSec) >= p.endsAt)
      .sort((a, b) => (a.endsAt > b.endsAt ? -1 : a.endsAt < b.endsAt ? 1 : 0)); // newest ended first
  }, [polls, nowSec]);

  const displayedPolls = filter === "open" ? openPolls : endedPolls;

  return (
    <PageShell tabs={TABS}>
      {/* Hero Header */}
      <div className="mb-8 pt-2">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[var(--radius-sm)] mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]"
             style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
          <span>Conviction by Duration</span>
        </div>
        <h1
          className="text-[26px] md:text-[34px] font-bold leading-tight tracking-[-0.02em] mb-2"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          {app.tagline}
        </h1>
        <p className="text-[14px] leading-relaxed max-w-[620px]" style={{ color: "var(--text-secondary)" }}>
          Conviction is measured in time held, not just money. Option scores grow every second by the BOT locked behind them. Releasing returns your BOT and removes your contribution.
        </p>
      </div>

      {/* Filter Tabs & Create Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("open")}
            className="px-3.5 py-1.5 text-[12px] uppercase font-semibold tracking-[0.04em] rounded-[var(--radius)] cursor-pointer transition-colors"
            style={{
              background: filter === "open" ? "var(--bg-surface)" : "transparent",
              color: filter === "open" ? "var(--text-primary)" : "var(--text-muted)",
              border: filter === "open" ? "1px solid var(--border-default)" : "1px solid transparent",
            }}
          >
            Open ({openPolls.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("ended")}
            className="px-3.5 py-1.5 text-[12px] uppercase font-semibold tracking-[0.04em] rounded-[var(--radius)] cursor-pointer transition-colors"
            style={{
              background: filter === "ended" ? "var(--bg-surface)" : "transparent",
              color: filter === "ended" ? "var(--text-primary)" : "var(--text-muted)",
              border: filter === "ended" ? "1px solid var(--border-default)" : "1px solid transparent",
            }}
          >
            Ended ({endedPolls.length})
          </button>
        </div>

        <Link href="/new">
          <Button size="sm">
            + New Poll
          </Button>
        </Link>
      </div>

      {/* Main Content Area */}
      {!isContractDeployed ? (
        <Panel surface className="p-8 text-center my-6">
          <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Contract Not Deployed
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            No contract deployment found on this network. Please switch to Bohr testnet or BOT Chain mainnet.
          </p>
        </Panel>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Spinner size={32} />
          <p className="text-[12px] uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>
            Loading polls…
          </p>
        </div>
      ) : displayedPolls.length === 0 ? (
        <Panel surface className="p-10 text-center my-6">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full flex items-center justify-center rotate-45"
               style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
            <span className="w-2.5 h-2.5" style={{ background: "var(--accent)" }} />
          </div>
          <p className="text-[15px] font-semibold mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            {filter === "open" ? "No open polls" : "No ended polls"}
          </p>
          <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
            {filter === "open"
              ? "All existing polls have closed or none have been submitted yet."
              : "No polls have concluded yet."}
          </p>
          {filter === "open" && (
            <Link href="/new">
              <Button size="sm">Create a poll</Button>
            </Link>
          )}
        </Panel>
      ) : (
        /* Stack of Tilting Mini-Scales */
        <div className="space-y-4">
          {displayedPolls.map((poll) => (
            <MiniScale
              key={poll.id.toString()}
              id={poll.id}
              question={poll.question}
              endsAt={poll.endsAt}
              options={poll.options}
              totals={poll.totals}
              nowSec={nowSec}
            />
          ))}
        </div>
      )}

      {/* Protocol Limitation Placard */}
      <WeightNotice />
    </PageShell>
  );
}
