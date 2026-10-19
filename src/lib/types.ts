export const LABELS = ["cost", "retry", "quality", "workflow", "aside"] as const;

export type Label = (typeof LABELS)[number];

export type CallKind = "tool" | "model";

export type CallName = "load_snippet" | "classify" | "validate_label";

export type Outcome =
  | "accepted"
  | "schema_invalid"
  | "low_confidence"
  | "abstain"
  | "loaded"
  | "rejected";

export type Call = {
  id: string;
  snippetId: string;
  kind: CallKind;
  name: CallName;
  /** Playback start, ms from run start. Sample rows use 0. */
  startAt: number;
  /** Playback end, ms from run start. The line prints at this mark. */
  endAt: number;
  /** Simulated latency added to wall time. Independent of playback. */
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  isRetry: boolean;
  /** Last call for this snippet in the draw. */
  terminal: boolean;
  outcome: Outcome;
  /** 0 for tools. 1 or 2 for model calls. */
  attempt: number;
  label?: Label;
  confidence?: number;
  detail: string;
};

export type RunRecord = {
  id: string;
  code: string;
  startedAt: string;
  status: "running" | "complete";
  sample: boolean;
  blurb: string;
  calls: Call[];
};

export type Snippet = {
  id: string;
  index: number;
  source: string;
  text: string;
};
