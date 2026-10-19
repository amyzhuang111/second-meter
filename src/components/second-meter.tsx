"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LogDesk } from "@/components/log-desk";
import { NoteBoard } from "@/components/note-board";
import { Receipt } from "@/components/receipt";
import { RunHistory } from "@/components/run-history";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { readImport, saveSampleData, serverImport, subscribeImport } from "@/lib/log-store";
import { formatDollars, formatShare, ratioSentence } from "@/lib/format";
import { readLedger, resetLedger, serverLedger, subscribeLedger, writeLedger } from "@/lib/ledger-store";
import { summarize } from "@/lib/metrics";
import { PRICE_CARD } from "@/lib/pricing";
import {
  CANONICAL_BLURB,
  CANONICAL_CALLS,
  CANONICAL_END_MS,
  CANONICAL_FILE_MS,
  noteNumber,
} from "@/lib/script";
import type { Call, RunRecord } from "@/lib/types";

type LiveMeta = {
  id: string;
  code: string;
  startedAt: string;
  blurb: string;
};

export function SecondMeter() {
  const imported = useSyncExternalStore(subscribeImport, readImport, serverImport);
  if (imported.sampleData) return <SampleDraw onHide={() => saveSampleData(false)} />;
  return <LogDesk />;
}

function SampleDraw({ onHide }: { onHide: () => void }) {
  const stored = useSyncExternalStore(subscribeLedger, readLedger, serverLedger);
  const [live, setLive] = useState<LiveMeta | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [storageNote, setStorageNote] = useState<string | null>(null);

  const liveRef = useRef<LiveMeta | null>(null);
  const generation = useRef(0);
  const filedRef = useRef(false);

  useEffect(() => {
    if (!playing) return;
    const generationAtStart = generation.current;
    const marks = [
      ...new Set(CANONICAL_CALLS.flatMap((call) => [call.startAt, call.endAt])),
    ];
    const timers = marks.map((mark) =>
      window.setTimeout(() => {
        if (generation.current !== generationAtStart) return;
        setElapsed(mark);
      }, mark),
    );
    timers.push(
      window.setTimeout(() => {
        if (generation.current !== generationAtStart || filedRef.current) return;
        const meta = liveRef.current;
        if (!meta) return;
        filedRef.current = true;
        const record: RunRecord = {
          ...meta,
          status: "complete",
          sample: false,
          calls: [...CANONICAL_CALLS],
        };
        const current = readLedger();
        const runs = [record, ...current.runs.filter((run) => run.id !== record.id)];
        remember({ runs, nextNumber: current.nextNumber }, setStorageNote);
        setLive(null);
        liveRef.current = null;
        setPlaying(false);
        setSelectedId(record.id);
      }, CANONICAL_FILE_MS),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [playing]);

  const revealed = useMemo(() => {
    if (!live) return [];
    return CANONICAL_CALLS.filter((call) => call.endAt <= elapsed);
  }, [live, elapsed]);

  const active = useMemo(() => {
    if (!playing) return null;
    return (
      CANONICAL_CALLS.find((call) => call.startAt <= elapsed && elapsed < call.endAt) ??
      null
    );
  }, [playing, elapsed]);

  const liveRun: RunRecord | null = live
    ? {
        ...live,
        status: "running",
        sample: false,
        calls: revealed,
      }
    : null;

  const displayRuns = liveRun ? [liveRun, ...stored.runs] : stored.runs;
  const selected = displayRuns.find((run) => run.id === selectedId) ?? null;
  const ledger = summarize(displayRuns);
  const boardCalls = selected?.calls ?? [];

  function runClassification() {
    if (playing) return;
    const current = readLedger();
    const number = current.nextNumber;
    const meta: LiveMeta = {
      id: `run-${number}`,
      code: `R-${number}`,
      startedAt: new Date().toISOString(),
      blurb: CANONICAL_BLURB,
    };
    remember({ runs: current.runs, nextNumber: number + 1 }, setStorageNote);
    liveRef.current = meta;
    filedRef.current = false;
    generation.current += 1;
    setLive(meta);
    setSelectedId(meta.id);
    setElapsed(0);
    setPlaying(true);
  }

  function clearLedger() {
    generation.current += 1;
    filedRef.current = true;
    liveRef.current = null;
    setPlaying(false);
    setLive(null);
    setElapsed(0);
    setSelectedId(null);
    remember({ runs: [], nextNumber: readLedger().nextNumber }, setStorageNote);
  }

  function restoreSamples() {
    generation.current += 1;
    filedRef.current = true;
    liveRef.current = null;
    setPlaying(false);
    setLive(null);
    setElapsed(0);
    setSelectedId(null);
    try {
      resetLedger();
      setStorageNote(null);
    } catch {
      setStorageNote("This browser blocked local storage. The ledger lasts for this tab only.");
    }
  }

  function selectRun(id: string) {
    if (playing) return;
    setSelectedId((current) => (current === id ? null : id));
  }

  const now = statusLine({ playing, elapsed, active, revealed, selected });

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-3 py-3 sm:px-5 lg:min-h-0 lg:py-4">
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-[#8a5a12] bg-[#8a5a12]/15 px-3 py-2">
        <p data-testid="sample-data-banner" className="text-sm">
          Sample data is on. This is the scripted classification draw. These numbers are not an imported log.
        </p>
        <Button variant="outline" data-testid="hide-sample" onClick={onHide}>
          Back to import
        </Button>
      </div>
      <header className="shrink-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] text-primary uppercase">
              For Amy Zhuang · build in public
            </p>
            <h1 className="font-heading text-4xl leading-none tracking-tight sm:text-5xl">
              The Second Meter
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
              Cost per completed classification. Every miss stays on the bill.
            </p>
          </div>
          <p className="font-mono text-[11px] leading-5 text-muted-foreground sm:text-right">
            Simulated price card
            <br />${PRICE_CARD.inputPerMillionUsd.toFixed(2)}/1M in · $
            {PRICE_CARD.outputPerMillionUsd.toFixed(2)}/1M out
            <br />
            {PRICE_CARD.model} · local notes only
          </p>
        </div>
      </header>

      {storageNote || stored.note ? (
        <p role="status" className="mt-3 shrink-0 rounded-lg border border-retry/50 px-3 py-2 text-sm">
          {storageNote ?? stored.note}
        </p>
      ) : null}

      <section className="mt-4 shrink-0" aria-labelledby="ledger-heading">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ledger-heading" className="font-heading text-lg leading-none">
            Simulated ledger
          </h2>
          <p className="text-sm text-foreground/90" data-testid="ledger-ratio">
            {ratioSentence(ledger, "ledger")}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Meter
            testId="ledger-cost-per-attempt"
            label="Cost / attempt"
            value={formatDollars(ledger.costPerAttempt)}
            detail={
              ledger.modelCalls === 0
                ? "Waiting for a model call"
                : `${ledger.modelCalls} model ${ledger.modelCalls === 1 ? "call" : "calls"}`
            }
          />
          <Meter
            testId="ledger-cost-per-completion"
            label="Cost / completion"
            value={formatDollars(ledger.costPerCompletion)}
            detail={
              ledger.completions === 0
                ? "Waiting for an accepted label"
                : `${ledger.completions} accepted ${ledger.completions === 1 ? "label" : "labels"}`
            }
            emphasis
          />
          <Meter
            testId="ledger-retry-share"
            label="Retry share of spend"
            value={formatShare(ledger.retryShare)}
            detail={
              ledger.retryCalls === 0
                ? "No second attempts yet"
                : `${ledger.retryCalls} second ${ledger.retryCalls === 1 ? "attempt" : "attempts"}`
            }
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          An attempt is one model call. A completion is a note with an accepted label.
          Incomplete notes stay in the spend and out of the denominator. Retry share is
          second-attempt spend divided by model spend. Tokens, wall time, and dollars
          are simulated.
        </p>
      </section>

      <p
        data-testid="now-bar"
        className="mt-3 flex min-h-12 shrink-0 items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm leading-snug"
      >
        <span
          className={`size-2 shrink-0 rounded-full ${playing ? "animate-pulse bg-primary" : "bg-muted-foreground"}`}
          aria-hidden
        />
        <span>{now}</span>
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement(revealed, playing)}
      </p>

      <div className="mt-3 grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:overflow-hidden">
        <NoteBoard
          calls={boardCalls}
          active={selected && playing ? active : null}
          playing={playing}
          onRun={runClassification}
          onRestore={restoreSamples}
          onClear={clearLedger}
        />
        <Receipt run={selected} follow={playing && selected?.id === live?.id} />
      </div>

      <Separator className="mt-3 shrink-0" />
      <div className="mt-3 shrink-0 lg:max-h-52 lg:overflow-auto">
        <RunHistory
          runs={displayRuns}
          selectedId={selectedId}
          disabled={playing}
          onSelect={selectRun}
        />
      </div>
    </div>
  );
}

function Meter({
  label,
  value,
  detail,
  testId,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail: string;
  testId: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10">
      <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        data-testid={testId}
        className={`mt-1 font-mono text-3xl tabular-nums ${emphasis ? "phosphor" : ""}`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function statusLine({
  playing,
  elapsed,
  active,
  revealed,
  selected,
}: {
  playing: boolean;
  elapsed: number;
  active: Call | null;
  revealed: readonly Call[];
  selected: RunRecord | null;
}): string {
  if (playing) {
    const progress = `${String(active ? revealed.length + 1 : revealed.length).padStart(2, "0")}/${String(CANONICAL_CALLS.length).padStart(2, "0")}`;
    if (elapsed < CANONICAL_CALLS[0].startAt) {
      return `${progress} · Starting · tool load_snippet · note 01`;
    }
    if (active) {
      const attempt = active.kind === "model" ? ` · attempt ${active.attempt}` : "";
      return `${progress} · Now · ${active.kind} ${active.name} · note ${noteNumber(active.snippetId)}${attempt} · ${active.detail}`;
    }
    if (elapsed >= CANONICAL_END_MS) {
      return `${progress} · Filing the receipt · simulated totals are locking in.`;
    }
    const last = revealed[revealed.length - 1];
    if (last) {
      return `${progress} · Note ${noteNumber(last.snippetId)} · ${last.detail}`;
    }
  }
  if (selected) {
    const kind = selected.sample ? "sample draw" : "filed draw";
    return `${selected.code} · ${kind} · ${selected.blurb}. Simulated receipt.`;
  }
  return "Ready · classify six research notes · local sample set · scripted draw with retries.";
}

function announcement(revealed: readonly Call[], playing: boolean): string {
  if (!playing) return "";
  const last = revealed[revealed.length - 1];
  if (!last) return "Run started.";
  return `Note ${noteNumber(last.snippetId)}. ${last.detail}`;
}

function remember(
  file: { runs: RunRecord[]; nextNumber: number },
  setNote: (note: string | null) => void,
) {
  try {
    writeLedger(file);
    setNote(null);
  } catch {
    setNote("This browser blocked local storage. The ledger lasts for this tab only.");
  }
}
