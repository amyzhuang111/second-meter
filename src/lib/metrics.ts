import { callCostMicro } from "./pricing";
import type { Call } from "./types";

export type Summary = {
  modelCalls: number;
  toolCalls: number;
  completions: number;
  retryCalls: number;
  incomplete: number;
  tokensIn: number;
  tokensOut: number;
  /** All priced spend. Tools contribute 0 on this price card. */
  spendMicro: number;
  retrySpendMicro: number;
  wallMs: number;
  /** Dollars. Null when there are no model calls. */
  costPerAttempt: number | null;
  /** Dollars. Null when no snippet has an accepted label. */
  costPerCompletion: number | null;
  /** Retry model spend / model spend. Null when model spend is 0. */
  retryShare: number | null;
};

const EMPTY: Summary = {
  modelCalls: 0,
  toolCalls: 0,
  completions: 0,
  retryCalls: 0,
  incomplete: 0,
  tokensIn: 0,
  tokensOut: 0,
  spendMicro: 0,
  retrySpendMicro: 0,
  wallMs: 0,
  costPerAttempt: null,
  costPerCompletion: null,
  retryShare: null,
};

/**
 * Cost per completion divides the whole bill by snippets that received an
 * accepted label. A miss stays in the bill and out of that denominator.
 * An attempt is one model call. Tool calls are listed and unpriced.
 * The same snippet in two runs counts as two tasks.
 */
export function summarize(
  runs: ReadonlyArray<{ id: string; calls: readonly Call[] }>,
): Summary {
  if (runs.length === 0) return EMPTY;

  const completed = new Set<string>();
  const incomplete = new Set<string>();
  let modelCalls = 0;
  let toolCalls = 0;
  let retryCalls = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let spendMicro = 0;
  let modelSpendMicro = 0;
  let retrySpendMicro = 0;
  let wallMs = 0;

  for (const run of runs) {
    const bySnippet = new Map<string, Call[]>();
    for (const call of run.calls) {
      wallMs += call.latencyMs;
      const cost = callCostMicro(call);
      spendMicro += cost;
      if (call.kind === "model") {
        modelCalls += 1;
        tokensIn += call.tokensIn;
        tokensOut += call.tokensOut;
        modelSpendMicro += cost;
        if (call.isRetry) {
          retryCalls += 1;
          retrySpendMicro += cost;
        }
      } else {
        toolCalls += 1;
      }
      const list = bySnippet.get(call.snippetId) ?? [];
      list.push(call);
      bySnippet.set(call.snippetId, list);
    }

    for (const [snippetId, calls] of bySnippet) {
      const key = `${run.id}:${snippetId}`;
      const accepted = calls.some(
        (call) => call.kind === "model" && call.outcome === "accepted",
      );
      const settled = calls.some((call) => call.terminal);
      if (accepted) completed.add(key);
      else if (settled) incomplete.add(key);
    }
  }

  const completions = completed.size;
  const dollars = spendMicro / 1_000_000;

  return {
    modelCalls,
    toolCalls,
    completions,
    retryCalls,
    incomplete: incomplete.size,
    tokensIn,
    tokensOut,
    spendMicro,
    retrySpendMicro,
    wallMs,
    costPerAttempt: modelCalls === 0 ? null : dollars / modelCalls,
    costPerCompletion: completions === 0 ? null : dollars / completions,
    retryShare: modelSpendMicro === 0 ? null : retrySpendMicro / modelSpendMicro,
  };
}
