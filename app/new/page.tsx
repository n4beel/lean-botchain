"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageShell from "@/components/layout/PageShell";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { useLean } from "@/lib/useLean";
import { useAccount } from "wagmi";
import ConnectButton from "@/components/ui/ConnectButton";
import {
  MIN_QUESTION,
  MAX_QUESTION,
  MIN_OPTIONS,
  MAX_OPTIONS,
  MIN_OPTION_LABEL,
  MAX_OPTION_LABEL,
  MIN_DURATION,
  MAX_DURATION,
} from "@/lib/limits";

const TABS = [
  { href: "/", label: "Polls" },
  { href: "/new", label: "Create" },
  { href: "/me", label: "My Stakes & Till" },
];

const DURATION_PRESETS = [
  { label: "1 hour", seconds: 3600n },
  { label: "1 day", seconds: 86400n },
  { label: "7 days", seconds: 604800n },
  { label: "30 days", seconds: 2592000n },
];

export default function NewPollPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { createPoll, isBusy, error, clearError } = useLean();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [durationSecs, setDurationSecs] = useState<bigint>(86400n); // 1 day default
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleAddOption = () => {
    if (options.length < MAX_OPTIONS) {
      setOptions([...options, ""]);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > MIN_OPTIONS) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const updated = [...options];
    updated[index] = val;
    setOptions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError(null);

    const q = question.trim();
    if (q.length < MIN_QUESTION || q.length > MAX_QUESTION) {
      setValidationError(`Question must be between ${MIN_QUESTION} and ${MAX_QUESTION} characters.`);
      return;
    }

    const trimmedOptions = options.map((o) => o.trim());
    for (let i = 0; i < trimmedOptions.length; i++) {
      const opt = trimmedOptions[i];
      if (opt.length < MIN_OPTION_LABEL || opt.length > MAX_OPTION_LABEL) {
        setValidationError(`Option #${i + 1} must be between ${MIN_OPTION_LABEL} and ${MAX_OPTION_LABEL} characters.`);
        return;
      }
    }

    if (durationSecs < BigInt(MIN_DURATION) || durationSecs > BigInt(MAX_DURATION)) {
      setValidationError("Duration must be between 1 hour and 90 days.");
      return;
    }

    try {
      const newId = await createPoll(q, trimmedOptions, durationSecs);
      if (newId) {
        router.push(`/poll/${newId.toString()}`);
      } else {
        router.push("/");
      }
    } catch {
      // error is handled and displayed
    }
  };

  return (
    <PageShell tabs={TABS}>
      <div className="max-w-[640px] mx-auto py-2">
        <div className="mb-6">
          <h1
            className="text-[22px] md:text-[28px] font-bold leading-tight mb-1"
            style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
          >
            Create a Lean Poll
          </h1>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Ask a question and specify 2 to 6 options. Stakers park BOT behind their choice; time-weighted conviction determines the outcome.
          </p>
        </div>

        {!isConnected ? (
          <Panel surface className="p-8 text-center my-6">
            <p className="text-[14px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              Connect Wallet to Create
            </p>
            <p className="text-[13px] mb-4 max-w-[420px] mx-auto" style={{ color: "var(--text-secondary)" }}>
              Publishing a poll registers it permanently on-chain. Connect your wallet to deploy the poll.
            </p>
            <div className="max-w-[200px] mx-auto">
              <ConnectButton />
            </div>
          </Panel>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Question */}
            <Panel surface className="p-5 space-y-2">
              <label
                htmlFor="poll-question"
                className="block text-[12px] uppercase font-bold tracking-[0.06em]"
                style={{ color: "var(--text-primary)" }}
              >
                Question
              </label>
              <textarea
                id="poll-question"
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={MAX_QUESTION}
                placeholder="e.g. Which L2 architecture should BOT Chain support first?"
                required
                className="w-full p-3 rounded-[var(--radius)] text-[14px] resize-none focus:outline-none"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-sans)",
                }}
              />
              <div className="flex justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
                <span>1 to 120 characters</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  {question.length} / {MAX_QUESTION}
                </span>
              </div>
            </Panel>

            {/* Options */}
            <Panel surface className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-[12px] uppercase font-bold tracking-[0.06em]" style={{ color: "var(--text-primary)" }}>
                  Options (2 to 6)
                </label>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {options.length} / {MAX_OPTIONS}
                </span>
              </div>

              <div className="space-y-2.5">
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span
                      className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0"
                      style={{
                        background: "var(--bg-overlay)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      maxLength={MAX_OPTION_LABEL}
                      placeholder={`Option ${idx + 1}`}
                      required
                      className="flex-1 px-3 py-2 rounded-[var(--radius)] text-[13px] focus:outline-none"
                      style={{
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-sans)",
                      }}
                    />
                    {options.length > MIN_OPTIONS && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="px-2 py-1 text-[11px] underline cursor-pointer shrink-0"
                        style={{ color: "var(--danger)" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {options.length < MAX_OPTIONS && (
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="mt-2 text-[12px] font-semibold underline cursor-pointer"
                  style={{ color: "var(--accent)" }}
                >
                  + Add another option
                </button>
              )}
            </Panel>

            {/* Duration */}
            <Panel surface className="p-5 space-y-3">
              <label className="block text-[12px] uppercase font-bold tracking-[0.06em]" style={{ color: "var(--text-primary)" }}>
                Duration
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.seconds.toString()}
                    type="button"
                    onClick={() => setDurationSecs(preset.seconds)}
                    className="py-2 px-3 text-[12px] font-semibold rounded-[var(--radius)] cursor-pointer transition-colors"
                    style={{
                      background: durationSecs === preset.seconds ? "var(--accent)" : "var(--bg-elevated)",
                      color: durationSecs === preset.seconds ? "var(--accent-ink)" : "var(--text-primary)",
                      border: durationSecs === preset.seconds ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </Panel>

            {/* Errors */}
            {(validationError || error) && (
              <div
                role="alert"
                className="p-3.5 rounded-[var(--radius)] text-[13px] leading-relaxed"
                style={{ background: "#FDE8E8", border: "1px solid var(--danger)", color: "var(--danger)" }}
              >
                {validationError || error}
              </div>
            )}

            {/* Submit */}
            <div className="pt-2 flex justify-end">
              <Button type="submit" size="md" loading={isBusy} disabled={isBusy}>
                {isBusy ? "Publishing Poll…" : "Publish Poll"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </PageShell>
  );
}
