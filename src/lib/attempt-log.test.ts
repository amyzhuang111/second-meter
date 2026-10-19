import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SAMPLE_PRICE_TABLE,
  costFromRate,
  openLog,
  sourceLabel,
  summarizeAttempts,
  summaryDocument,
  summaryToCsv,
  summaryToJson,
} from "./attempt-log";
import { formatDollars, formatShare } from "./format";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sampleCsv = readFileSync(join(root, "public/samples/sample-agent-log.csv"), "utf8");
const sampleJson = readFileSync(join(root, "public/samples/sample-agent-log.json"), "utf8");
const templateCsv = readFileSync(join(root, "public/templates/attempt-log-template.csv"), "utf8");
const templateJson = readFileSync(join(root, "public/templates/attempt-log-template.json"), "utf8");

/**
 * Hand bill for the sample file, with the sample price table applied
 * where cost_usd is blank. Micro-dollars. Not real usage.
 *
 * meter-a blank row a2: 1200×$3 + 80×$15 = 4800
 * meter-b blank row a6: 1500×$1 + 100×$5 = 2000
 * Filed costs: 4500, 3000, 3150, 3600, 4650, 2400, 2150, 2700, 1650
 * Plus priced blanks: 4800 + 2000
 * Sum = 34600 → $0.034600
 * Attempts = 11. Completions (run_id with a success) = 6.
 * Incomplete runs = run-3, run-8.
 * Retry rows a2, a5, a9 = 4800+3600+2150 = 10550.
 * 10550/34600 = 30.491…% → 30.5%
 * $0.034600/11 → $0.003145
 * $0.034600/6 → $0.005767
 */
describe("sample import fixture", () => {
  const csv = openLog("sample-agent-log.csv", sampleCsv, SAMPLE_PRICE_TABLE);
  const json = openLog("sample-agent-log.json", sampleJson, SAMPLE_PRICE_TABLE);
  const summary = summarizeAttempts(csv.rows);

  it("keeps twelve rows, flags the bad one, and prices two blank costs", () => {
    assert.equal(csv.label, "sample");
    assert.match(csv.notice ?? "", /not real/);
    assert.equal(csv.rows.length, 12);
    assert.equal(json.rows.length, 12);
    assert.equal(csv.fileIssues.length, 0);

    const priced = csv.rows.filter((row) => row.included);
    assert.equal(priced.length, 11);
    assert.equal(new Set(priced.map((row) => row.model)).size, 2);

    const blankA = csv.rows.find((row) => row.attemptId === "a2");
    const blankB = csv.rows.find((row) => row.attemptId === "a6");
    assert.equal(blankA?.costSource, "price-table");
    assert.equal(blankA?.resolvedCostMicro, 4800);
    assert.equal(blankB?.costSource, "price-table");
    assert.equal(blankB?.resolvedCostMicro, 2000);
    assert.equal(costFromRate(1200, 80, SAMPLE_PRICE_TABLE[0]!), 4800);
    assert.equal(costFromRate(1500, 100, SAMPLE_PRICE_TABLE[1]!), 2000);

    const bad = csv.rows.find((row) => row.rowNumber === 14);
    assert.ok(bad);
    assert.equal(bad.included, false);
    assert.equal(bad.attemptId, "bad-1");
    assert.ok(bad.errors.some((issue) => issue.field === "run_id" && issue.rowNumber === 14));
    assert.ok(bad.errors.some((issue) => issue.field === "success" && issue.rowNumber === 14));

    const jsonBad = json.rows.find((row) => row.attemptId === "bad-1");
    assert.equal(jsonBad?.rowNumber, 12);
    assert.equal(jsonBad?.included, false);
  });

  it("matches the hand-computed cost per completion and retry share", () => {
    assert.equal(summary.pricedAttempts, 11);
    assert.equal(summary.retryAttempts, 3);
    assert.equal(summary.successfulAttempts, 6);
    assert.equal(summary.completions, 6);
    assert.equal(summary.incompleteRuns, 2);
    assert.deepEqual(summary.incompleteRunIds, ["run-3", "run-8"]);
    assert.equal(summary.flaggedRows, 1);
    assert.deepEqual(summary.flaggedRowNumbers, [14]);
    assert.equal(summary.spendMicro, 34_600);
    assert.equal(summary.retrySpendMicro, 10_550);
    assert.equal(summary.tokensIn, 13_900);
    assert.equal(summary.tokensOut, 1_020);
    assert.equal(formatDollars(summary.costPerAttempt), "$0.003145");
    assert.equal(formatDollars(summary.costPerCompletion), "$0.005767");
    assert.equal(formatShare(summary.retryShare), "30.5%");

    const jsonSummary = summarizeAttempts(json.rows);
    assert.equal(jsonSummary.spendMicro, summary.spendMicro);
    assert.equal(jsonSummary.completions, summary.completions);
    assert.equal(formatShare(jsonSummary.retryShare), "30.5%");
    assert.equal(formatDollars(jsonSummary.costPerCompletion), "$0.005767");
  });

  it("breaks the same bill out by model", () => {
    const [meterA, meterB] = summary.models;
    assert.equal(meterA?.model, "meter-a");
    assert.equal(meterA?.attempts, 6);
    assert.equal(meterA?.successfulAttempts, 3);
    assert.equal(meterA?.retryAttempts, 2);
    assert.equal(meterA?.spendMicro, 23_400);
    assert.equal(meterA?.retrySpendMicro, 8_400);
    assert.equal(meterA?.tokensIn, 5_700);
    assert.equal(meterA?.tokensOut, 420);
    assert.equal(meterB?.model, "meter-b");
    assert.equal(meterB?.attempts, 5);
    assert.equal(meterB?.successfulAttempts, 3);
    assert.equal(meterB?.retryAttempts, 1);
    assert.equal(meterB?.spendMicro, 11_200);
    assert.equal(meterB?.retrySpendMicro, 2_150);
    assert.equal(meterB?.tokensIn, 8_200);
    assert.equal(meterB?.tokensOut, 600);
  });

  it("labels the sample file as sample and a renamed copy as an import", () => {
    assert.equal(
      sourceLabel(csv),
      "Sample file · not a real log · sample-agent-log.csv · 12 rows",
    );
    const plain = sampleCsv.replace(/^#.*\n/, "");
    const imported = openLog("april-agent-log.csv", plain, SAMPLE_PRICE_TABLE);
    assert.equal(imported.label, "import");
    assert.equal(imported.notice, null);
    assert.equal(
      sourceLabel(imported),
      "From your imported log · april-agent-log.csv · 12 rows",
    );
    assert.equal(summarizeAttempts(imported.rows).spendMicro, 34_600);
  });

  it("writes a review summary from those rows only", () => {
    const doc = summaryDocument(csv, summary, SAMPLE_PRICE_TABLE);
    assert.equal(doc.source, "Sample file — not a real log");
    assert.equal(doc.total_spend_usd, "0.034600");
    assert.equal(doc.cost_per_attempt_usd, "0.003145");
    assert.equal(doc.cost_per_successful_completion_usd, "0.005767");
    assert.equal(doc.retry_share_of_spend, "30.5%");
    assert.deepEqual(doc.incomplete_runs, ["run-3", "run-8"]);
    assert.deepEqual(doc.flagged_rows, [14]);
    const jsonText = summaryToJson(doc);
    assert.match(jsonText, /not a real log/);
    assert.match(jsonText, /0\.034600/);
    const csvText = summaryToCsv(doc);
    assert.match(csvText, /0\.005767/);
    assert.match(csvText, /Row 14 has an empty run_id/);
  });
});

describe("import validation", () => {
  it("leaves blank costs out of the rates until a price exists", () => {
    const opened = openLog("sample-agent-log.csv", sampleCsv, []);
    const summary = summarizeAttempts(opened.rows);
    assert.deepEqual(opened.unpricedModels, ["meter-a", "meter-b"]);
    assert.equal(summary.pricedAttempts, 9);
    assert.equal(summary.flaggedRows, 3);
    assert.deepEqual(summary.flaggedRowNumbers, [4, 8, 14]);
    assert.equal(summary.spendMicro, 27_800);
    assert.equal(opened.rows.find((row) => row.attemptId === "a2")?.included, false);
    assert.equal(opened.rows.length, 12);
  });

  it("does not drop a row that repeats an attempt id", () => {
    const text = [
      "run_id,timestamp,model,input_tokens,output_tokens,cost_usd,success,attempt_id",
      "run-1,2026-04-11T15:00:00Z,meter-a,10,1,0.001000,true,a1",
      "run-2,2026-04-11T15:01:00Z,meter-a,10,1,0.002000,false,a1",
    ].join("\n");
    const opened = openLog("dup.csv", text, []);
    assert.equal(opened.rows.length, 2);
    assert.equal(opened.rows[1]?.included, false);
    assert.match(opened.rows[1]?.errors[0]?.message ?? "", /Row 3/);
    assert.equal(summarizeAttempts(opened.rows).pricedAttempts, 1);
    assert.equal(summarizeAttempts(opened.rows).spendMicro, 1000);
  });

  it("counts an unknown retry target and keeps the row", () => {
    const text = [
      "run_id,timestamp,model,input_tokens,output_tokens,cost_usd,success,retry_of,attempt_id",
      "run-9,2026-04-11T15:00:00Z,meter-a,10,1,0.001000,false,missing,a1",
    ].join("\n");
    const opened = openLog("retry.csv", text, []);
    assert.equal(opened.rows[0]?.included, true);
    assert.equal(opened.rows[0]?.warnings.length, 1);
    assert.match(opened.rows[0]?.warnings[0]?.message ?? "", /Row 2/);
    const summary = summarizeAttempts(opened.rows);
    assert.equal(summary.retryAttempts, 1);
    assert.equal(summary.spendMicro, 1000);
    assert.equal(summary.retrySpendMicro, 1000);
    assert.equal(formatShare(summary.retryShare), "100.0%");
  });

  it("treats a zero cost_usd as a real zero", () => {
    const text = [
      "run_id,timestamp,model,input_tokens,output_tokens,cost_usd,success",
      "run-1,2026-04-11T15:00:00Z,meter-a,10,1,0,true",
    ].join("\n");
    const opened = openLog("zero.csv", text, []);
    assert.equal(opened.rows[0]?.included, true);
    assert.equal(opened.rows[0]?.resolvedCostMicro, 0);
    const summary = summarizeAttempts(opened.rows);
    assert.equal(summary.spendMicro, 0);
    assert.equal(summary.completions, 1);
    assert.equal(summary.costPerCompletion, 0);
    assert.equal(formatDollars(summary.costPerCompletion), "$0.000000");
  });

  it("flags every data row when a required column is missing", () => {
    const text = ["run_id,timestamp,model,input_tokens,output_tokens", "run-1,2026-04-11T15:00:00Z,meter-a,10,1"].join(
      "\n",
    );
    const opened = openLog("short.csv", text, []);
    assert.equal(opened.rows.length, 1);
    assert.equal(opened.rows[0]?.included, false);
    assert.match(opened.fileIssues[0]?.message ?? "", /success/);
    assert.equal(summarizeAttempts(opened.rows).pricedAttempts, 0);
  });

  it("reports a JSON file that cannot be parsed", () => {
    const opened = openLog("broken.json", "{", []);
    assert.equal(opened.rows.length, 0);
    assert.match(opened.fileIssues[0]?.message ?? "", /parsed/);
  });

  it("accepts the empty templates", () => {
    const csv = openLog("attempt-log-template.csv", templateCsv, []);
    const json = openLog("attempt-log-template.json", templateJson, []);
    assert.equal(csv.label, "import");
    assert.equal(csv.rows.length, 0);
    assert.equal(csv.fileIssues.length, 0);
    assert.equal(json.rows.length, 0);
    assert.equal(json.label, "import");
    assert.equal(summarizeAttempts(csv.rows).costPerAttempt, null);
  });
});

describe("quoted csv fields", () => {
  it("keeps a quoted field that spans lines and flags the next record by its start line", () => {
    const text = [
      "run_id,timestamp,model,input_tokens,output_tokens,cost_usd,success,attempt_id",
      '"run-1",2026-04-11T15:00:00Z,"line one',
      '# not a comment',
      'line two, still the model",8,1,0.004000,false,a1',
      "run-2,2026-04-11T15:03:00Z,meter-b,8,1,0.001000,maybe,a2",
    ].join("\r\n");
    const opened = openLog("multiline.csv", text, []);
    assert.equal(opened.rows.length, 2);
    assert.equal(opened.rows[0]?.rowNumber, 2);
    assert.equal(opened.rows[0]?.model, "line one\n# not a comment\nline two, still the model");
    assert.equal(opened.rows[0]?.included, true);
    assert.equal(opened.rows[0]?.resolvedCostMicro, 4000);
    assert.equal(opened.rows[1]?.rowNumber, 5);
    assert.equal(opened.rows[1]?.included, false);
    assert.ok(opened.rows[1]?.errors.some((issue) => issue.field === "success" && issue.rowNumber === 5));
    const summary = summarizeAttempts(opened.rows);
    assert.equal(summary.pricedAttempts, 1);
    assert.equal(summary.spendMicro, 4000);
    assert.equal(summary.flaggedRows, 1);
    assert.deepEqual(summary.flaggedRowNumbers, [5]);
  });

  it("keeps commas and doubled quotes inside fields", () => {
    const text = [
      "run_id,timestamp,model,input_tokens,output_tokens,cost_usd,success,retry_of,attempt_id",
      '"run,1",2026-04-11T15:00:00Z,"meter ""a""",100,10,0.005500,false,"id,0","a,1"',
      '"run,1",2026-04-11T15:01:00Z,"meter ""a""",100,10,0.002500,true,"a,1","a,2"',
    ].join("\n");
    const opened = openLog("commas.csv", text, []);
    assert.equal(opened.rows.length, 2);
    assert.equal(opened.rows[0]?.runId, "run,1");
    assert.equal(opened.rows[0]?.model, 'meter "a"');
    assert.equal(opened.rows[0]?.attemptId, "a,1");
    assert.equal(opened.rows[0]?.retryOf, "id,0");
    assert.equal(opened.rows[1]?.retryOf, "a,1");
    assert.equal(opened.rows.every((row) => row.included), true);
    const summary = summarizeAttempts(opened.rows);
    assert.equal(summary.pricedAttempts, 2);
    assert.equal(summary.spendMicro, 8000);
    assert.equal(summary.completions, 1);
    assert.equal(summary.retryAttempts, 2);
    assert.equal(summary.retrySpendMicro, 8000);
    assert.equal(summary.flaggedRows, 0);
  });
});

describe("large synthetic log", () => {
  it("bills every generated row and still flags the bad one", () => {
    const count = 10_000;
    const lines = ["run_id,timestamp,model,input_tokens,output_tokens,cost_usd,success,attempt_id"];
    for (let index = 0; index < count; index += 1) {
      if (index === 4_999) {
        lines.push(",2026-04-11T15:00:00Z,meter-a,10,1,0.001000,true,bad");
        continue;
      }
      lines.push(`run-${index},2026-04-11T15:00:00Z,meter-a,10,1,0.001000,true,a${index}`);
    }
    const opened = openLog("large.csv", lines.join("\n"), []);
    assert.equal(opened.rows.length, count);
    const summary = summarizeAttempts(opened.rows);
    assert.equal(summary.pricedAttempts, count - 1);
    assert.equal(summary.flaggedRows, 1);
    assert.deepEqual(summary.flaggedRowNumbers, [5001]);
    assert.equal(summary.spendMicro, (count - 1) * 1000);
    assert.equal(summary.completions, count - 1);
    assert.equal(opened.rows.filter((row) => row.included).length, count - 1);
  });
});
