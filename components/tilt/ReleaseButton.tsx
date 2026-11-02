"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";

interface ReleaseButtonProps {
  onRelease: () => Promise<void> | void;
  loading?: boolean;
  disabled?: boolean;
}

export default function ReleaseButton({
  onRelease,
  loading = false,
  disabled = false,
}: ReleaseButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div
        className="p-3.5 rounded-[var(--radius)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <div className="text-[12px] leading-snug">
          <p className="font-semibold" style={{ color: "var(--danger)" }}>
            Your weight will leave the tally.
          </p>
          <p style={{ color: "var(--text-muted)" }}>
            Your locked BOT will return to your pull-payment till.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="danger"
            onClick={async () => {
              await onRelease();
              setConfirming(false);
            }}
            loading={loading}
            disabled={disabled}
          >
            Confirm Release
          </Button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="text-[12px] px-2.5 py-1 underline cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            Keep stake
          </button>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="release"
      size="sm"
      onClick={() => setConfirming(true)}
      disabled={disabled}
      loading={loading}
    >
      Release stake
    </Button>
  );
}
