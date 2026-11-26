# Aether LMS

Library PC-usage management for a school library: students log into a kiosk on
each library PC, librarians manage students, sessions, PCs and analytics from
an admin dashboard.

## Contents

| Path | What it is |
| --- | --- |
| `artifacts/api-server` | Express + Postgres API (also serves the built SPA in production) |
| `artifacts/library-system` | React admin dashboard **and** the student kiosk UI (Vite) |
| `artifacts/kiosk-electron` | Electron shell that locks a student PC into the kiosk |
| `lib/db` | Drizzle schema, migrations and seed script |
| `lib/api-spec` | OpenAPI spec + Orval config for generated clients |
| `lib/api-client-react`, `lib/api-zod` | Generated React Query hooks and Zod schemas |
| `scripts` | Build/env/install helpers and PowerShell setup scripts |

## Quick start

```bash
# 1. Install (pnpm only)
corepack enable
pnpm install

# 2. Configure
cp .env.example .env          # then fill in DATABASE_URL + JWT_SECRET

# 3. Create the schema and (optionally) sample data
pnpm db:migrate               # preferred: applies committed SQL migrations
# pnpm db:push                # alternative: push schema directly (dev only)
pnpm db:seed                  # imports scripts/fixtures/students-sample.sql

# 4. Run API (:3000) and web (:5173, proxying /api → :3000)
pnpm dev
```

Open <http://localhost:5173>. On an empty database the API prints the seeded
super-admin credentials to the console on first boot (see *Environment* below).

### Production build

```bash
pnpm build:production   # web build → copied into api-server/public → server bundle
pnpm --dir artifacts/api-server start
```

## Environment

See `.env.example` for the full list. The important ones:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | **production** | 32+ chars. `openssl rand -hex 32`. Server refuses to start in production without it |
| `MASTER_ADMIN_USERNAME` / `MASTER_ADMIN_PASSWORD` | production | Initial super-admin, created once on an empty DB |
| `SETUP_CODE` | no | Enables `POST /api/admin/auth/first-setup`; disabled when unset |
| `CORS_ORIGINS` | no | Comma-separated allowlist; blank mirrors any origin |
| `ANTHROPIC_API_KEY` | no | Enables the AI insights card on Analytics |

## Database

`lib/db/src/schema/*` is the source of truth.

```bash
pnpm db:generate   # write a new SQL migration from schema changes
pnpm db:migrate    # apply pending migrations
```

Commit the generated files in `lib/db/drizzle/`. Do **not** use `db:push`
against a database that holds real data.

### Seeding

`pnpm db:seed` reads a `pg_dump`-style SQL file. It defaults to the fictional
`scripts/fixtures/students-sample.sql`; point it at your own export with
`SEED_SQL_FILE=/path/to/students.sql`. Imported students get a bcrypt hash of
their student ID as the default password and are forced to change it on first
login.

> **Never commit a real database dump.** Student names, IDs and credentials are
> personal data. `.gitignore` blocks `*.sql` by default.

## Testing

```bash
pnpm test                                  # everything
pnpm --dir artifacts/api-server test       # API unit tests (vitest)
```

## Security notes

- Admin JWTs are verified server-side; roles come from the signed token, never
  from a request header.
- Student and admin passwords are bcrypt-hashed. Legacy plaintext rows are
  re-hashed automatically on the next successful login.
- Credential endpoints (`login`, `register`, `change-password`, account
  recovery) are rate limited per client IP.
- Kiosk windows run with `contextIsolation`, no Node integration and the
  Electron sandbox enabled.

## License

MIT
