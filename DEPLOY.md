# Deploy The Second Meter

Direct Vercel deploy for team `amys-projects-d3dfb125`, project `second-meter`. Upload this directory with the Vercel CLI. Do not connect a Git repository and do not pass `vercel link --repo`.

Framework is Next.js (`next` 16.4.2 in `package.json`). `vercel.json` sets:

| Setting | Value |
| --- | --- |
| `framework` | `nextjs` |
| `installCommand` | `npm install` |
| `buildCommand` | `npm run build` (`next build`) |
| `outputDirectory` | omitted on purpose |

Vercel’s Next.js builder publishes the build itself. This app is not a static export: there is no `output: "export"` and no `out/` directory. Setting `outputDirectory` would override that builder and break production.

No API keys and no environment variables. Token counts, wall time, and dollar amounts in the app are simulated.

These commands were checked against Vercel CLI 64.5.0 help text. They were not run. Login or a token is required at deploy time.

## 1. Install and verify

From this directory:

```bash
npm install
npm test
npm run lint
npm run build
```

`npm test` checks the simulated receipt math. `npm run build` is the same command Vercel runs.

## 2. Authenticate

Use one of these. Do not commit the token.

Interactive login:

```bash
npx vercel login
```

Or a token for this run:

```bash
export VERCEL_TOKEN="paste-token-here"
```

Pass `--token "$VERCEL_TOKEN"` on every `npx vercel` command below when you use a token. The CLI also reads `VERCEL_TOKEN` from the environment.

## 3. Link the project

Team slug `amys-projects-d3dfb125`. Project name `second-meter`.

If the project is not on that team yet, create it first (still no deploy):

```bash
npx vercel project create second-meter --scope amys-projects-d3dfb125 --token "$VERCEL_TOKEN"
```

Link this directory to that project. This writes `.vercel/` locally. `.vercel/` is gitignored.

```bash
npx vercel link --yes --team amys-projects-d3dfb125 --project second-meter --token "$VERCEL_TOKEN"
```

## 4. Production deploy

```bash
npx vercel deploy --prod --yes --scope amys-projects-d3dfb125 --token "$VERCEL_TOKEN"
```

`--prod` targets production. `--yes` skips prompts. `--scope` keeps the deploy on `amys-projects-d3dfb125`. After a successful link, the CLI uses project `second-meter`.

Omit `--token "$VERCEL_TOKEN"` when you authenticated with `npx vercel login` instead.
