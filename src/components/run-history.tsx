"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDollars, formatShare, formatWall, formatWhen } from "@/lib/format";
import { summarize } from "@/lib/metrics";
import type { RunRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RunHistory({
  runs,
  selectedId,
  disabled,
  onSelect,
}: {
  runs: readonly RunRecord[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <section aria-labelledby="history-heading">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="history-heading" className="font-heading text-lg leading-none">
          Run history
        </h2>
        <p className="text-xs text-muted-foreground">
          Done counts accepted labels only. Click a row to reopen its receipt.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Run</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Attempts</TableHead>
            <TableHead className="text-right">Done</TableHead>
            <TableHead className="text-right">Miss</TableHead>
            <TableHead className="text-right">Retries</TableHead>
            <TableHead className="text-right">Sim. wall</TableHead>
            <TableHead className="text-right">Sim. spend</TableHead>
            <TableHead className="text-right">$/attempt</TableHead>
            <TableHead className="text-right">$/completion</TableHead>
            <TableHead className="text-right">Retry share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="whitespace-normal text-muted-foreground">
                Ledger is empty. The six notes are still loaded. A run will print a
                receipt and add a row here.
              </TableCell>
            </TableRow>
          ) : (
            runs.map((run) => {
              const summary = summarize([run]);
              const selected = run.id === selectedId;
              return (
                <TableRow
                  key={run.id}
                  data-state={selected ? "selected" : undefined}
                  data-testid={`history-${run.code}`}
                  className={cn(selected && "bg-primary/10")}
                >
                  <TableCell className="whitespace-normal">
                    <button
                      type="button"
                      className="text-left disabled:opacity-60"
                      disabled={disabled}
                      onClick={() => onSelect(run.id)}
                      aria-pressed={selected}
                    >
                      <span className="font-mono text-sm">{run.code}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {formatWhen(run.startedAt)} UTC
                      </span>
                      <span className="block max-w-52 text-[11px] text-muted-foreground">
                        {run.blurb}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell>
                    {run.status === "running" ? (
                      <Badge>Open</Badge>
                    ) : run.sample ? (
                      <Badge variant="outline">Sample</Badge>
                    ) : (
                      <Badge variant="secondary">Filed</Badge>
                    )}
                  </TableCell>
                  <Num>{summary.modelCalls}</Num>
                  <Num>{summary.completions}</Num>
                  <Num>{summary.incomplete}</Num>
                  <Num>{summary.retryCalls}</Num>
                  <Num>{formatWall(summary.wallMs)}</Num>
                  <Num>{formatDollars(summary.spendMicro / 1_000_000)}</Num>
                  <Num>{formatDollars(summary.costPerAttempt)}</Num>
                  <Num>{formatDollars(summary.costPerCompletion)}</Num>
                  <Num>{formatShare(summary.retryShare)}</Num>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </section>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <TableCell className="text-right font-mono text-xs tabular-nums">{children}</TableCell>;
}
