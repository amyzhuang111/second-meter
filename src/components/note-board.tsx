"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { acceptedLabel, noteNumber, snippetPhase, SNIPPETS } from "@/lib/script";
import type { Call } from "@/lib/types";
import { cn } from "@/lib/utils";

export function NoteBoard({
  calls,
  active,
  playing,
  onRun,
  onRestore,
  onClear,
}: {
  calls: readonly Call[];
  active: Call | null;
  playing: boolean;
  onRun: () => void;
  onRestore: () => void;
  onClear: () => void;
}) {
  useEffect(() => {
    if (!active) return;
    document
      .querySelector(`[data-note="${active.snippetId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Card className="h-auto gap-3 py-3 lg:h-full lg:overflow-hidden">
      <CardHeader className="shrink-0 gap-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl leading-none">Six research notes</h2>
            <CardDescription className="mt-1 max-w-xl text-[13px] leading-5">
              A fixed local set. Run classification replays one scripted draw, so the
              retry and the incomplete note land in the same place every time.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              data-testid="run-button"
              className="h-10 px-4 text-sm"
              disabled={playing}
              aria-busy={playing}
              onClick={onRun}
            >
              {playing ? "Filing receipt…" : "Run classification"}
            </Button>
            <Button type="button" variant="outline" className="h-10" onClick={onRestore}>
              Restore samples
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 text-muted-foreground"
              data-testid="clear-ledger"
              onClick={onClear}
            >
              Clear ledger
            </Button>
          </div>
        </div>
        <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Labels · cost · retry · quality · workflow · aside
        </p>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        <ol className="flex flex-col gap-2">
          {SNIPPETS.map((snippet) => {
            const phase = snippetPhase(snippet.id, calls, active);
            const label = acceptedLabel(calls, snippet.id);
            return (
              <li
                key={snippet.id}
                data-note={snippet.id}
                data-testid={`note-${snippet.id}`}
                data-phase={phase}
                className={cn(
                  "scroll-my-2 rounded-lg border px-3 py-2",
                  phase === "queued" && "border-border/80 bg-background/30",
                  phase === "running" && "border-primary bg-primary/10",
                  phase === "retrying" && "border-retry bg-retry/10",
                  phase === "done" && "border-ok/40 bg-ok/10",
                  phase === "incomplete" && "border-retry bg-retry/10",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                    {noteNumber(snippet.id)} · {snippet.source}
                  </p>
                  <PhaseBadge phase={phase} label={label} />
                </div>
                <p className="mt-1 text-sm leading-snug">{snippet.text}</p>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function PhaseBadge({
  phase,
  label,
}: {
  phase: "queued" | "running" | "retrying" | "done" | "incomplete";
  label: string | null;
}) {
  if (phase === "done") {
    return <Badge variant="secondary">{label ?? "Labeled"}</Badge>;
  }
  if (phase === "running") return <Badge>In call</Badge>;
  if (phase === "retrying") return <Badge variant="destructive">Retry</Badge>;
  if (phase === "incomplete") {
    return (
      <Badge variant="outline" className="border-retry text-retry">
        Incomplete
      </Badge>
    );
  }
  return <Badge variant="outline">Queued</Badge>;
}
