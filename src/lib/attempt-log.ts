import { formatDollars, formatMicro, formatShare } from "./format";
import { formatUsdPlain, microFromNumber, parseUsdMicro } from "./usd";

export const SAMPLE_FILE_NOTICE =
  "Sample file. These numbers are not real and are not a vendor bill.";

export const SAMPLE_PRICE_TABLE: PriceRate[] = [
  { model: "meter-a", inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  { model: "meter-b", inputPerMillionUsd: 1, outputPerMillionUsd: 5 },
];

const REQUIRED = ["run_id", "timestamp", "model", "input_tokens", "output_tokens", "success"] as const;

export type PriceRate = {
  model: string;
  inputPerMillionUsd: number | null;
  outputPerMillionUsd: number | null;
};

export type Issue = {
  rowNumber: number;
  field: string;
  message: string;
  severity: "error" | "warning";
};

export type PricedRow = {
  rowNumber: number;
  attemptId: string;
  runId: string;
  timestamp: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Micro-dollars from the file. Null when cost_usd was left blank. */
  fileCostMicro: number | null;
  costPresent: boolean;
  success: boolean | null;
  retryOf: string | null;
  latencyMs: number | null;
  errors: Issue[];
  warnings: Issue[];
  resolvedCostMicro: number | null;
  costSource: "file" | "price-table" | "unpriced" | "invalid";
  included: boolean;
};

export type OpenedLog = {
  filename: string;
  label: "sample" | "import";
  notice: string | null;
  fileIssues: Issue[];
  rows: PricedRow[];
  unpricedModels: string[];
};

export type ModelBreakdown = {
  model: string;
  attempts: number;
  successfulAttempts: number;
  retryAttempts: number;
  spendMicro: number;
  retrySpendMicro: number;
  tokensIn: number;
  tokensOut: number;
};

export type LogSummary = {
  totalRows: number;
  pricedAttempts: number;
  flaggedRows: number;
  flaggedRowNumbers: number[];
  spendMicro: number;
  retrySpendMicro: number;
  tokensIn: number;
  tokensOut: number;
  successfulAttempts: number;
  retryAttempts: number;
  completions: number;
  incompleteRuns: number;
  incompleteRunIds: string[];
  /** Dollars. Null when there are no priced attempts. */
  costPerAttempt: number | null;
  /** Dollars. Null when no run_id has a success. */
  costPerCompletion: number | null;
  /** Retry spend / total spend. Null when spend is 0. */
  retryShare: number | null;
  models: ModelBreakdown[];
};

export type SummaryDocument = {
  source: string;
  filename: string;
  row_count: number;
  priced_attempts: number;
  flagged_rows: number[];
  total_spend_micro_usd: number;
  total_spend_usd: string;
  cost_per_attempt_usd: string | null;
  cost_per_successful_completion_usd: string | null;
  retry_share_of_spend: string | null;
  successful_completions: number;
  incomplete_runs: string[];
  successful_attempts: number;
  retry_attempts: number;
  input_tokens: number;
  output_tokens: number;
  models: Array<{
    model: string;
    attempts: number;
    successful_attempts: number;
    retry_attempts: number;
    spend_usd: string;
    retry_spend_usd: string;
    input_tokens: number;
    output_tokens: number;
  }>;
  flagged: Array<{ row_number: number; issues: string }>;
  price_table: Array<{
    model: string;
    input_usd_per_million: number | null;
    output_usd_per_million: number | null;
  }>;
  note: string;
};

const EMPTY_SUMMARY: LogSummary = {
  totalRows: 0,
  pricedAttempts: 0,
  flaggedRows: 0,
  flaggedRowNumbers: [],
  spendMicro: 0,
  retrySpendMicro: 0,
  tokensIn: 0,
  tokensOut: 0,
  successfulAttempts: 0,
  retryAttempts: 0,
  completions: 0,
  incompleteRuns: 0,
  incompleteRunIds: [],
  costPerAttempt: null,
  costPerCompletion: null,
  retryShare: null,
  models: [],
};

export function sourceLabel(log: Pick<OpenedLog, "label" | "filename" | "rows">): string {
  const count = `${log.rows.length} ${log.rows.length === 1 ? "row" : "rows"}`;
  if (log.label === "sample") {
    return `Sample file · not a real log · ${log.filename} · ${count}`;
  }
  return `From your imported log · ${log.filename} · ${count}`;
}

export function logRatioSentence(summary: LogSummary): string {
  if (summary.pricedAttempts === 0) {
    return "Priced attempts will be the denominator.";
  }
  if (summary.completions === 0) {
    return "Spend is on the bill. No successful completion is in the denominator yet.";
  }
  const times = summary.costPerCompletion! / summary.costPerAttempt!;
  return `A successful completion costs ${times.toFixed(2)} times an attempt on this log.`;
}

export function openLog(filename: string, text: string, prices: readonly PriceRate[]): OpenedLog {
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const parsed = parseBody(filename, cleaned);
  const priced = priceRows(parsed.rows, prices);
  return {
    filename,
    label: parsed.label,
    notice: parsed.notice,
    fileIssues: parsed.fileIssues,
    rows: priced,
    unpricedModels: unpricedModels(priced),
  };
}

export function summarizeAttempts(rows: readonly PricedRow[]): LogSummary {
  const included = rows.filter((row) => row.included);
  const flagged = rows.filter((row) => !row.included);
  if (rows.length === 0) return EMPTY_SUMMARY;

  let spendMicro = 0;
  let retrySpendMicro = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let successfulAttempts = 0;
  let retryAttempts = 0;
  const byRun = new Map<string, PricedRow[]>();
  const byModel = new Map<string, PricedRow[]>();

  for (const row of included) {
    const cost = row.resolvedCostMicro ?? 0;
    spendMicro += cost;
    tokensIn += row.inputTokens ?? 0;
    tokensOut += row.outputTokens ?? 0;
    if (row.success) successfulAttempts += 1;
    if (row.retryOf) {
      retryAttempts += 1;
      retrySpendMicro += cost;
    }
    const run = byRun.get(row.runId) ?? [];
    run.push(row);
    byRun.set(row.runId, run);
    const model = byModel.get(row.model) ?? [];
    model.push(row);
    byModel.set(row.model, model);
  }

  const incompleteRunIds: string[] = [];
  let completions = 0;
  for (const [runId, attempts] of byRun) {
    if (attempts.some((row) => row.success)) completions += 1;
    else incompleteRunIds.push(runId);
  }
  incompleteRunIds.sort();

  const dollars = spendMicro / 1_000_000;
  const models = [...byModel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([model, attempts]) => {
      let modelSpend = 0;
      let modelRetry = 0;
      let modelIn = 0;
      let modelOut = 0;
      let successes = 0;
      let retries = 0;
      for (const row of attempts) {
        const cost = row.resolvedCostMicro ?? 0;
        modelSpend += cost;
        modelIn += row.inputTokens ?? 0;
        modelOut += row.outputTokens ?? 0;
        if (row.success) successes += 1;
        if (row.retryOf) {
          retries += 1;
          modelRetry += cost;
        }
      }
      return {
        model,
        attempts: attempts.length,
        successfulAttempts: successes,
        retryAttempts: retries,
        spendMicro: modelSpend,
        retrySpendMicro: modelRetry,
        tokensIn: modelIn,
        tokensOut: modelOut,
      };
    });

  return {
    totalRows: rows.length,
    pricedAttempts: included.length,
    flaggedRows: flagged.length,
    flaggedRowNumbers: flagged.map((row) => row.rowNumber),
    spendMicro,
    retrySpendMicro,
    tokensIn,
    tokensOut,
    successfulAttempts,
    retryAttempts,
    completions,
    incompleteRuns: incompleteRunIds.length,
    incompleteRunIds,
    costPerAttempt: included.length === 0 ? null : dollars / included.length,
    costPerCompletion: completions === 0 ? null : dollars / completions,
    retryShare: spendMicro === 0 ? null : retrySpendMicro / spendMicro,
    models,
  };
}

export function summaryDocument(
  log: OpenedLog,
  summary: LogSummary,
  prices: readonly PriceRate[],
): SummaryDocument {
  return {
    source: log.label === "sample" ? "Sample file — not a real log" : "From your imported log",
    filename: log.filename,
    row_count: log.rows.length,
    priced_attempts: summary.pricedAttempts,
    flagged_rows: summary.flaggedRowNumbers,
    total_spend_micro_usd: summary.spendMicro,
    total_spend_usd: formatUsdPlain(summary.spendMicro),
    cost_per_attempt_usd:
      summary.costPerAttempt == null ? null : formatUsdPlain(Math.round(summary.costPerAttempt * 1_000_000)),
    cost_per_successful_completion_usd:
      summary.costPerCompletion == null
        ? null
        : formatUsdPlain(Math.round(summary.costPerCompletion * 1_000_000)),
    retry_share_of_spend: summary.retryShare == null ? null : formatShare(summary.retryShare),
    successful_completions: summary.completions,
    incomplete_runs: summary.incompleteRunIds,
    successful_attempts: summary.successfulAttempts,
    retry_attempts: summary.retryAttempts,
    input_tokens: summary.tokensIn,
    output_tokens: summary.tokensOut,
    models: summary.models.map((model) => ({
      model: model.model,
      attempts: model.attempts,
      successful_attempts: model.successfulAttempts,
      retry_attempts: model.retryAttempts,
      spend_usd: formatUsdPlain(model.spendMicro),
      retry_spend_usd: formatUsdPlain(model.retrySpendMicro),
      input_tokens: model.tokensIn,
      output_tokens: model.tokensOut,
    })),
    flagged: log.rows
      .filter((row) => !row.included)
      .map((row) => ({
        row_number: row.rowNumber,
        issues: [...row.errors, ...row.warnings].map((issue) => issue.message).join("; "),
      })),
    price_table: prices.map((rate) => ({
      model: rate.model,
      input_usd_per_million: rate.inputPerMillionUsd,
      output_usd_per_million: rate.outputPerMillionUsd,
    })),
    note:
      log.label === "sample"
        ? "Computed from the sample file only. These figures are not real usage."
        : "Computed from the imported rows only. Flagged rows stay listed and are left out of the rates.",
  };
}

export function summaryToJson(doc: SummaryDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function summaryToCsv(doc: SummaryDocument): string {
  const lines = [
    "source,filename,row_count,priced_attempts,flagged_row_count,total_spend_usd,cost_per_attempt_usd,cost_per_successful_completion_usd,retry_share_of_spend,successful_completions,incomplete_runs",
    [
      csvCell(doc.source),
      csvCell(doc.filename),
      doc.row_count,
      doc.priced_attempts,
      doc.flagged_rows.length,
      doc.total_spend_usd,
      doc.cost_per_attempt_usd ?? "",
      doc.cost_per_successful_completion_usd ?? "",
      doc.retry_share_of_spend ?? "",
      doc.successful_completions,
      csvCell(doc.incomplete_runs.join(";")),
    ].join(","),
    "",
    "model,attempts,successful_attempts,retry_attempts,spend_usd,retry_spend_usd,input_tokens,output_tokens",
    ...doc.models.map((model) =>
      [
        csvCell(model.model),
        model.attempts,
        model.successful_attempts,
        model.retry_attempts,
        model.spend_usd,
        model.retry_spend_usd,
        model.input_tokens,
        model.output_tokens,
      ].join(","),
    ),
    "",
    "row_number,issues",
    ...doc.flagged.map((row) => [row.row_number, csvCell(row.issues)].join(",")),
    "",
    "note",
    csvCell(doc.note),
  ];
  return `${lines.join("\n")}\n`;
}

export function displayMoney(summary: LogSummary, field: "spend" | "attempt" | "completion"): string {
  if (field === "spend") return formatMicro(summary.spendMicro);
  if (field === "attempt") return formatDollars(summary.costPerAttempt);
  return formatDollars(summary.costPerCompletion);
}

function parseBody(
  filename: string,
  text: string,
): {
  label: "sample" | "import";
  notice: string | null;
  fileIssues: Issue[];
  rows: Omit<PricedRow, "resolvedCostMicro" | "costSource" | "included">[];
} {
  const trimmed = text.trim();
  const asJson = filename.toLowerCase().endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[");
  if (asJson) return parseJsonLog(filename, text);
  return parseCsvLog(filename, text);
}

function parseCsvLog(filename: string, text: string) {
  const marked = sampleMark(filename, text, undefined);
  const physical = text.split(/\r?\n/);
  const records: { line: number; cells: string[] }[] = [];
  for (let index = 0; index < physical.length; index += 1) {
    const line = physical[index] ?? "";
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    records.push({ line: index + 1, cells: splitCsvLine(line) });
  }
  if (records.length === 0) {
    return {
      ...marked,
      fileIssues: [fileIssue("This file has no header row.")],
      rows: [],
    };
  }
  const header = records[0]!.cells.map(normalizeHeader);
  const missing = REQUIRED.filter((name) => !header.includes(name));
  const fileIssues = missing.map((name) => fileIssue(`Missing column ${name}.`));
  const rows = records.slice(1).map((record) => rowFromCells(record.line, header, record.cells));
  return { ...marked, fileIssues, rows: linkRows(rows) };
}

function parseJsonLog(filename: string, text: string) {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      ...sampleMark(filename, text, undefined),
      fileIssues: [fileIssue("This JSON could not be parsed.")],
      rows: [],
    };
  }
  const wrapped = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const list = Array.isArray(value) ? value : wrapped && Array.isArray(wrapped.rows) ? wrapped.rows : null;
  const marked = sampleMark(filename, text, wrapped?.label);
  if (!list) {
    return {
      ...marked,
      fileIssues: [fileIssue("JSON must be an array of rows, or an object with a rows array.")],
      rows: [],
    };
  }
  const rows = list.map((item, index) => rowFromObject(index + 1, item));
  return { ...marked, fileIssues: [], rows: linkRows(rows) };
}

function sampleMark(
  filename: string,
  text: string,
  jsonLabel: unknown,
): { label: "sample" | "import"; notice: string | null } {
  const name = filename.toLowerCase();
  const sample =
    jsonLabel === "sample" ||
    name.includes("sample-agent-log") ||
    /^#\s*sample import file\b/im.test(text);
  return sample
    ? { label: "sample", notice: SAMPLE_FILE_NOTICE }
    : { label: "import", notice: null };
}

function rowFromCells(
  rowNumber: number,
  header: string[],
  cells: string[],
): Omit<PricedRow, "resolvedCostMicro" | "costSource" | "included"> {
  const read = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) return "";
    return (cells[index] ?? "").trim();
  };
  return buildRow({
    rowNumber,
    attemptId: read("attempt_id"),
    runId: read("run_id"),
    timestamp: read("timestamp"),
    model: read("model"),
    inputTokens: read("input_tokens"),
    outputTokens: read("output_tokens"),
    costUsd: read("cost_usd"),
    success: read("success"),
    retryOf: read("retry_of"),
    latencyMs: read("latency_ms"),
    errors: [],
  });
}

function rowFromObject(
  rowNumber: number,
  value: unknown,
): Omit<PricedRow, "resolvedCostMicro" | "costSource" | "included"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyInvalid(rowNumber, "Row is not an object.");
  }
  const record = value as Record<string, unknown>;
  return buildRow({
    rowNumber,
    attemptId: asText(record.attempt_id),
    runId: asText(record.run_id),
    timestamp: asText(record.timestamp),
    model: asText(record.model),
    inputTokens: asText(record.input_tokens),
    outputTokens: asText(record.output_tokens),
    costUsd: record.cost_usd,
    success: record.success,
    retryOf: asText(record.retry_of),
    latencyMs: asText(record.latency_ms),
    errors: [],
  });
}

function buildRow(input: {
  rowNumber: number;
  attemptId: string;
  runId: string;
  timestamp: string;
  model: string;
  inputTokens: string;
  outputTokens: string;
  costUsd: unknown;
  success: unknown;
  retryOf: string;
  latencyMs: string;
  errors: Issue[];
}): Omit<PricedRow, "resolvedCostMicro" | "costSource" | "included"> {
  const errors = [...input.errors];
  const rowNumber = input.rowNumber;
  if (!input.runId) {
    errors.push(error(rowNumber, "run_id", `Row ${rowNumber} has an empty run_id.`));
  }
  if (!input.model) {
    errors.push(error(rowNumber, "model", `Row ${rowNumber} has an empty model.`));
  }
  if (!input.timestamp || Number.isNaN(Date.parse(input.timestamp))) {
    errors.push(error(rowNumber, "timestamp", `Row ${rowNumber} has a timestamp that cannot be read.`));
  }
  const inputTokens = parseCount(input.inputTokens);
  if (inputTokens == null) {
    errors.push(error(rowNumber, "input_tokens", `Row ${rowNumber} has an input_tokens value that is not a non-negative integer.`));
  }
  const outputTokens = parseCount(input.outputTokens);
  if (outputTokens == null) {
    errors.push(error(rowNumber, "output_tokens", `Row ${rowNumber} has an output_tokens value that is not a non-negative integer.`));
  }
  const success = parseSuccess(input.success);
  if (success == null) {
    errors.push(error(rowNumber, "success", `Row ${rowNumber} has a success value that is not true or false.`));
  }
  const cost = parseCost(input.costUsd);
  if (cost.error) {
    errors.push(error(rowNumber, "cost_usd", `Row ${rowNumber}: ${cost.error}`));
  }
  let latencyMs: number | null = null;
  if (input.latencyMs.trim() !== "") {
    latencyMs = parseCount(input.latencyMs);
    if (latencyMs == null) {
      errors.push(error(rowNumber, "latency_ms", `Row ${rowNumber} has a latency_ms value that is not a non-negative integer.`));
    }
  }
  const attemptId = input.attemptId || `row-${rowNumber}`;
  const retryOf = input.retryOf.trim() === "" ? null : input.retryOf.trim();
  return {
    rowNumber,
    attemptId,
    runId: input.runId,
    timestamp: input.timestamp,
    model: input.model,
    inputTokens,
    outputTokens,
    fileCostMicro: cost.micro,
    costPresent: cost.present,
    success,
    retryOf,
    latencyMs,
    errors: dedupeIssues(errors),
    warnings: [],
  };
}

function linkRows(
  rows: Omit<PricedRow, "resolvedCostMicro" | "costSource" | "included">[],
): Omit<PricedRow, "resolvedCostMicro" | "costSource" | "included">[] {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const prior = seen.get(row.attemptId);
    if (prior != null) {
      row.errors.push(
        error(row.rowNumber, "attempt_id", `Row ${row.rowNumber} repeats attempt_id ${row.attemptId}, already used on row ${prior}.`),
      );
    } else {
      seen.set(row.attemptId, row.rowNumber);
    }
  }
  const ids = new Set(rows.filter((row) => row.errors.length === 0).map((row) => row.attemptId));
  for (const row of rows) {
    if (!row.retryOf) continue;
    if (row.retryOf === row.attemptId) {
      row.errors.push(error(row.rowNumber, "retry_of", `Row ${row.rowNumber} has retry_of pointing at itself.`));
      continue;
    }
    if (!ids.has(row.retryOf)) {
      row.warnings.push({
        rowNumber: row.rowNumber,
        field: "retry_of",
        severity: "warning",
        message: `Row ${row.rowNumber} retry_of "${row.retryOf}" does not match an attempt_id in this file. The row still counts as a retry.`,
      });
    }
  }
  return rows;
}

function priceRows(
  rows: Omit<PricedRow, "resolvedCostMicro" | "costSource" | "included">[],
  prices: readonly PriceRate[],
): PricedRow[] {
  const table = new Map(prices.map((rate) => [rate.model, rate]));
  return rows.map((row) => {
    if (row.errors.length > 0) {
      return { ...row, resolvedCostMicro: null, costSource: "invalid", included: false };
    }
    if (row.costPresent) {
      return { ...row, resolvedCostMicro: row.fileCostMicro, costSource: "file", included: true };
    }
    const rate = table.get(row.model);
    const priced = rate ? costFromRate(row.inputTokens ?? 0, row.outputTokens ?? 0, rate) : null;
    if (priced == null) {
      const message = `Row ${row.rowNumber} has no cost_usd and no price for ${row.model || "this model"}.`;
      return {
        ...row,
        warnings: [
          ...row.warnings,
          { rowNumber: row.rowNumber, field: "cost_usd", severity: "warning", message },
        ],
        resolvedCostMicro: null,
        costSource: "unpriced",
        included: false,
      };
    }
    return { ...row, resolvedCostMicro: priced, costSource: "price-table", included: true };
  });
}

export function costFromRate(tokensIn: number, tokensOut: number, rate: PriceRate): number | null {
  if (rate.inputPerMillionUsd == null || rate.outputPerMillionUsd == null) return null;
  if (!Number.isFinite(rate.inputPerMillionUsd) || !Number.isFinite(rate.outputPerMillionUsd)) return null;
  if (rate.inputPerMillionUsd < 0 || rate.outputPerMillionUsd < 0) return null;
  const micro = tokensIn * rate.inputPerMillionUsd + tokensOut * rate.outputPerMillionUsd;
  if (!Number.isFinite(micro)) return null;
  return Math.round(micro);
}

function unpricedModels(rows: readonly PricedRow[]): string[] {
  const models = new Set<string>();
  for (const row of rows) {
    if (!row.costPresent && row.model) models.add(row.model);
  }
  return [...models].sort();
}

function emptyInvalid(rowNumber: number, message: string): Omit<PricedRow, "resolvedCostMicro" | "costSource" | "included"> {
  return {
    rowNumber,
    attemptId: `row-${rowNumber}`,
    runId: "",
    timestamp: "",
    model: "",
    inputTokens: null,
    outputTokens: null,
    fileCostMicro: null,
    costPresent: false,
    success: null,
    retryOf: null,
    latencyMs: null,
    errors: [error(rowNumber, "row", `Row ${rowNumber}: ${message}`)],
    warnings: [],
  };
}

function parseCost(value: unknown): { present: boolean; micro: number | null; error?: string } {
  if (value == null) return { present: false, micro: null };
  if (typeof value === "string" && value.trim() === "") return { present: false, micro: null };
  if (typeof value === "number") {
    const micro = microFromNumber(value);
    if (micro == null) return { present: true, micro: null, error: "cost_usd is not a non-negative dollar amount." };
    return { present: true, micro };
  }
  if (typeof value === "string") {
    const micro = parseUsdMicro(value);
    if (micro == null) return { present: true, micro: null, error: "cost_usd is not a plain non-negative dollar amount." };
    return { present: true, micro };
  }
  return { present: true, micro: null, error: "cost_usd is not a dollar amount." };
}

function parseSuccess(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (text === "true" || text === "yes" || text === "1") return true;
  if (text === "false" || text === "no" || text === "0") return false;
  return null;
}

function parseCount(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

function asText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  return cells;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function fileIssue(message: string): Issue {
  return { rowNumber: 0, field: "file", severity: "error", message };
}

function error(rowNumber: number, field: string, message: string): Issue {
  return { rowNumber, field, severity: "error", message };
}

function dedupeIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.field}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
