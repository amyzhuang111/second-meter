import type { Summary } from "./metrics";

export function formatMicro(micro: number | null | undefined): string {
  if (micro == null || Number.isNaN(micro)) return "—";
  const rounded = Math.round(micro);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const whole = Math.floor(abs / 1_000_000);
  const frac = String(abs % 1_000_000).padStart(6, "0");
  return `${sign}$${whole}.${frac}`;
}

export function formatDollars(dollars: number | null | undefined): string {
  if (dollars == null || Number.isNaN(dollars)) return "—";
  return formatMicro(dollars * 1_000_000);
}

export function formatShare(share: number | null | undefined): string {
  if (share == null || Number.isNaN(share)) return "—";
  return `${(share * 100).toFixed(1)}%`;
}

export function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatWall(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function formatMultiple(summary: Summary): string | null {
  if (
    summary.costPerAttempt == null ||
    summary.costPerCompletion == null ||
    summary.costPerAttempt === 0
  ) {
    return null;
  }
  const times = summary.costPerCompletion / summary.costPerAttempt;
  return `${times.toFixed(2)} times`;
}

export function ratioSentence(summary: Summary, scope: "ledger" | "run"): string {
  const where = scope === "ledger" ? "on this ledger" : "on this run";
  if (summary.modelCalls === 0) {
    return scope === "ledger"
      ? "Accepted labels will be the denominator."
      : "Waiting for an accepted label.";
  }
  if (summary.completions === 0) {
    return "Spend is on the bill. Waiting for an accepted label to form the denominator.";
  }
  const multiple = formatMultiple(summary);
  return `A completion costs ${multiple} an attempt ${where}.`;
}
