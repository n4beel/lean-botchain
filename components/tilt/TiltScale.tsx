"use client";

import { useEffect, useState, useMemo } from "react";
import OptionBar from "./OptionBar";
import {
  convictionAt,
  share,
  leader,
  type OptionTotals,
  type UserStake,
} from "@/lib/lean";

interface TiltScaleProps {
  id: bigint;
  endsAt: bigint;
  options: string[];
  totals: OptionTotals[];
  userStake?: UserStake | null;
  holdersMap?: Record<number, number>;
  selectable?: boolean;
  selectedOption?: number;
  onSelectOption?: (index: number) => void;
}

export default function TiltScale({
  endsAt,
  options,
  totals,
  userStake,
  holdersMap = {},
  selectable = false,
  selectedOption,
  onSelectOption,
}: TiltScaleProps) {
  // Live clock updating every 250 ms while poll is open
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));
  const isEnded = BigInt(nowSec) >= endsAt;

  useEffect(() => {
    if (isEnded) return;
    const interval = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 250);
    return () => clearInterval(interval);
  }, [isEnded]);

  // Compute live conviction scores for each option
  const convictions = useMemo(() => {
    return totals.map((tot) => convictionAt(tot, BigInt(nowSec), endsAt));
  }, [totals, nowSec, endsAt]);

  const shares = useMemo(() => share(convictions), [convictions]);
  const { bestOption, tied } = useMemo(() => leader(convictions), [convictions]);

  // Tilt direction:
  // If tied or zero conviction -> "none"
  // If option 0 is leader -> "left" (-2deg)
  // If option 1..N is leader -> "right" (+2deg)
  const tiltDirection = useMemo(() => {
    if (tied) return "none";
    return bestOption === 0 ? "left" : "right";
  }, [tied, bestOption]);

  return (
    <div className="relative my-4">
      {/* Tilting Group Container */}
      <div
        className="tilt-group flex flex-col gap-3 py-2"
        data-tilt={tiltDirection}
      >
        {options.map((optLabel, idx) => {
          const optTotals = totals[idx] ?? { amountSum: 0n, weightedSince: 0n };
          const optConviction = convictions[idx] ?? 0n;
          const optShare = shares[idx] ?? 0;
          const isBest = bestOption === idx;
          const holders = holdersMap[idx] ?? "—";

          return (
            <OptionBar
              key={idx}
              index={idx}
              label={optLabel}
              share={optShare}
              conviction={optConviction}
              amountSum={optTotals.amountSum}
              holders={holders}
              isLeader={isBest}
              isTied={tied}
              userStake={userStake}
              nowSec={nowSec}
              selectable={selectable}
              selected={selectedOption === idx}
              onSelect={onSelectOption}
            />
          );
        })}
      </div>
    </div>
  );
}
