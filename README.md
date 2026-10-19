# The Second Meter

Live: https://second-meter.vercel.app

A cost review for an imported agent log. Each row is one attempt. The page bills **cost per successful completion**: every priced miss stays in the spend, and only runs that succeed sit in the denominator.

Nothing leaves the browser. There is no API key, no backend, and no call to a model vendor. The opening screen is empty until you import a file.

## Run it

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:41731](http://localhost:41731).

`npm test` locks the imported-log math and the scripted sample draw. `npm run lint` and `npm run build` are the other checks.

Production deploy steps are in [DEPLOY.md](DEPLOY.md). The Vercel project is `second-meter` on team `amys-projects-d3dfb125`. Deploy from this directory with the CLI. No API keys.

## Import a log

Use **Import CSV or JSON**, or download a template and fill it in.

| Column | Required | Meaning |
| --- | --- | --- |
| `run_id` | yes | The task. Several attempts can share one id. |
| `timestamp` | yes | When the attempt happened. |
| `model` | yes | Model name, used to look up the price table. |
| `input_tokens` | yes | Non-negative integer. |
| `output_tokens` | yes | Non-negative integer. |
| `cost_usd` | no | Dollar amount. When it is blank, the price table prices the row. |
| `success` | yes | `true` or `false`. |
| `retry_of` | no | `attempt_id` of the attempt this row retries. |
| `latency_ms` | no | Non-negative integer. |
| `attempt_id` | no | Stable id for `retry_of`. Blank cells become `row-<line>`. |

Row numbers are file line numbers for CSV (the header counts) and 1-based positions in the JSON `rows` array. A bad row is listed by that number and left out of the rates. It is not dropped from the ledger.

The log, the price table, and the sample-data switch are stored in `localStorage` under `second-meter-import-v1`. **Remove log** clears the file. **Export summary JSON** and **Export summary CSV** download a review you can attach elsewhere.

```
total spend = sum of priced rows
cost per attempt = total spend / priced rows
cost per successful completion = total spend / run_ids that have a success
retry share = spend of rows with retry_of / total spend
incomplete runs = run_ids whose priced rows never succeed
```

`cost_usd` wins when it is present, including zero. A blank `cost_usd` uses dollars per million tokens from the price table:

```
cost = input_tokens × input rate / 1,000,000 + output_tokens × output rate / 1,000,000
```

## Sample file

`public/samples/sample-agent-log.csv` and the matching JSON are a **sample import**. The app labels them as a sample file. Those figures are not real usage and they are not the scripted classification draw.

With the sample price table (`meter-a` at $3 / 1M in and $15 / 1M out, `meter-b` at $1 / 1M in and $5 / 1M out) the file computes to:

| | |
| --- | --- |
| Rows | 12, of which row 14 is flagged |
| Priced attempts | 11 across meter-a and meter-b |
| Successful completions | 6 |
| Incomplete runs | 2 (`run-3`, `run-8`) |
| Retries | 3 |
| Spend | $0.034600 |
| Cost / attempt | $0.003145 |
| Cost / successful completion | $0.005767 |
| Retry share | 30.5% |

Two rows leave `cost_usd` blank on purpose (`a2`, `a6`). Importing the sample seeds those sample rates. A real file does not.

## Sample data toggle

**Sample data** is off by default. Turn it on to replay the old scripted classification of six local notes. That screen is labelled sample data. Its tokens, wall time, and dollars are simulated. They never become the imported-log rates.

On that draw the receipt still files at 9 model calls, 5 completions, 1 incomplete note, 3 retries, $0.110250 simulated spend, $0.012250 per attempt, $0.022050 per completion, and 41.7% retry share. **Back to import** returns to the log, which is empty until a file is loaded.
