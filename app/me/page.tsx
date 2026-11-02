"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import ReleaseButton from "@/components/tilt/ReleaseButton";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import Spinner from "@/components/ui/Spinner";
import ConnectButton from "@/components/ui/ConnectButton";
import { useLean } from "@/lib/useLean";
import { useAccount } from "wagmi";
import {
  formatBot,
  formatHeldTime,
  formatRemainingTime,
  type PollData,
  type UserStake,
} from "@/lib/lean";

const TABS = [
  { href: "/", label: "Polls" },
  { href: "/new", label: "Create" },
  { href: "/me", label: "My Stakes & Till" },
];

interface UserStakeItem {
  poll: PollData;
  stake: UserStake;
}

export default function MyStakesPage() {
  const { isConnected, address: userAddress } = useAccount();
  const {
    getPollCount,
    getPoll,
    getStake,
    getPending,
    release,
    withdraw,
    isBusy,
    error,
    clearError,
  } = useLean();

  const [stakeItems, setStakeItems] = useState<UserStakeItem[]>([]);
  const [pendingBalance, setPendingBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(true);
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    if (!isConnected || !userAddress) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [count, pending] = await Promise.all([
        getPollCount(),
        getPending(userAddress),
      ]);
      setPendingBalance(pending);

      const items: UserStakeItem[] = [];
      for (let i = 1n; i <= count; i++) {
        const st = await getStake(i, userAddress);
        if (st && st.amount > 0n) {
          const p = await getPoll(i);
          if (p) {
            items.push({ poll: p, stake: st });
          }
        }
      }
      setStakeItems(items);
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, [isConnected, userAddress, getPollCount, getPending, getStake, getPoll]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRelease = async (pollId: bigint, options?: string[]) => {
    clearError();
    try {
      await release(pollId, options);
      await refresh();
    } catch {
      // Handled
    }
  };

  const handleWithdraw = async () => {
    clearError();
    try {
      await withdraw();
      await refresh();
    } catch {
      // Handled
    }
  };

  return (
    <PageShell tabs={TABS}>
      <div className="py-2">
        <div className="mb-6">
          <h1
            className="text-[22px] md:text-[28px] font-bold leading-tight mb-1"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            My Stakes & Till
          </h1>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Review all polls where your BOT is currently locked and withdraw released returns from your till.
          </p>
        </div>

        {!isConnected ? (
          <Panel surface className="p-8 text-center my-6">
            <p className="text-[14px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              Connect Your Wallet
            </p>
            <p className="text-[13px] mb-4 max-w-[400px] mx-auto" style={{ color: "var(--text-secondary)" }}>
              Connect to inspect your active stakes across all polls and withdraw available proceeds.
            </p>
            <div className="max-w-[180px] mx-auto">
              <ConnectButton />
            </div>
          </Panel>
        ) : (
          <div className="space-y-6">
            {/* Withdrawal Till Banner */}
            <Panel surface className="p-5 md:p-6 border border-[var(--border-subtle)]">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] uppercase font-bold tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>
                    Pull-Payment Till
                  </span>
                  <div
                    className="text-[24px] md:text-[28px] font-bold mt-1"
                    style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}
                  >
                    {formatBot(pendingBalance)}
                  </div>
                  <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                    All released stakes are credited to your personal on-chain till.
                  </p>
                </div>

                <div>
                  <Button
                    size="md"
                    onClick={handleWithdraw}
                    disabled={isBusy || pendingBalance === 0n}
                    loading={isBusy}
                  >
                    Withdraw BOT
                  </Button>
                </div>
              </div>
            </Panel>

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-[var(--radius)] text-[13px] leading-relaxed"
                style={{ background: "#FDE8E8", border: "1px solid var(--danger)", color: "var(--danger)" }}
              >
                {error}
              </div>
            )}

            {/* Active Stakes List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[14px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--text-primary)" }}>
                  Active Stakes ({stakeItems.length})
                </h2>
                <button
                  type="button"
                  onClick={refresh}
                  className="text-[12px] underline cursor-pointer"
                  style={{ color: "var(--accent)" }}
                >
                  Refresh
                </button>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Spinner size={24} />
                  <p className="text-[12px] uppercase tracking-[0.06em]" style={{ color: "var(--text-muted)" }}>
                    Scanning your stakes…
                  </p>
                </div>
              ) : stakeItems.length === 0 ? (
                <Panel surface className="p-8 text-center">
                  <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                    No Active Stakes
                  </p>
                  <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
                    You have not locked BOT behind any options yet.
                  </p>
                  <Link href="/">
                    <Button size="sm">Explore Polls</Button>
                  </Link>
                </Panel>
              ) : (
                <div className="space-y-3">
                  {stakeItems.map(({ poll, stake }) => {
                    const isEnded = BigInt(nowSec) >= poll.endsAt;
                    return (
                      <div
                        key={poll.id.toString()}
                        className="p-4 md:p-5 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-default)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <Link
                            href={`/poll/${poll.id.toString()}`}
                            className="text-[11px] font-bold uppercase hover:underline"
                            style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}
                          >
                            Poll #{poll.id.toString()}
                          </Link>
                          <span
                            className="px-2 py-0.5 rounded-sm text-[11px] font-semibold uppercase tracking-[0.04em]"
                            style={{
                              background: isEnded ? "var(--bg-overlay)" : "var(--bg-elevated)",
                              border: `1px solid ${isEnded ? "var(--border-subtle)" : "var(--border-strong)"}`,
                              color: isEnded ? "var(--text-muted)" : "var(--success)",
                            }}
                          >
                            {isEnded ? "Ended" : formatRemainingTime(poll.endsAt, nowSec)}
                          </span>
                        </div>

                        <Link
                          href={`/poll/${poll.id.toString()}`}
                          className="block text-[15px] font-semibold hover:text-[var(--accent)] transition-colors mb-3"
                          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
                        >
                          {poll.question}
                        </Link>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          <div className="text-[13px]">
                            <span style={{ color: "var(--text-muted)" }}>Locked behind </span>
                            <strong style={{ color: "var(--text-primary)" }}>
                              &quot;{poll.options[stake.option]}&quot;
                            </strong>
                            <span className="mx-2" style={{ color: "var(--text-muted)" }}>·</span>
                            <strong style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
                              {formatBot(stake.amount)}
                            </strong>
                            <span className="mx-2" style={{ color: "var(--text-muted)" }}>·</span>
                            <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                              {formatHeldTime(stake.since, nowSec)}
                            </span>
                          </div>

                          <div>
                            <ReleaseButton
                              onRelease={() => handleRelease(poll.id, poll.options)}
                              loading={isBusy}
                              disabled={isBusy}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
