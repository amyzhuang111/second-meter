import type { Call, CallName, Label, Outcome, RunRecord, Snippet } from "./types";

export const TASK_NAME = "Classify six research notes";

export const CANONICAL_BLURB = "Two retries landed, one note did not";

export const PLAYBACK_LEAD_MS = 400;

export const SNIPPETS: readonly Snippet[] = [
  {
    id: "n1",
    index: 1,
    source: "Local sample · notebook · 12 Mar",
    text: "Ship the receipt before the dashboard. A number someone can recompute will travel farther than a chart they have to trust.",
  },
  {
    id: "n2",
    index: 2,
    source: "Local sample · notebook · 12 Mar",
    text: "The model wrapped the label in a json fence. The validator wanted a bare object. Same rubric, second call, clean.",
  },
  {
    id: "n3",
    index: 3,
    source: "Local sample · notebook · 19 Mar",
    text: "Forty-one seconds of wall clock. Two cents of tokens. The retry was most of both.",
  },
  {
    id: "n4",
    index: 4,
    source: "Local sample · notebook · 19 Mar",
    text: "Top label was method at 0.41. The floor is 0.70. The rubric never made it into the tool result, so the first call was guessing.",
  },
  {
    id: "n5",
    index: 5,
    source: "Local sample · notebook · 2 Apr",
    text: "Margin note for the post: two rates and the gap between them. Cut the architecture diagram.",
  },
  {
    id: "n6",
    index: 6,
    source: "Local sample · loose card · no date",
    text: "Fragment only: the second one is the one that counts. No source. Could be cost, could be evals.",
  },
];

type Spec = {
  id: string;
  snippetId: string;
  kind: "tool" | "model";
  name: CallName;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  outcome: Outcome;
  isRetry?: boolean;
  terminal?: boolean;
  attempt?: number;
  label?: Label;
  confidence?: number;
  detail: string;
};

function toCall(spec: Spec): Call {
  return {
    startAt: 0,
    endAt: 0,
    tokensIn: spec.tokensIn ?? 0,
    tokensOut: spec.tokensOut ?? 0,
    isRetry: spec.isRetry ?? false,
    terminal: spec.terminal ?? false,
    attempt: spec.attempt ?? (spec.kind === "model" ? 1 : 0),
    id: spec.id,
    snippetId: spec.snippetId,
    kind: spec.kind,
    name: spec.name,
    latencyMs: spec.latencyMs,
    outcome: spec.outcome,
    label: spec.label,
    confidence: spec.confidence,
    detail: spec.detail,
  };
}

function withTiming(specs: Spec[], durations: number[], lead: number): Call[] {
  if (specs.length !== durations.length) {
    throw new Error("Playback durations do not match the canonical calls.");
  }
  let cursor = lead;
  return specs.map((spec, index) => {
    const startAt = cursor;
    const endAt = cursor + durations[index];
    cursor = endAt;
    return { ...toCall(spec), startAt, endAt };
  });
}

// Fixed draw. Note 02 and note 04 retry and land. Note 06 never gets a label.
const CANONICAL_SPECS: Spec[] = [
  {
    id: "n1-load",
    snippetId: "n1",
    kind: "tool",
    name: "load_snippet",
    latencyMs: 200,
    outcome: "loaded",
    detail: "Opened note 01 from the local set.",
  },
  {
    id: "n1-model",
    snippetId: "n1",
    kind: "model",
    name: "classify",
    latencyMs: 2100,
    tokensIn: 2840,
    tokensOut: 96,
    outcome: "accepted",
    terminal: true,
    attempt: 1,
    label: "workflow",
    confidence: 0.91,
    detail: "Accepted workflow at 0.91.",
  },
  {
    id: "n2-load",
    snippetId: "n2",
    kind: "tool",
    name: "load_snippet",
    latencyMs: 200,
    outcome: "loaded",
    detail: "Opened note 02 from the local set.",
  },
  {
    id: "n2-fail",
    snippetId: "n2",
    kind: "model",
    name: "classify",
    latencyMs: 2800,
    tokensIn: 3110,
    tokensOut: 210,
    outcome: "schema_invalid",
    attempt: 1,
    detail: "Fenced JSON. Validator wants a bare object.",
  },
  {
    id: "n2-validate",
    snippetId: "n2",
    kind: "tool",
    name: "validate_label",
    latencyMs: 400,
    outcome: "rejected",
    detail: "Rejected the fence. Queued a retry.",
  },
  {
    id: "n2-retry",
    snippetId: "n2",
    kind: "model",
    name: "classify",
    latencyMs: 2400,
    tokensIn: 4820,
    tokensOut: 88,
    outcome: "accepted",
    isRetry: true,
    terminal: true,
    attempt: 2,
    label: "retry",
    confidence: 0.88,
    detail: "Second call returned label retry at 0.88.",
  },
  {
    id: "n3-load",
    snippetId: "n3",
    kind: "tool",
    name: "load_snippet",
    latencyMs: 200,
    outcome: "loaded",
    detail: "Opened note 03 from the local set.",
  },
  {
    id: "n3-model",
    snippetId: "n3",
    kind: "model",
    name: "classify",
    latencyMs: 1800,
    tokensIn: 2960,
    tokensOut: 102,
    outcome: "accepted",
    terminal: true,
    attempt: 1,
    label: "cost",
    confidence: 0.86,
    detail: "Accepted cost at 0.86.",
  },
  {
    id: "n4-load",
    snippetId: "n4",
    kind: "tool",
    name: "load_snippet",
    latencyMs: 200,
    outcome: "loaded",
    detail: "Opened note 04 from the local set.",
  },
  {
    id: "n4-fail",
    snippetId: "n4",
    kind: "model",
    name: "classify",
    latencyMs: 2600,
    tokensIn: 3050,
    tokensOut: 140,
    outcome: "low_confidence",
    attempt: 1,
    confidence: 0.41,
    detail: "Top score 0.41 is under the 0.70 floor.",
  },
  {
    id: "n4-validate",
    snippetId: "n4",
    kind: "tool",
    name: "validate_label",
    latencyMs: 400,
    outcome: "rejected",
    detail: "Rejected the label. Queued a retry.",
  },
  {
    id: "n4-retry",
    snippetId: "n4",
    kind: "model",
    name: "classify",
    latencyMs: 2300,
    tokensIn: 4640,
    tokensOut: 110,
    outcome: "accepted",
    isRetry: true,
    terminal: true,
    attempt: 2,
    label: "quality",
    confidence: 0.79,
    detail: "Second call returned label quality at 0.79.",
  },
  {
    id: "n5-load",
    snippetId: "n5",
    kind: "tool",
    name: "load_snippet",
    latencyMs: 200,
    outcome: "loaded",
    detail: "Opened note 05 from the local set.",
  },
  {
    id: "n5-model",
    snippetId: "n5",
    kind: "model",
    name: "classify",
    latencyMs: 1600,
    tokensIn: 2780,
    tokensOut: 90,
    outcome: "accepted",
    terminal: true,
    attempt: 1,
    label: "aside",
    confidence: 0.9,
    detail: "Accepted aside at 0.90.",
  },
  {
    id: "n6-load",
    snippetId: "n6",
    kind: "tool",
    name: "load_snippet",
    latencyMs: 200,
    outcome: "loaded",
    detail: "Opened note 06 from the local set.",
  },
  {
    id: "n6-fail",
    snippetId: "n6",
    kind: "model",
    name: "classify",
    latencyMs: 2500,
    tokensIn: 2690,
    tokensOut: 160,
    outcome: "abstain",
    attempt: 1,
    detail: "Abstained. Fragment has no source.",
  },
  {
    id: "n6-validate",
    snippetId: "n6",
    kind: "tool",
    name: "validate_label",
    latencyMs: 400,
    outcome: "rejected",
    detail: "Abstain is not a label. One retry left.",
  },
  {
    id: "n6-retry",
    snippetId: "n6",
    kind: "model",
    name: "classify",
    latencyMs: 2100,
    tokensIn: 4510,
    tokensOut: 74,
    outcome: "abstain",
    isRetry: true,
    terminal: true,
    attempt: 2,
    detail: "Abstained again. Note left incomplete.",
  },
];

const CANONICAL_PLAYBACK_MS = [
  450, 1400, 400, 1600, 700, 1600, 350, 1100, 350, 1400, 650, 1500, 350, 1000,
  350, 1400, 650, 1500,
];

export const CANONICAL_CALLS: readonly Call[] = withTiming(
  CANONICAL_SPECS,
  CANONICAL_PLAYBACK_MS,
  PLAYBACK_LEAD_MS,
);

export const CANONICAL_END_MS = CANONICAL_CALLS[CANONICAL_CALLS.length - 1].endAt;

export const CANONICAL_FILE_MS = CANONICAL_END_MS + 450;

function sampleRun(
  id: string,
  code: string,
  startedAt: string,
  blurb: string,
  specs: Spec[],
): RunRecord {
  return {
    id,
    code,
    startedAt,
    status: "complete",
    sample: true,
    blurb,
    calls: specs.map(toCall),
  };
}

const sampleLight: Spec[] = [
  specTool("r14-n1-load", "n1", "load_snippet", 180, "loaded", "Opened note 01."),
  specModel("r14-n1", "n1", 1900, 2500, 80, "accepted", {
    terminal: true,
    label: "workflow",
    confidence: 0.93,
    detail: "Accepted workflow at 0.93.",
  }),
  specTool("r14-n2-load", "n2", "load_snippet", 180, "loaded", "Opened note 02."),
  specModel("r14-n2a", "n2", 2600, 2600, 180, "schema_invalid", {
    detail: "Fenced JSON on the first call.",
  }),
  specTool("r14-n2-validate", "n2", "validate_label", 360, "rejected", "Rejected the fence."),
  specModel("r14-n2b", "n2", 2000, 3900, 70, "accepted", {
    isRetry: true,
    terminal: true,
    attempt: 2,
    label: "retry",
    confidence: 0.9,
    detail: "Retry accepted label retry.",
  }),
  specTool("r14-n3-load", "n3", "load_snippet", 160, "loaded", "Opened note 03."),
  specModel("r14-n3", "n3", 1700, 2400, 90, "accepted", {
    terminal: true,
    label: "cost",
    confidence: 0.88,
    detail: "Accepted cost at 0.88.",
  }),
  specTool("r14-n4-load", "n4", "load_snippet", 160, "loaded", "Opened note 04."),
  specModel("r14-n4", "n4", 1800, 2550, 100, "accepted", {
    terminal: true,
    label: "quality",
    confidence: 0.84,
    detail: "Accepted quality at 0.84.",
  }),
  specTool("r14-n5-load", "n5", "load_snippet", 150, "loaded", "Opened note 05."),
  specModel("r14-n5", "n5", 1600, 2300, 80, "accepted", {
    terminal: true,
    label: "aside",
    confidence: 0.91,
    detail: "Accepted aside at 0.91.",
  }),
  specTool("r14-n6-load", "n6", "load_snippet", 170, "loaded", "Opened note 06."),
  specModel("r14-n6", "n6", 2100, 2700, 110, "accepted", {
    terminal: true,
    label: "aside",
    confidence: 0.72,
    detail: "Accepted aside at 0.72.",
  }),
];

const sampleHarsh: Spec[] = [
  specTool("r15-n1-load", "n1", "load_snippet", 180, "loaded", "Opened note 01."),
  specModel("r15-n1", "n1", 2000, 2700, 90, "accepted", {
    terminal: true,
    label: "workflow",
    confidence: 0.89,
    detail: "Accepted workflow at 0.89.",
  }),
  specTool("r15-n2-load", "n2", "load_snippet", 180, "loaded", "Opened note 02."),
  specModel("r15-n2a", "n2", 2700, 2800, 200, "schema_invalid", {
    detail: "Fenced JSON on the first call.",
  }),
  specTool("r15-n2-validate", "n2", "validate_label", 380, "rejected", "Rejected the fence."),
  specModel("r15-n2b", "n2", 2200, 4100, 80, "accepted", {
    isRetry: true,
    terminal: true,
    attempt: 2,
    label: "retry",
    confidence: 0.86,
    detail: "Retry accepted label retry.",
  }),
  specTool("r15-n3-load", "n3", "load_snippet", 160, "loaded", "Opened note 03."),
  specModel("r15-n3", "n3", 1800, 2600, 95, "accepted", {
    terminal: true,
    label: "cost",
    confidence: 0.87,
    detail: "Accepted cost at 0.87.",
  }),
  specTool("r15-n4-load", "n4", "load_snippet", 160, "loaded", "Opened note 04."),
  specModel("r15-n4a", "n4", 2400, 2900, 150, "low_confidence", {
    confidence: 0.38,
    detail: "Top score 0.38 is under the floor.",
  }),
  specTool("r15-n4-validate", "n4", "validate_label", 400, "rejected", "Rejected the label."),
  specModel("r15-n4b", "n4", 2100, 4300, 60, "abstain", {
    isRetry: true,
    terminal: true,
    attempt: 2,
    detail: "Second call abstained. Note left incomplete.",
  }),
  specTool("r15-n5-load", "n5", "load_snippet", 150, "loaded", "Opened note 05."),
  specModel("r15-n5", "n5", 1700, 2400, 85, "accepted", {
    terminal: true,
    label: "aside",
    confidence: 0.92,
    detail: "Accepted aside at 0.92.",
  }),
  specTool("r15-n6-load", "n6", "load_snippet", 170, "loaded", "Opened note 06."),
  specModel("r15-n6a", "n6", 2300, 2500, 170, "abstain", {
    detail: "Abstained. Fragment has no source.",
  }),
  specTool("r15-n6-validate", "n6", "validate_label", 360, "rejected", "Abstain is not a label."),
  specModel("r15-n6b", "n6", 2000, 4200, 50, "abstain", {
    isRetry: true,
    terminal: true,
    attempt: 2,
    detail: "Abstained again. Note left incomplete.",
  }),
];

export const SAMPLE_RUNS: readonly RunRecord[] = [
  sampleRun(
    "sample-r15",
    "R-15",
    "2026-04-09T18:22:00.000Z",
    "Two notes left incomplete",
    sampleHarsh,
  ),
  sampleRun(
    "sample-r14",
    "R-14",
    "2026-04-02T15:10:00.000Z",
    "One retry, all six notes labeled",
    sampleLight,
  ),
];

export const FIRST_RUN_NUMBER = 16;

export function noteNumber(snippetId: string): string {
  const snippet = SNIPPETS.find((item) => item.id === snippetId);
  return String(snippet?.index ?? 0).padStart(2, "0");
}

export function snippetPhase(
  snippetId: string,
  revealed: readonly Call[],
  active: Call | null,
): "queued" | "running" | "retrying" | "done" | "incomplete" {
  if (active?.snippetId === snippetId) {
    const priorMiss = revealed.some(
      (call) =>
        call.snippetId === snippetId &&
        call.kind === "model" &&
        call.outcome !== "accepted",
    );
    return priorMiss ? "retrying" : "running";
  }
  const mine = revealed.filter((call) => call.snippetId === snippetId);
  if (mine.length === 0) return "queued";
  if (mine.some((call) => call.kind === "model" && call.outcome === "accepted")) {
    return "done";
  }
  if (mine.some((call) => call.terminal)) return "incomplete";
  if (mine.some((call) => call.kind === "model" && call.outcome !== "accepted")) {
    return "retrying";
  }
  return "running";
}

export function acceptedLabel(calls: readonly Call[], snippetId: string): string | null {
  const accepted = calls.find(
    (call) =>
      call.snippetId === snippetId &&
      call.kind === "model" &&
      call.outcome === "accepted" &&
      call.label,
  );
  return accepted?.label ?? null;
}

function specTool(
  id: string,
  snippetId: string,
  name: CallName,
  latencyMs: number,
  outcome: Outcome,
  detail: string,
): Spec {
  return { id, snippetId, kind: "tool", name, latencyMs, outcome, detail };
}

function specModel(
  id: string,
  snippetId: string,
  latencyMs: number,
  tokensIn: number,
  tokensOut: number,
  outcome: Outcome,
  extra: Partial<Spec> & { detail: string },
): Spec {
  return {
    id,
    snippetId,
    kind: "model",
    name: "classify",
    latencyMs,
    tokensIn,
    tokensOut,
    outcome,
    attempt: extra.attempt ?? 1,
    ...extra,
  };
}
