"use client";

import { useEffect, useRef } from "react";
import { formatDollars, formatShare, formatTokens, formatWall, formatWhen, ratioSentence } from "@/lib/format";
import { summarize } from "@/lib/metrics";
import { callCostMicro, PRICE_CARD } from "@/lib/pricing";
import { noteNumber, TASK_NAME } from "@/lib/script";
import type { Call, RunRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Receipt({
  run,
  follow,
}: {
  run: RunRecord | null;
  follow: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const previousId = useRef<string | null>(null);
  const summary = summarize(run ? [run] : []);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    if (follow) {
      node.scrollTop = node.scrollHeight;
      previousId.current = run?.id ?? null;
      return;
    }
    if ((run?.id ?? null) !== previousId.current) {
      node.scrollTop = 0;
    }
    previousId.current = run?.id ?? null;
  }, [follow, run?.id, run?.calls.length]);

  const stamp = stampFor(run);

  return (
    <article
      data-testid="receipt"
      className="receipt-paper flex h-full min-h-[36rem] flex-col lg:min-h-0"
      aria-label="Simulated run receipt"
    >
      <div className="receipt-perf shrink-0" />
      <header className="relative shrink-0 px-4 pt-3 pb-3 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-heading text-[1.65rem] leading-none text-[#241c16]">
              The Second Meter
            </p>
            <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-[#6e675c] uppercase">
              Simulated run receipt
            </p>
          </div>
          {stamp ? (
            <p
              data-testid={stamp.testId}
              className={cn("stamp px-2 py-1 text-[11px] font-semibold", stamp.className)}
            >
              {stamp.label}
            </p>
          ) : (
            <p className="font-mono text-[10px] tracking-[0.16em] text-[#6e675c] uppercase">
              Armed
            </p>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 font-mono text-[12px] leading-5">
          <dt className="text-[#6e675c]">Run</dt>
          <dd>{run ? `${run.code} · ${formatWhen(run.startedAt)} UTC` : "Waiting"}</dd>
          <dt className="text-[#6e675c]">Task</dt>
          <dd>{TASK_NAME}</dd>
          <dt className="text-[#6e675c]">Model</dt>
          <dd>{PRICE_CARD.model}</dd>
          <dt className="text-[#6e675c]">Price card</dt>
          <dd>
            ${PRICE_CARD.inputPerMillionUsd.toFixed(2)} / 1M in · $
            {PRICE_CARD.outputPerMillionUsd.toFixed(2)} / 1M out
          </dd>
        </dl>
        <p className="mt-2 text-[11px] leading-4 text-[#6e675c]">
          Simulated price card, not a vendor rate. Tool calls are listed and priced at $0.
          {run?.blurb ? ` ${run.blurb}.` : ""}
        </p>
        <hr className="receipt-rule mt-3" />
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-auto px-4 sm:px-5">
        {run == null || run.calls.length === 0 ? (
          <p className="py-6 font-mono text-[13px] leading-6 text-[#6e675c]">
            No calls yet. Run classification and the lines will print here, including
            the ones that miss.
          </p>
        ) : (
          <ol className="flex flex-col pb-2">
            {run.calls.map((call, index) => (
              <li key={call.id}>
                <ReceiptLine
                  call={call}
                  animate={follow && index === run.calls.length - 1}
                />
              </li>
            ))}
          </ol>
        )}
      </div>

      <footer className="shrink-0 border-t border-dashed border-[#241c16]/30 px-4 py-3 sm:px-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[12px] text-[#3c342c] sm:grid-cols-4">
          <FooterStat label="Sim. tokens in" value={formatTokens(summary.tokensIn)} />
          <FooterStat label="Sim. tokens out" value={formatTokens(summary.tokensOut)} />
          <FooterStat label="Sim. wall" value={formatWall(summary.wallMs)} />
          <FooterStat
            label="Sim. spend"
            value={formatMicroSpend(summary.spendMicro, summary.modelCalls)}
            testId="receipt-spend"
          />
        </div>
        <p className="mt-2 font-mono text-[11px] text-[#6e675c]">
          {summary.modelCalls} model {summary.modelCalls === 1 ? "call" : "calls"} ·{" "}
          {summary.toolCalls} tool {summary.toolCalls === 1 ? "call" : "calls"} ·{" "}
          {summary.retryCalls} {summary.retryCalls === 1 ? "retry" : "retries"}
        </p>
        <hr className="receipt-rule my-3" />
        <div className="grid grid-cols-3 gap-2">
          <Rate
            testId="receipt-cost-per-attempt"
            label="Cost / attempt"
            value={formatDollars(summary.costPerAttempt)}
          />
          <Rate
            testId="receipt-cost-per-completion"
            label="Cost / completion"
            value={formatDollars(summary.costPerCompletion)}
            emphasis
          />
          <Rate
            testId="receipt-retry-share"
            label="Retry share"
            value={formatShare(summary.retryShare)}
          />
        </div>
        <p className="mt-2 text-[12px] leading-5 text-[#3c342c]" data-testid="receipt-ratio">
          {ratioSentence(summary, "run")}{" "}
          {summary.modelCalls > 0
            ? `${summary.completions} accepted ${summary.completions === 1 ? "label" : "labels"} in the denominator${
                summary.incomplete > 0
                  ? `. ${summary.incomplete} incomplete ${summary.incomplete === 1 ? "note" : "notes"} excluded.`
                  : "."
              }`
            : ""}
        </p>
      </footer>
      <div className="receipt-perf shrink-0" />
    </article>
  );
}

function ReceiptLine({ call, animate }: { call: Call; animate: boolean }) {
  const missed = call.kind === "model" && call.outcome !== "accepted";
  return (
    <div
      className={cn(
        "grid grid-cols-[1.6rem_3.1rem_minmax(0,1fr)_auto] gap-x-2 border-l-2 border-transparent py-1.5 font-mono text-[12.5px] leading-5",
        animate && "line-in",
        call.isRetry && "border-[#e36a32] pl-2",
        missed && !call.isRetry && "border-[#9d2c2c] pl-2",
      )}
    >
      <span className="text-[#6e675c]">{noteNumber(call.snippetId)}</span>
      <span className="text-[#6e675c]">{call.kind}</span>
      <span className="min-w-0">
        <span className="text-[#241c16]">
          {call.isRetry ? <span className="text-[#b4531a]">RETRY </span> : null}
          {call.name}
          {call.kind === "model" ? ` · attempt ${call.attempt}` : ""}
        </span>
        <span className="mt-0.5 block text-[#6e675c]">
          <span className={resultClass(call)}>{resultText(call)}</span>
          {" · "}
          {call.detail}
        </span>
      </span>
      <span className="text-right text-[#241c16] tabular-nums">
        <span className="block text-[#6e675c]">{tokenText(call)}</span>
        <span className="block">{costText(call)}</span>
      </span>
    </div>
  );
}

function FooterStat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <p>
      <span className="block text-[10px] tracking-wide text-[#6e675c] uppercase">{label}</span>
      <span className="tabular-nums" data-testid={testId}>
        {value}
      </span>
    </p>
  );
}

function Rate({
  label,
  value,
  testId,
  emphasis = false,
}: {
  label: string;
  value: string;
  testId: string;
  emphasis?: boolean;
}) {
  return (
    <p>
      <span className="block font-mono text-[10px] tracking-wide text-[#6e675c] uppercase">
        {label}
      </span>
      <span
        data-testid={testId}
        className={cn(
          "font-mono text-lg tabular-nums sm:text-2xl",
          emphasis ? "text-[#1f6b45]" : "text-[#241c16]",
        )}
      >
        {value}
      </span>
    </p>
  );
}

function stampFor(run: RunRecord | null): { label: string; className: string; testId: string } | null {
  if (!run) return null;
  if (run.status === "running") {
    return { label: "Printing", className: "stamp-printing", testId: "printing-stamp" };
  }
  if (run.sample) {
    return { label: "Sample", className: "stamp-sample", testId: "sample-stamp" };
  }
  return { label: "Filed", className: "stamp-filed", testId: "filed-stamp" };
}

function resultText(call: Call): string {
  if (call.outcome === "accepted") {
    const score = call.confidence == null ? "" : ` ${call.confidence.toFixed(2)}`;
    return `${call.label ?? "accepted"}${score}`;
  }
  if (call.outcome === "low_confidence" && call.confidence != null) {
    return `low confidence ${call.confidence.toFixed(2)}`;
  }
  if (call.outcome === "schema_invalid") return "schema invalid";
  return call.outcome.replaceAll("_", " ");
}

function resultClass(call: Call): string {
  if (call.outcome === "accepted") return "text-[#1f6b45]";
  if (call.kind === "model") return "text-[#9d2c2c]";
  return "text-[#6e675c]";
}

function tokenText(call: Call): string {
  if (call.kind === "tool") return "unpriced";
  return `${formatTokens(call.tokensIn)} in / ${formatTokens(call.tokensOut)} out`;
}

function costText(call: Call): string {
  if (call.kind === "tool") return "—";
  return formatDollars(callCostMicro(call) / 1_000_000);
}

function formatMicroSpend(spendMicro: number, modelCalls: number): string {
  if (modelCalls === 0 && spendMicro === 0) return "—";
  return formatDollars(spendMicro / 1_000_000);
}
