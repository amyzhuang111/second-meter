"use client";

import { useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  displayMoney,
  logRatioSentence,
  openLog,
  sourceLabel,
  summarizeAttempts,
  summaryDocument,
  summaryToCsv,
  summaryToJson,
  type OpenedLog,
  type PriceRate,
} from "@/lib/attempt-log";
import { formatMicro, formatShare, formatTokens, formatWall, formatWhen } from "@/lib/format";
import { clearImport, readImport, saveImport, savePrices, saveSampleData, serverImport, subscribeImport } from "@/lib/log-store";

export function LogDesk() {
  const stored = useSyncExternalStore(subscribeImport, readImport, serverImport);
  const fileRef = useRef<HTMLInputElement>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [exportPreview, setExportPreview] = useState<string | null>(null);

  const opened = useMemo(() => {
    if (!stored.text || !stored.filename) return null;
    return openLog(stored.filename, stored.text, stored.prices);
  }, [stored.filename, stored.text, stored.prices]);

  const summary = useMemo(() => summarizeAttempts(opened?.rows ?? []), [opened]);

  function takeFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setReadError(null);
      setExportPreview(null);
      saveImport(file.name, String(reader.result ?? ""));
    };
    reader.onerror = () => setReadError(`${file.name} could not be read.`);
    reader.readAsText(file);
  }

  async function importSample() {
    setReadError(null);
    setExportPreview(null);
    try {
      const response = await fetch("/samples/sample-agent-log.csv");
      if (!response.ok) throw new Error("missing");
      saveImport("sample-agent-log.csv", await response.text());
    } catch {
      setReadError("The sample file could not be loaded from this app.");
    }
  }

  function exportSummary(kind: "json" | "csv") {
    if (!opened) return;
    const doc = summaryDocument(opened, summary, stored.prices);
    const text = kind === "json" ? summaryToJson(doc) : summaryToCsv(doc);
    setExportPreview(text);
    download(kind === "json" ? "second-meter-summary.json" : "second-meter-summary.csv", text, kind === "json" ? "application/json" : "text/csv");
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col overflow-auto px-3 py-3 sm:px-5 lg:min-h-0 lg:py-4">
      <header className="shrink-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] text-primary uppercase">
              For Amy Zhuang · imported agent logs
            </p>
            <h1 className="font-heading text-4xl leading-none tracking-tight sm:text-5xl">
              The Second Meter
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
              Cost per successful completion, from the rows you import. Misses stay on the bill.
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button
              variant="outline"
              aria-pressed={false}
              data-testid="sample-toggle"
              onClick={() => saveSampleData(true)}
            >
              Sample data
            </Button>
            <p className="max-w-xs font-mono text-[11px] leading-4 text-muted-foreground sm:text-right">
              Off. The scripted classification draw stays hidden.
            </p>
          </div>
        </div>
      </header>

      {stored.note || readError ? (
        <p role="status" className="mt-3 shrink-0 rounded-lg border border-retry/50 px-3 py-2 text-sm">
          {readError ?? stored.note}
        </p>
      ) : null}

      <ImportBar
        onBrowse={() => fileRef.current?.click()}
        onFile={takeFile}
        onSample={() => void importSample()}
        onClear={() => {
          setExportPreview(null);
          clearImport();
        }}
        hasLog={opened != null}
        inputRef={fileRef}
      />

      {opened == null ? (
        <section data-testid="empty-state" className="mt-4 rounded-xl bg-card px-4 py-8 ring-1 ring-foreground/10">
          <h2 className="font-heading text-2xl">No log loaded</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose a CSV or JSON file of real attempts. Until then every rate on this page stays blank.
            Nothing here is filled from the scripted draw. That draw is sample data, and it is off.
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <Meter testId="total-spend" label="Total spend" value="—" detail="Waiting for a file" />
            <Meter testId="cost-per-attempt" label="Cost / attempt" value="—" detail="Waiting for a priced row" />
            <Meter
              testId="cost-per-completion"
              label="Cost / successful completion"
              value="—"
              detail="Waiting for a success"
              emphasis
            />
          </div>
        </section>
      ) : (
        <LoadedLog
          opened={opened}
          summary={summary}
          prices={stored.prices}
          priceOrigin={stored.priceOrigin}
          preview={exportPreview}
          onExport={exportSummary}
          onPrices={savePrices}
        />
      )}
    </div>
  );
}

function ImportBar({
  onBrowse,
  onFile,
  onSample,
  onClear,
  hasLog,
  inputRef,
}: {
  onBrowse: () => void;
  onFile: (file: File) => void;
  onSample: () => void;
  onClear: () => void;
  hasLog: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="mt-4 flex shrink-0 flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        data-testid="import-file"
        className="sr-only"
        type="file"
        accept=".csv,.json,text/csv,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button onClick={onBrowse}>
        <Upload />
        Import CSV or JSON
      </Button>
      <Button variant="outline" data-testid="import-sample" onClick={onSample}>
        Import sample file (not a real log)
      </Button>
      {hasLog ? (
        <Button variant="ghost" data-testid="clear-log" onClick={onClear}>
          Remove log
        </Button>
      ) : null}
      <span className="mx-1 hidden h-4 w-px bg-border sm:inline" />
      <DownloadLink href="/templates/attempt-log-template.csv" label="Template CSV" />
      <DownloadLink href="/templates/attempt-log-template.json" label="Template JSON" />
      <DownloadLink href="/samples/sample-agent-log.csv" label="Sample CSV" />
      <DownloadLink href="/samples/sample-agent-log.json" label="Sample JSON" />
    </div>
  );
}

function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <Download className="size-3.5" />
      {label}
    </a>
  );
}

function LoadedLog({
  opened,
  summary,
  prices,
  priceOrigin,
  preview,
  onExport,
  onPrices,
}: {
  opened: OpenedLog;
  summary: ReturnType<typeof summarizeAttempts>;
  prices: PriceRate[];
  priceOrigin: "sample" | "user";
  preview: string | null;
  onExport: (kind: "json" | "csv") => void;
  onPrices: (prices: PriceRate[]) => void;
}) {
  const flagged = opened.rows.filter((row) => !row.included);
  const notes = opened.rows.flatMap((row) => (row.included ? row.warnings : []));

  return (
    <>
      <p data-testid="source-label" className="mt-4 font-mono text-xs tracking-wide text-primary uppercase">
        {sourceLabel(opened)}
      </p>
      {opened.label === "sample" ? (
        <p data-testid="sample-banner" role="status" className="mt-2 rounded-lg border border-[#8a5a12] bg-[#8a5a12]/15 px-3 py-2 text-sm">
          {opened.notice} The rates below are arithmetic on this file, not a record of real usage.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Rates below use this file only. Filename and row count are on the line above.
        </p>
      )}

      <section className="mt-4" aria-labelledby="rates-heading">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rates-heading" className="font-heading text-lg leading-none">
            {opened.label === "sample" ? "Sample file rates" : "From your imported log"}
          </h2>
          <p className="text-sm" data-testid="log-ratio">
            {logRatioSentence(summary)}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Meter testId="total-spend" label="Total spend" value={displayMoney(summary, "spend")} detail={`${summary.pricedAttempts} priced ${summary.pricedAttempts === 1 ? "attempt" : "attempts"}`} />
          <Meter testId="cost-per-attempt" label="Cost / attempt" value={displayMoney(summary, "attempt")} detail="Spend divided by priced rows" />
          <Meter
            testId="cost-per-completion"
            label="Cost / successful completion"
            value={displayMoney(summary, "completion")}
            detail={
              summary.completions === 0
                ? "No run has a success yet"
                : `${summary.completions} ${summary.completions === 1 ? "run" : "runs"} with a success`
            }
            emphasis
          />
          <Meter
            testId="retry-share"
            label="Retry share of spend"
            value={formatShare(summary.retryShare)}
            detail={
              summary.retryAttempts === 0
                ? "No retry_of values in the rates"
                : `${summary.retryAttempts} priced ${summary.retryAttempts === 1 ? "retry" : "retries"}`
            }
          />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          <span data-testid="incomplete-runs">{summary.incompleteRuns} incomplete {summary.incompleteRuns === 1 ? "run" : "runs"}</span>
          {summary.incompleteRunIds.length > 0 ? ` (${summary.incompleteRunIds.join(", ")})` : ""}.{" "}
          <span data-testid="completions">{summary.completions} successful completions</span>.{" "}
          <span data-testid="flagged-count">{summary.flaggedRows} flagged {summary.flaggedRows === 1 ? "row" : "rows"}</span>
          {summary.flaggedRowNumbers.length > 0 ? `, row ${summary.flaggedRowNumbers.join(", row ")}` : ""}.{" "}
          <span data-testid="priced-attempts">{summary.pricedAttempts} priced attempts</span>. Flagged rows stay listed and stay out of these rates.
        </p>
      </section>

      {opened.fileIssues.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 rounded-lg border border-destructive/50 px-5 py-3 text-sm">
          {opened.fileIssues.map((issue) => (
            <li key={issue.message}>{issue.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="flex flex-col gap-3">
          <section className="rounded-xl bg-card px-3 py-3 ring-1 ring-foreground/10">
            <h2 className="font-heading text-lg">Price table</h2>
            {opened.unpricedModels.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Every parsed row includes cost_usd, or no model is waiting on a rate. The price table is unused.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  {priceOrigin === "sample"
                    ? "Sample rates, used only where cost_usd is blank. Not vendor prices."
                    : "Your rates, used only where cost_usd is blank. Dollars per million tokens."}
                </p>
                <div className="mt-3 flex flex-col gap-3">
                  {opened.unpricedModels.map((model) => {
                    const rate = prices.find((item) => item.model === model);
                    return (
                      <div key={model} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr] sm:items-end">
                        <p className="font-mono text-sm">{model}</p>
                        <RateField
                          label="Input $ / 1M"
                          testId={`price-${model}-input`}
                          initial={rate?.inputPerMillionUsd ?? null}
                          onCommit={(value) => onPrices(mergeRate(prices, model, "inputPerMillionUsd", value))}
                        />
                        <RateField
                          label="Output $ / 1M"
                          testId={`price-${model}-output`}
                          initial={rate?.outputPerMillionUsd ?? null}
                          onCommit={(value) => onPrices(mergeRate(prices, model, "outputPerMillionUsd", value))}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <section className="rounded-xl bg-card px-3 py-3 ring-1 ring-foreground/10" aria-labelledby="flags-heading">
            <h2 id="flags-heading" className="font-heading text-lg">Flagged rows</h2>
            {flagged.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No row was left out of the rates.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {flagged.map((row) => (
                  <li key={row.rowNumber} data-testid={`flagged-row-${row.rowNumber}`}>
                    <span className="font-mono text-destructive">Row {row.rowNumber}</span>
                    <span className="text-muted-foreground"> · left out of the rates. </span>
                    {[...row.errors, ...row.warnings].map((issue) => issue.message).join(" ")}
                  </li>
                ))}
              </ul>
            )}
            {notes.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {notes.map((issue) => (
                  <li key={`${issue.rowNumber}-${issue.field}`}>{issue.message}</li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>

        <article data-testid="cost-review" className="receipt-paper flex flex-col" aria-label="Cost review">
          <div className="receipt-perf" />
          <div className="px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-[1.65rem] leading-none text-[#241c16]">Cost review</p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.16em] text-[#6e675c] uppercase">
                  {opened.label === "sample" ? "Sample file · not a real log" : "From your imported log"}
                </p>
              </div>
              <p className={`stamp px-2 py-1 text-[11px] font-semibold ${opened.label === "sample" ? "stamp-sample" : "stamp-filed"}`}>
                {opened.label === "sample" ? "Sample" : "Imported"}
              </p>
            </div>
            <dl className="mt-3 grid grid-cols-[9.5rem_1fr] gap-x-3 gap-y-1 font-mono text-[12px] leading-5 text-[#241c16]">
              <dt className="text-[#6e675c]">File</dt>
              <dd>{opened.filename}</dd>
              <dt className="text-[#6e675c]">Rows</dt>
              <dd>{opened.rows.length}</dd>
              <dt className="text-[#6e675c]">Priced attempts</dt>
              <dd>{summary.pricedAttempts}</dd>
              <dt className="text-[#6e675c]">Total spend</dt>
              <dd>{displayMoney(summary, "spend")}</dd>
              <dt className="text-[#6e675c]">Cost / attempt</dt>
              <dd>{displayMoney(summary, "attempt")}</dd>
              <dt className="text-[#6e675c]">Cost / completion</dt>
              <dd>{displayMoney(summary, "completion")}</dd>
              <dt className="text-[#6e675c]">Retry share</dt>
              <dd>{formatShare(summary.retryShare)}</dd>
              <dt className="text-[#6e675c]">Incomplete runs</dt>
              <dd>{summary.incompleteRuns}</dd>
              <dt className="text-[#6e675c]">Tokens</dt>
              <dd>
                {formatTokens(summary.tokensIn)} in · {formatTokens(summary.tokensOut)} out
              </dd>
            </dl>
            <p className="mt-3 text-[12px] leading-5 text-[#6e675c]">{summaryDocument(opened, summary, prices).note}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" data-testid="export-json" onClick={() => onExport("json")}>
                Export summary JSON
              </Button>
              <Button variant="outline" data-testid="export-csv" onClick={() => onExport("csv")}>
                Export summary CSV
              </Button>
            </div>
            {preview ? (
              <pre data-testid="summary-preview" className="mt-3 max-h-48 overflow-auto rounded bg-[#241c16]/5 p-2 font-mono text-[10px] leading-4 text-[#241c16]">
                {preview}
              </pre>
            ) : (
              <p className="mt-3 text-[12px] text-[#6e675c]">Export writes a summary you can attach to a cost review.</p>
            )}
          </div>
          <div className="receipt-perf" />
        </article>
      </div>

      <section className="mt-4" aria-labelledby="models-heading">
        <h2 id="models-heading" className="font-heading text-lg">Per model</h2>
        <p className="mt-1 mb-2 text-sm text-muted-foreground">Priced rows only, from this file.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Successes</TableHead>
              <TableHead>Retries</TableHead>
              <TableHead>Spend</TableHead>
              <TableHead>Retry spend</TableHead>
              <TableHead>Tokens in</TableHead>
              <TableHead>Tokens out</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.models.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>No priced attempts.</TableCell>
              </TableRow>
            ) : (
              summary.models.map((model) => (
                <TableRow key={model.model} data-testid={`model-${model.model}`}>
                  <TableCell className="font-mono">{model.model}</TableCell>
                  <TableCell>{model.attempts}</TableCell>
                  <TableCell>{model.successfulAttempts}</TableCell>
                  <TableCell>{model.retryAttempts}</TableCell>
                  <TableCell data-testid={`model-${model.model}-spend`}>{formatMicro(model.spendMicro)}</TableCell>
                  <TableCell>{formatMicro(model.retrySpendMicro)}</TableCell>
                  <TableCell>{formatTokens(model.tokensIn)}</TableCell>
                  <TableCell>{formatTokens(model.tokensOut)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="mt-4 mb-6" aria-labelledby="ledger-heading">
        <h2 id="ledger-heading" className="font-heading text-lg">Run ledger</h2>
        <p className="mt-1 mb-2 text-sm text-muted-foreground">
          All {opened.rows.length} rows from {opened.filename}. Nothing in this table was dropped.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead>Attempt</TableHead>
              <TableHead>Run</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>In</TableHead>
              <TableHead>Out</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Success</TableHead>
              <TableHead>Retry of</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Rates</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {opened.rows.map((row) => (
              <TableRow key={row.rowNumber} data-testid={`ledger-row-${row.rowNumber}`}>
                <TableCell className="font-mono">{row.rowNumber}</TableCell>
                <TableCell className="font-mono">{row.attemptId}</TableCell>
                <TableCell className="font-mono">{row.runId || "—"}</TableCell>
                <TableCell>{row.timestamp ? formatWhen(row.timestamp) : "—"}</TableCell>
                <TableCell className="font-mono">{row.model || "—"}</TableCell>
                <TableCell>{row.inputTokens == null ? "—" : formatTokens(row.inputTokens)}</TableCell>
                <TableCell>{row.outputTokens == null ? "—" : formatTokens(row.outputTokens)}</TableCell>
                <TableCell>{row.resolvedCostMicro == null ? "—" : formatMicro(row.resolvedCostMicro)}</TableCell>
                <TableCell>{row.success == null ? "—" : row.success ? "yes" : "no"}</TableCell>
                <TableCell className="font-mono">{row.retryOf ?? "—"}</TableCell>
                <TableCell>{row.latencyMs == null ? "—" : formatWall(row.latencyMs)}</TableCell>
                <TableCell className={row.included ? "text-ok" : "text-destructive"}>
                  {row.included ? "in" : "flagged"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}

function RateField({
  label,
  testId,
  initial,
  onCommit,
}: {
  label: string;
  testId: string;
  initial: number | null;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(initial == null ? "" : String(initial));
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <Input
        className="mt-1 font-mono"
        inputMode="decimal"
        data-testid={testId}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next.trim() === "") {
            onCommit(null);
            return;
          }
          if (!/^\d+(\.\d+)?$/.test(next.trim())) return;
          onCommit(Number(next.trim()));
        }}
      />
    </label>
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
      <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p data-testid={testId} className={`mt-1 font-mono text-3xl tabular-nums ${emphasis ? "phosphor" : ""}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function mergeRate(
  prices: readonly PriceRate[],
  model: string,
  field: "inputPerMillionUsd" | "outputPerMillionUsd",
  value: number | null,
): PriceRate[] {
  const current = prices.find((rate) => rate.model === model);
  const next: PriceRate = {
    model,
    inputPerMillionUsd: current?.inputPerMillionUsd ?? null,
    outputPerMillionUsd: current?.outputPerMillionUsd ?? null,
    [field]: value,
  };
  return [...prices.filter((rate) => rate.model !== model), next];
}

function download(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
