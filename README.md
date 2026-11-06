# Aether LMS

Library PC management for a school LAN: a full-screen **student kiosk**, an **admin panel**
(dashboard, live sessions, session history, students, admins, analytics, settings), an **API server**,
and an optional **Electron kiosk shell** for Windows student PCs.

> **Before changing anything, read [`docs/issue-tracker.md`](docs/issue-tracker.md).**
> It records the known problems, what each function is *supposed* to do, the rules we've agreed on,
> and the phase-ordered plan. Run `pnpm audit:code` to see whether the count of known anti-patterns
> has grown.
>
> **Building reports or a school analysis paper?** Read
> [`docs/reporting-gaps.md`](docs/reporting-gaps.md) first — it lists which research questions the
> system can and cannot answer today, the report catalogue to add, and the schema changes needed.

## Layout

| Path | What it is |
|---|---|
| `artifacts/api-server` | Express 5 API (sessions, students, admins, analytics, kiosk SSE) + serves the built web app in production |
| `artifacts/library-system` | React 19 + Vite + Tailwind web app (kiosk at `/`, admin panel at `/admin`) |
| `artifacts/kiosk-electron` | Electron shell for student PCs (kiosk lockdown, floating session badge, remote lock via SSE) |
| `lib/db` | Drizzle schema + migrations |
| `lib/api-spec` | OpenAPI spec — **currently out of date**, see OPS-07 in the tracker |
| `lib/api-zod`, `lib/api-client-react` | Generated zod validators and react-query hooks |
| `scripts` | Install/build/packaging scripts and `audit.mjs` |
| `docs` | Issue tracker, reporting-gaps analysis, audit baseline |

## Run it locally

Prerequisites: Node 20+, pnpm 9+, PostgreSQL running locally with a database named `aether_lms`.

```bash
pnpm install

# 1. environment — see the "Environment" table below
cp .env.example .env      # (create it from the table; there is no committed example yet — OPS-08)

# 2. schema + first admin
pnpm db:push
pnpm db:seed

# 3. API on :3000, web on :5173 (proxies /api → :3000)
pnpm dev
```

Open `http://localhost:5173` for the kiosk and `http://localhost:5173/admin` for the panel.

> On Windows, `pnpm start` kills every Node process on the machine first (`taskkill /F /IM node.exe`).
> Be aware of that before running it.

## Environment

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | db scripts, API | `pnpm dev` currently hard-codes a local URL — see OPS-03 |
| `PORT` | yes | API | Throws at boot if missing |
| `JWT_SECRET` | **yes in practice** | admin + kiosk auth | Currently falls back to a public string (SEC-05) — set it |
| `MASTER_ADMIN_PASSWORD` | **yes in practice** | boot seed | Defaults to `admin123` (SEC-05) |
| `SETUP_CODE` | no | first-run setup | Defaults to a public constant (SEC-05) |
| `ANTHROPIC_API_KEY` | no | AI insights | Without it the analytics screen says AI is unavailable |
| `NODE_ENV` | no | API | `production` serves the built frontend from `api-server/public` |

Student PCs read `config.default.json` (copied to `%APPDATA%/Aether LMS Kiosk/config.json`):
`serverUrl` (the admin PC's LAN IP), `autoLaunch`, `emergencyPin` (see SEC-03).

## Production build

```bash
pnpm build:production   # web → api-server/public, then API bundle, then the Windows kiosk installer
```

The kiosk installer is written to `artifacts/kiosk-electron/release/`. Windows helper scripts live in
`scripts/` (`setup-database.ps1`, `setup-admin-pc.ps1`, `start-server.ps1`, `build-all.ps1`).

## Working on this repo

```bash
pnpm typecheck       # tsc across libs + artifacts
pnpm audit:code      # anti-pattern counts vs docs/audit-baseline.json
pnpm audit:code -- --strict   # fail if any rule got worse (use in CI)
pnpm audit:code -- --update   # accept the current counts as the new baseline
```

When you fix a tracker entry: set its status to `fixed`, add a line to the changelog, and if the fix
removed one of the audited patterns run `pnpm audit:code -- --update` so the lower count becomes the
new floor. **Never** raise the baseline to make a failing gate pass — that is exactly the regression the
gate exists to catch.
