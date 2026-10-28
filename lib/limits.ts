/**
 * Protocol limits matching Lean.sol
 */
export const MIN_QUESTION = 1;
export const MAX_QUESTION = 120;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MIN_OPTION_LABEL = 1;
export const MAX_OPTION_LABEL = 32;
export const MIN_DURATION = 3600; // 1 hour
export const MAX_DURATION = 7776000; // 90 days (90 * 86400)
export const MAX_BATCH = 50;

export const DURATION_PRESETS = [
  { label: "1 Hour", secs: 3600 },
  { label: "24 Hours", secs: 86400 },
  { label: "3 Days", secs: 259200 },
  { label: "7 Days", secs: 604800 },
  { label: "30 Days", secs: 2592000 },
  { label: "90 Days", secs: 7776000 },
] as const;

export function byteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

export function validateQuestion(question: string): string | null {
  const len = byteLength(question.trim());
  if (len < MIN_QUESTION) return "Question is required.";
  if (len > MAX_QUESTION) return `Question exceeds maximum ${MAX_QUESTION} bytes.`;
  return null;
}

export function validateOption(opt: string): string | null {
  const len = byteLength(opt.trim());
  if (len < MIN_OPTION_LABEL) return "Option label cannot be empty.";
  if (len > MAX_OPTION_LABEL) return `Option label exceeds ${MAX_OPTION_LABEL} bytes.`;
  return null;
}

export function validateOptions(options: string[]): string | null {
  if (options.length < MIN_OPTIONS) return `Must provide at least ${MIN_OPTIONS} options.`;
  if (options.length > MAX_OPTIONS) return `Cannot exceed ${MAX_OPTIONS} options.`;
  for (let i = 0; i < options.length; i++) {
    const err = validateOption(options[i]);
    if (err) return `Option ${i + 1}: ${err}`;
  }
  return null;
}

export function validateDuration(durationSecs: number): string | null {
  if (durationSecs < MIN_DURATION) return `Duration must be at least 1 hour (${MIN_DURATION}s).`;
  if (durationSecs > MAX_DURATION) return `Duration cannot exceed 90 days (${MAX_DURATION}s).`;
  return null;
}
