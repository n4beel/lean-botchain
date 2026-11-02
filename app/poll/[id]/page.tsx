"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import TiltScale from "@/components/tilt/TiltScale";
import ReleaseButton from "@/components/tilt/ReleaseButton";
import WeightNotice from "@/components/tilt/WeightNotice";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import Spinner from "@/components/ui/Spinner";
import ConnectButton from "@/components/ui/ConnectButton";
import { useLean } from "@/lib/useLean";
import { useAccount } from "wagmi";
import { formatRemainingTime, formatBot, formatBotDays, type PollData, type UserStake } from "@/lib/lean";

const TABS = [
  { href: "/", label: "Polls" },
  { href: "/new", label: "Create" },
  { href: "/me", label: "My Stakes & Till" },
];

export default function PollDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pollIdStr = Array.isArray(params.id) ? params.id[0] : params.id;
  const pollId = pollIdStr ? BigInt(pollIdStr) : 0n;

  const { isConnected, address: userAddress } = useAccount();
  const {
    getPoll,
    getStake,
    getHoldersCount,
    lean,
    release,
    isBusy,
    error,
    clearError,
  } = useLean();

  const [poll, setPoll] = useState<PollData | null>(null);
  const [stake, setStake] = useState<UserStake | null>(null);
  const [holders, setHolders] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);

  // Lean Form State
  const [selectedOption, setSelectedOption] = useState<number>(0);
  const [amountStr, setAmountStr] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch poll data & user stake
  const refresh = useCallback(async () => {
    if (pollId <= 0n) return;
    try {
      const p = await getPoll(pollId);
      setPoll(p);
      if (p) {
        const [st, h] = await Promise.all([
          getStake(pollId),
          getHoldersCount(pollId),
        ]);
        setStake(st);
        setHolders(h);
        if (st && st.amount > 0n) {
          setSelectedOption(st.option);
        }
      }
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, [pollId, getPoll, getStake, getHoldersCount]);

  useEffect(() => {
    refresh();
  }, [refresh, userAddress]);

  const isEnded = poll ? BigInt(nowSec) >= poll.endsAt : false;

  const handleLeanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError(null);

    if (!poll) return;
    if (isEnded) {
      setValidationError("This poll has ended.");
      return;
    }

    const trimmed = amountStr.trim();
    const parsed = parseFloat(trimmed);
    if (!trimmed || isNaN(parsed) || parsed <= 0) {
      setValidationError("Please enter a valid positive BOT amount.");
      return;
    }

    // Check if user already has stake on another option
    if (stake && stake.amount > 0n && stake.option !== selectedOption) {
      const currName = poll.options[stake.option] || `option #${stake.option + 1}`;
      setValidationError(`You've locked BOT behind "${currName}". Release first to switch options.`);
      return;
    }

    try {
      await lean(pollId, selectedOption, trimmed, poll.options);
      setAmountStr("");
      await refresh();
    } catch {
      // Error handled by useLean
    }
  };

  const handleRelease = async () => {
    clearError();
    try {
      await release(pollId, poll?.options);
      await refresh();
    } catch {
      // Handled
    }
  };

  if (loading) {
    return (
      <PageShell tabs={TABS}>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Spinner size={32} />
          <p className="text-[12px] uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>
            Loading poll details…
          </p>
        </div>
      </PageShell>
    );
  }

  if (!poll) {
    return (
      <PageShell tabs={TABS}>
        <Panel surface className="p-10 text-center my-6">
          <h2 className="text-[16px] font-bold mb-2" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>
            Poll Not Found
          </h2>
          <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
            Poll #{pollId.toString()} does not exist on this network.
          </p>
          <Link href="/">
            <Button size="sm">Back to all polls</Button>
          </Link>
        </Panel>
      </PageShell>
    );
  }

  return (
    <PageShell tabs={TABS}>
      <div className="py-2">
        {/* Breadcrumb / Top Bar */}
        <div className="flex items-center justify-between gap-3 mb-3 text-[11px] uppercase tracking-[0.06em]">
          <Link href="/" className="hover:underline flex items-center gap-1 font-semibold" style={{ color: "var(--text-muted)" }}>
            ← All Polls
          </Link>
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              Poll #{poll.id.toString()}
            </span>
            <span
              className="px-2 py-0.5 rounded-sm font-semibold"
              style={{
                background: isEnded ? "var(--bg-overlay)" : "var(--bg-elevated)",
                border: `1px solid ${isEnded ? "var(--border-subtle)" : "var(--border-strong)"}`,
                color: isEnded ? "var(--text-muted)" : "var(--success)",
              }}
            >
              {isEnded ? "Ended" : formatRemainingTime(poll.endsAt, nowSec)}
            </span>
          </div>
        </div>

        {/* Question Title */}
        <h1
          className="text-[22px] md:text-[30px] font-bold leading-tight mb-2 tracking-[-0.01em]"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          {poll.question}
        </h1>

        {/* Tilting Scale (Real-Time Conviction Growth) */}
        <Panel surface className="p-5 md:p-6 my-6 border border-[var(--border-subtle)]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <span className="text-[12px] uppercase font-bold tracking-[0.06em]" style={{ color: "var(--text-primary)" }}>
              Conviction Tally (Real-Time Scale)
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {isEnded ? "Frozen at conclusion" : "Updates every 250 ms"}
            </span>
          </div>

          <TiltScale
            id={poll.id}
            endsAt={poll.endsAt}
            options={poll.options}
            totals={poll.totals}
            userStake={stake}
            holdersMap={holders}
            selectable={!isEnded}
            selectedOption={selectedOption}
            onSelectOption={(idx) => setSelectedOption(idx)}
          />

          {isEnded && (
            <div
              className="mt-4 p-3.5 rounded-[var(--radius)] text-[13px] leading-relaxed"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
            >
              <strong style={{ color: "var(--text-primary)" }}>Result: </strong>
              {poll.leader.tied ? (
                <span>This poll ended in a tie.</span>
              ) : (
                <span>
                  Option #{poll.leader.bestOption + 1} (
                  <strong>&quot;{poll.options[poll.leader.bestOption]}&quot;</strong>) concluded with the leading conviction.
                </span>
              )}
            </div>
          )}
        </Panel>

        {/* User Stake Status (if active) */}
        {stake && stake.amount > 0n && (
          <Panel surface className="p-5 my-6 border border-[var(--accent)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase font-bold tracking-[0.06em] mb-1" style={{ color: "var(--accent)" }}>
                  Your Active Stake
                </p>
                <p className="text-[14px]" style={{ color: "var(--text-primary)" }}>
                  You have locked <strong>{formatBot(stake.amount)}</strong> behind Option #{stake.option + 1} (
                  <strong>&quot;{poll.options[stake.option]}&quot;</strong>).
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {isEnded
                    ? "Poll ended — your stake is frozen in the final tally. Releasing returns your BOT to your till."
                    : "Your weight continues growing every second while your stake remains parked."}
                </p>
              </div>

              <div className="shrink-0">
                <ReleaseButton
                  onRelease={handleRelease}
                  loading={isBusy}
                  disabled={isBusy}
                />
              </div>
            </div>
          </Panel>
        )}

        {/* Lean Form (Only when Poll is Open) */}
        {!isEnded && (
          <Panel surface className="p-5 md:p-6 my-6">
            <h2
              className="text-[16px] font-bold mb-1"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              {stake && stake.amount > 0n ? "Top Up Your Stake" : "Lean Behind an Option"}
            </h2>
            <p className="text-[13px] mb-5" style={{ color: "var(--text-secondary)" }}>
              {stake && stake.amount > 0n
                ? `Adding more BOT to Option #${stake.option + 1} will average your held time.`
                : "Select an option and enter the BOT amount you wish to lock behind it."}
            </p>

            {!isConnected ? (
              <div className="text-center py-6">
                <p className="text-[13px] mb-3" style={{ color: "var(--text-muted)" }}>
                  Connect your wallet to lock BOT behind an option.
                </p>
                <div className="max-w-[180px] mx-auto">
                  <ConnectButton />
                </div>
              </div>
            ) : (
              <form onSubmit={handleLeanSubmit} className="space-y-4">
                {/* Option selector pills */}
                <div>
                  <label className="block text-[12px] uppercase font-bold tracking-[0.06em] mb-2" style={{ color: "var(--text-primary)" }}>
                    Choose Option
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {poll.options.map((optLabel, idx) => {
                      const isChosen = selectedOption === idx;
                      const isLockedToDifferent = stake && stake.amount > 0n && stake.option !== idx;

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedOption(idx)}
                          className="flex items-center gap-2 p-3 rounded-[var(--radius)] text-left cursor-pointer transition-colors"
                          style={{
                            background: isChosen ? "var(--accent)" : "var(--bg-elevated)",
                            color: isChosen ? "var(--accent-ink)" : "var(--text-primary)",
                            border: isChosen ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                            opacity: isLockedToDifferent ? 0.6 : 1,
                          }}
                        >
                          <span
                            className="flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0"
                            style={{
                              background: isChosen ? "rgba(255,255,255,0.25)" : "var(--bg-overlay)",
                              color: isChosen ? "var(--accent-ink)" : "var(--text-primary)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span className="text-[13px] font-semibold truncate flex-1">
                            {optLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Amount input */}
                <div>
                  <label htmlFor="stake-amount" className="block text-[12px] uppercase font-bold tracking-[0.06em] mb-1" style={{ color: "var(--text-primary)" }}>
                    Lock Amount (BOT)
                  </label>
                  <div className="relative">
                    <input
                      id="stake-amount"
                      type="number"
                      step="any"
                      min="0"
                      value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value)}
                      placeholder="0.0"
                      required
                      className="w-full px-3.5 py-2.5 rounded-[var(--radius)] text-[14px] focus:outline-none"
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                    <span
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-bold"
                      style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                    >
                      BOT
                    </span>
                  </div>
                </div>

                {/* Validation and contract errors */}
                {(validationError || error) && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-[var(--radius)] text-[13px] leading-relaxed"
                    style={{ background: "#FDE8E8", border: "1px solid var(--danger)", color: "var(--danger)" }}
                  >
                    {validationError || error}
                  </div>
                )}

                {/* Submit button */}
                <div className="pt-2 flex justify-end">
                  <Button type="submit" size="md" loading={isBusy} disabled={isBusy}>
                    {isBusy
                      ? "Locking BOT…"
                      : `Lean behind "${poll.options[selectedOption]}"`}
                  </Button>
                </div>
              </form>
            )}
          </Panel>
        )}

        {/* Limitations Notice */}
        <WeightNotice />
      </div>
    </PageShell>
  );
}
