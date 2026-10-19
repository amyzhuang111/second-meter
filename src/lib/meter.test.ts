import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDollars, formatMicro, formatShare, formatWall, ratioSentence } from "./format";
import { parseLedger, serializeLedger } from "./ledger";
import { summarize } from "./metrics";
import { modelCostMicro } from "./pricing";
import {
  CANONICAL_CALLS,
  CANONICAL_END_MS,
  CANONICAL_FILE_MS,
  SAMPLE_RUNS,
  SNIPPETS,
} from "./script";
import type { Call } from "./types";

describe("canonical draw", () => {
  const summary = summarize([{ id: "canonical", calls: CANONICAL_CALLS }]);

  it("bills 9 model calls, 5 completions, 3 retries, and 1 incomplete", () => {
    assert.equal(summary.modelCalls, 9);
    assert.equal(summary.toolCalls, 9);
    assert.equal(summary.completions, 5);
    assert.equal(summary.retryCalls, 3);
    assert.equal(summary.incomplete, 1);
    assert.equal(summary.tokensIn, 31_400);
    assert.equal(summary.tokensOut, 1_070);
    assert.equal(summary.wallMs, 22_600);
    assert.equal(summary.spendMicro, 110_250);
    assert.equal(summary.retrySpendMicro, 45_990);
  });

  it("keeps misses in the bill and out of the completion denominator", () => {
    assert.equal(formatDollars(summary.costPerAttempt), "$0.012250");
    assert.equal(formatDollars(summary.costPerCompletion), "$0.022050");
    assert.equal(formatShare(summary.retryShare), "41.7%");
    assert.equal(ratioSentence(summary, "run"), "A completion costs 1.80 times an attempt on this run.");
    assert.equal(formatWall(summary.wallMs), "22.6s");
  });

  it("plays back in about 17 seconds and files just after the last call", () => {
    assert.equal(CANONICAL_END_MS, 17_150);
    assert.equal(CANONICAL_FILE_MS, 17_600);
    assert.ok(CANONICAL_FILE_MS > CANONICAL_END_MS);
  });

  it("accepts five labels and leaves note 06 incomplete", () => {
    const accepted = CANONICAL_CALLS.filter((call) => call.outcome === "accepted").map(
      (call) => call.label,
    );
    assert.deepEqual(accepted, ["workflow", "retry", "cost", "quality", "aside"]);
    const noteSix = CANONICAL_CALLS.filter((call) => call.snippetId === "n6");
    assert.equal(
      noteSix.some((call) => call.outcome === "accepted"),
      false,
    );
    assert.equal(noteSix.some((call) => call.terminal), true);
    assert.deepEqual(
      SNIPPETS.map((snippet) => snippet.id),
      ["n1", "n2", "n3", "n4", "n5", "n6"],
    );
  });
});

describe("partial runs", () => {
  it("treats the first success as one attempt and one completion", () => {
    const first = CANONICAL_CALLS.find((call) => call.id === "n1-model");
    assert.ok(first);
    const calls = CANONICAL_CALLS.filter((call) => call.endAt <= first.endAt);
    const summary = summarize([{ id: "partial", calls }]);
    assert.equal(summary.modelCalls, 1);
    assert.equal(summary.completions, 1);
    assert.equal(summary.incomplete, 0);
    assert.equal(summary.costPerAttempt, summary.costPerCompletion);
  });

  it("holds a failed attempt out of the denominator until a label lands", () => {
    const fail = CANONICAL_CALLS.find((call) => call.id === "n2-fail");
    assert.ok(fail);
    const calls = CANONICAL_CALLS.filter((call) => call.endAt <= fail.endAt);
    const summary = summarize([{ id: "partial", calls }]);
    assert.equal(summary.modelCalls, 2);
    assert.equal(summary.completions, 1);
    assert.equal(summary.incomplete, 0);
    assert.ok(summary.costPerCompletion! > summary.costPerAttempt!);
  });

  it("counts one completion when the retry then succeeds", () => {
    const retry = CANONICAL_CALLS.find((call) => call.id === "n2-retry");
    assert.ok(retry);
    const calls = CANONICAL_CALLS.filter((call) => call.endAt <= retry.endAt);
    const summary = summarize([{ id: "partial", calls }]);
    assert.equal(summary.completions, 2);
    assert.equal(summary.modelCalls, 3);
    assert.equal(summary.retryCalls, 1);
    assert.equal(summary.incomplete, 0);
  });
});

describe("ledger totals", () => {
  it("prices the two sample draws and the combined ledger", () => {
    const [harsh, light] = SAMPLE_RUNS;
    const harshSummary = summarize([harsh]);
    const lightSummary = summarize([light]);
    assert.equal(lightSummary.modelCalls, 7);
    assert.equal(lightSummary.completions, 6);
    assert.equal(lightSummary.retryCalls, 1);
    assert.equal(lightSummary.incomplete, 0);
    assert.equal(lightSummary.spendMicro, 67_500);
    assert.equal(harshSummary.modelCalls, 9);
    assert.equal(harshSummary.completions, 4);
    assert.equal(harshSummary.retryCalls, 3);
    assert.equal(harshSummary.incomplete, 2);
    assert.equal(harshSummary.spendMicro, 100_200);

    const ledger = summarize(SAMPLE_RUNS);
    assert.equal(ledger.modelCalls, 16);
    assert.equal(ledger.completions, 10);
    assert.equal(ledger.spendMicro, 167_700);
    assert.equal(formatDollars(ledger.costPerAttempt), "$0.010481");
    assert.equal(formatDollars(ledger.costPerCompletion), "$0.016770");
    assert.equal(formatShare(ledger.retryShare), "31.8%");
    assert.equal(
      ratioSentence(ledger, "ledger"),
      "A completion costs 1.60 times an attempt on this ledger.",
    );
  });

  it("counts the same snippet in two runs as two tasks", () => {
    const call = (id: string): Call => ({
      id,
      snippetId: "n1",
      kind: "model",
      name: "classify",
      startAt: 0,
      endAt: 0,
      latencyMs: 10,
      tokensIn: 100,
      tokensOut: 10,
      isRetry: false,
      terminal: true,
      outcome: "accepted",
      attempt: 1,
      label: "cost",
      detail: "Accepted.",
    });
    const summary = summarize([
      { id: "a", calls: [call("a")] },
      { id: "b", calls: [call("b")] },
    ]);
    assert.equal(summary.completions, 2);
  });

  it("has no completion rate when every attempt misses", () => {
    const summary = summarize([
      {
        id: "miss",
        calls: [
          {
            id: "only",
            snippetId: "n6",
            kind: "model",
            name: "classify",
            startAt: 0,
            endAt: 0,
            latencyMs: 100,
            tokensIn: 1000,
            tokensOut: 20,
            isRetry: false,
            terminal: true,
            outcome: "abstain",
            attempt: 1,
            detail: "Abstained.",
          },
        ],
      },
    ]);
    assert.equal(summary.completions, 0);
    assert.equal(summary.incomplete, 1);
    assert.equal(summary.costPerCompletion, null);
    assert.equal(summary.spendMicro, modelCostMicro(1000, 20));
    assert.equal(formatDollars(summary.costPerCompletion), "—");
    assert.match(ratioSentence(summary, "run"), /denominator/);
  });

  it("ignores tool tokens and tool prices", () => {
    const summary = summarize([
      {
        id: "tools",
        calls: [
          {
            id: "tool",
            snippetId: "n1",
            kind: "tool",
            name: "load_snippet",
            startAt: 0,
            endAt: 0,
            latencyMs: 50,
            tokensIn: 9_999,
            tokensOut: 9_999,
            isRetry: false,
            terminal: false,
            outcome: "loaded",
            attempt: 0,
            detail: "Opened.",
          },
        ],
      },
    ]);
    assert.equal(summary.spendMicro, 0);
    assert.equal(summary.tokensIn, 0);
    assert.equal(summary.modelCalls, 0);
    assert.equal(summary.toolCalls, 1);
    assert.equal(summary.costPerAttempt, null);
    assert.equal(summary.retryShare, null);
  });
});

describe("formatting", () => {
  it("rounds half-up micro-dollars to six places", () => {
    assert.equal(formatMicro(8437.5), "$0.008438");
    assert.equal(formatMicro(0), "$0.000000");
    assert.equal(formatMicro(null), "—");
  });
});

describe("ledger file", () => {
  it("rejects malformed json and accepts a round trip", () => {
    assert.equal(parseLedger("{"), null);
    assert.equal(parseLedger("{}"), null);
    const file = { runs: [...SAMPLE_RUNS], nextNumber: 16 };
    const parsed = parseLedger(serializeLedger(file));
    assert.ok(parsed);
    assert.equal(parsed.runs.length, 2);
    assert.equal(parsed.nextNumber, 16);
    assert.equal(parsed.runs[0].status, "complete");
  });

  it("bumps the next number past the highest saved code", () => {
    const raw = serializeLedger({ runs: [...SAMPLE_RUNS], nextNumber: 10 });
    const parsed = parseLedger(raw);
    assert.ok(parsed);
    assert.equal(parsed.nextNumber, 16);
  });
});
