import { LABELS, type Call, type CallKind, type CallName, type Outcome, type RunRecord } from "./types";

export const LEDGER_KEY = "second-meter-ledger-v1";

const OUTCOMES = new Set<Outcome>([
  "accepted",
  "schema_invalid",
  "low_confidence",
  "abstain",
  "loaded",
  "rejected",
]);

const NAMES = new Set<CallName>(["load_snippet", "classify", "validate_label"]);

export type LedgerFile = {
  runs: RunRecord[];
  nextNumber: number;
};

export function serializeLedger(file: LedgerFile): string {
  return JSON.stringify({ version: 1, ...file });
}

export function parseLedger(raw: string): LedgerFile | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as { runs?: unknown; nextNumber?: unknown };
  if (!Array.isArray(record.runs)) return null;
  if (typeof record.nextNumber !== "number" || !Number.isInteger(record.nextNumber)) {
    return null;
  }
  if (record.nextNumber < 1 || record.nextNumber > 100_000) return null;

  const runs: RunRecord[] = [];
  const seen = new Set<string>();
  for (const item of record.runs) {
    const run = parseRun(item);
    if (!run) return null;
    if (seen.has(run.id)) return null;
    seen.add(run.id);
    runs.push(run);
  }

  const maxCode = runs.reduce((max, run) => {
    const number = Number(run.code.replace(/^R-/, ""));
    return Number.isFinite(number) ? Math.max(max, number) : max;
  }, 0);

  return {
    runs,
    nextNumber: Math.max(record.nextNumber, maxCode + 1),
  };
}

function parseRun(value: unknown): RunRecord | null {
  if (!value || typeof value !== "object") return null;
  const run = value as Partial<RunRecord>;
  if (typeof run.id !== "string" || run.id.length === 0) return null;
  if (typeof run.code !== "string" || run.code.length === 0) return null;
  if (typeof run.startedAt !== "string") return null;
  if (typeof run.sample !== "boolean") return null;
  if (typeof run.blurb !== "string") return null;
  if (!Array.isArray(run.calls)) return null;
  const calls: Call[] = [];
  for (const item of run.calls) {
    const call = parseCall(item);
    if (!call) return null;
    calls.push(call);
  }
  return {
    id: run.id,
    code: run.code,
    startedAt: run.startedAt,
    status: "complete",
    sample: run.sample,
    blurb: run.blurb,
    calls,
  };
}

function parseCall(value: unknown): Call | null {
  if (!value || typeof value !== "object") return null;
  const call = value as Partial<Call>;
  if (typeof call.id !== "string") return null;
  if (typeof call.snippetId !== "string") return null;
  if (call.kind !== "tool" && call.kind !== "model") return null;
  if (typeof call.name !== "string" || !NAMES.has(call.name as CallName)) return null;
  if (typeof call.startAt !== "number" || typeof call.endAt !== "number") return null;
  if (typeof call.latencyMs !== "number") return null;
  if (typeof call.tokensIn !== "number" || typeof call.tokensOut !== "number") return null;
  if (typeof call.isRetry !== "boolean" || typeof call.terminal !== "boolean") return null;
  if (typeof call.outcome !== "string" || !OUTCOMES.has(call.outcome as Outcome)) return null;
  if (typeof call.attempt !== "number" || typeof call.detail !== "string") return null;
  if (call.label !== undefined && !LABELS.includes(call.label)) return null;
  if (call.confidence !== undefined && typeof call.confidence !== "number") return null;
  return {
    id: call.id,
    snippetId: call.snippetId,
    kind: call.kind as CallKind,
    name: call.name as CallName,
    startAt: call.startAt,
    endAt: call.endAt,
    latencyMs: call.latencyMs,
    tokensIn: call.tokensIn,
    tokensOut: call.tokensOut,
    isRetry: call.isRetry,
    terminal: call.terminal,
    outcome: call.outcome as Outcome,
    attempt: call.attempt,
    label: call.label,
    confidence: call.confidence,
    detail: call.detail,
  };
}
