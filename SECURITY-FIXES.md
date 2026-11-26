# Security & quality fixes applied

This branch (`arena/038afbd5-aether-lms`) addresses the review findings. Nothing
has been committed or pushed. Summary of what changed and what you still need
to do by hand.

## Status of verification

| Check | Result |
| --- | --- |
| `pnpm run typecheck` | ✅ passes (all workspace projects) |
| `pnpm test` | ✅ 22 tests pass |
| `pnpm --dir artifacts/api-server run build` | ✅ builds |
| `node --check` on kiosk shell | ✅ parses |
| `drizzle-kit generate` | ✅ no schema drift |
| JWT guard in production | ✅ refuses to boot without a 32+ char secret |

---

## 1. Database dump removed from the repository (⚠️ needs your action)

- Deleted `dump-aether_lms-202604231026.sql` (2,375 real student records + an
  admin password in plaintext).
- Added `*.sql` / `*.dump` / `*.pgsql` to `.gitignore` (with an exception for
  `scripts/fixtures/`).
- Added a CI job that fails if a dump is ever committed again.

**This does NOT remove it from Git history.** The file is in the repository's
only commit (`49477fd`), and **the GitHub repo is public**. See
"Rewriting history" below.

## 2. Authentication & authorization

- `src/middlewares/auth.ts` — one shared `requireAdmin`, plus `requireSuperAdmin`.
  **The role now comes from the verified JWT only**; the client-controlled
  `x-admin-role` header is ignored (it allowed any librarian to act as a
  super_admin).
- `src/lib/config.ts` — `JWT_SECRET` is validated once at startup. Production
  refuses to boot with a missing or short secret (verified).
- `routes/admin.ts` — reset / verify-secret / first-setup are rate limited,
  compare the recovery code with a timing-safe comparison, and store it
  **hashed**. `first-setup` is disabled unless `SETUP_CODE` is set (no default).
- `routes/admins-mgmt.ts` — every mutation requires `super_admin` from the token;
  cannot demote or delete the last super_admin.
- `lib/db/src/schema/admins.ts` — added the missing `secret_code` column (it was
  being written through `as any` casts that silently dropped the value).

## 3. Password handling

- bcrypt hashing is centralised; **legacy plaintext rows are re-hashed
  automatically on the next successful login**.
- Minimum password length raised from 4 to 8 everywhere (server + admin form).
- `POST /sessions/change-password` no longer accepts a bare `studentId`. It
  requires the current password **or** an active session token — except for
  accounts still on their default password (`mustChangePassword`), which keeps
  the kiosk's "set my first password" flow working.
- The kiosk first-login change now sends the session token.

## 4. Other correctness

- `routes/sessions.ts` — login is now transactional with `FOR UPDATE` row locks,
  fixing concurrent duplicate sessions. Backed by two partial unique indexes in
  `lib/db/drizzle/0001_session_invariants.sql`.
- `routes/health.ts` — performs `SELECT 1`; returns 503 when the DB is down.
- `routes/admin.ts` — `available` PC count can no longer go negative.
- `index.ts` — no more `admin`/`admin123` default. Credentials come from the
  environment; in development a random password is printed once.
- `app.ts` — the `sendBeacon` shim applies only to the logout route, caps body
  size, and no longer buffers unbounded input.
- `analytics.ts` — the AI call has a 20s timeout and reports upstream errors.
- Removed dead code: `emergencyPin` (never read) and the duplicated
  `did-fail-load` handler.

## 5. Electron kiosk

- Main and badge windows now use `contextIsolation: true`, `nodeIntegration:
  false`, `sandbox: true`. The badge talks through the shared preload bridge.
- `setWindowOpenHandler` only opens `http:`/`https:` links.

## 6. Developer experience

- `README.md`, `.env.example`, and `SECURITY-FIXES.md`.
- `pnpm test` (vitest) with 22 tests for auth, rate limiting and settings.
- `pnpm db:generate` / `pnpm db:migrate`; committed migrations.
- Seed script no longer points at a missing file; ships a fictional fixture and
  hashes default passwords.
- `package.json` no longer contains hard-coded DB credentials or the
  Windows-only `taskkill` start script.
- Regenerated the OpenAPI client and fixed `lib/api-zod/src/index.ts`
  ambiguous exports (it did not typecheck before).
- Untracked regenerable output (`lib/*/dist`, `api-server/public/assets`,
  `electron-extracted`).

---

## Still needs a human

### Rotate everything the public dump exposed

1. The admin password (`AdminTest` / the password in the dump) — assume it is
   compromised.
2. All student passwords. They were cleartext and equal to the student ID.
   With the new login-time rehash, students who log in are upgraded, but a
   forced reset is safer.
3. `JWT_SECRET`, `SETUP_CODE`, `MASTER_ADMIN_PASSWORD`.

### Rewriting history (I did not do this — it rewrites `main`)

The dump exists in `49477fd` on the **public** `main`. Removing it from the
working tree is not enough; it stays in the Git history and is downloadable from
GitHub until the history is rewritten. Options:

```bash
# A. Purge the file from all history (requires a local clone + force push)
git clone https://github.com/illyayuuki-ops/aether-lms.git
cd aether-lms
pip install git-filter-repo
git filter-repo --path dump-aether_lms-202604231026.sql --invert-paths
git push --force --all
git push --force --tags
```

Then ask GitHub Support to purge the cached commit, and tell anyone who cloned
the repo to re-clone. Force-pushing `main` is why I left this to you.

If the project does not need public visibility, make the repository private
first — that immediately stops anonymous downloads, though the history still
contains the data.

### Apply the schema change to a live database

```bash
pnpm db:migrate   # applies 0000 + 0001 (adds admins.secret_code + indexes)
```

If an existing database already has duplicate active sessions, the unique
indexes in `0001` will fail — run the cleanup query at the top of that file
first.
