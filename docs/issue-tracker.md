# Aether LMS — Problem & Anti-Pattern Tracker

> **What this is.** A register of *real* problems found by reading the code, and — more importantly —
> the **purpose each function is supposed to serve**, so we can tell when something is doing the wrong
> job. Every entry says *what it does now*, *what it is supposed to do*, and *why the difference matters*.
>
> **Scope audited:** 103 source files — `artifacts/api-server`, `artifacts/library-system`,
> `artifacts/kiosk-electron`, `lib/*`. Audit date: 2026-11-06, branch `arena/b00cd671-aether-lms`
> (commit `49477fd`).
>
> **Keep it alive:** `pnpm audit:code` runs an automated guard (`scripts/audit.mjs`) that counts these
> patterns so they can't silently come back. `pnpm audit:code -- --strict` fails if any rule got worse.
>
> **Reporting & research use** has its own companion file: [`reporting-gaps.md`](reporting-gaps.md)
> (`RPT-01` … `RPT-12`) — how to turn these tables into defensible reports for a school paper.

---

## 1. How to read this

| Field | Meaning |
|---|---|
| **ID** | Stable handle (`SEC-01`) — the audit script references these, so don't renumber. |
| **Severity** | `S1` = students lose data / anyone can become super admin. `S2` = wrong information shown to staff. `S3` = fragile, confusing, or misleading. `S4` = hygiene. |
| **Status** | `open` · `accepted` · `fixed` · `wontfix` |

**Status legend:** `accepted` = we know, it's a deliberate trade-off for now — add the reason in the entry.
Anything `open` at `S1`/`S2` should be in the current milestone.

### The one rule that covers most of this file

> **A function must only do the job its name and its screen promise.**
> If a button says "Lock All PCs", it locks all PCs. If a screen says "Session History", it shows all
> history. If an endpoint says `/register`, a student can register.
>
> Half of the entries below are a *promise* and an *implementation* that disagree. Users don't read code —
> they trust labels. A lying label is worse than a missing feature, because staff build workflows on it.

---

## 2. Findings at a glance

| ID | Severity | Area | Title | Status |
|---|---|---|---|---|
| [SEC-01](#sec-01) | **S1** | Auth | Any logged-in librarian can become Super Admin via a header | open |
| [SEC-02](#sec-02) | **S1** | Auth | Admin account recovery uses plaintext codes on a column that doesn't exist | open |
| [SEC-03](#sec-03) | **S1** | Kiosk | Kiosk escape PIN is shipped in plaintext to every student PC | open |
| [SEC-04](#sec-04) | **S1** | Auth | Two password systems (bcrypt + legacy plaintext) with no migration | open |
| [SEC-05](#sec-05) | **S2** | Auth | Three production secrets fall back to public constants | open |
| [SEC-06](#sec-06) | **S1** | Auth | Public `/register` and unauthenticated password change | open |
| [SEC-07](#sec-07) | **S2** | Network | Wildcard CORS + trust in a client-supplied IP header | open |
| [SEC-08](#sec-08) | **S2** | Auth | No rate limiting on any login endpoint | open |
| [LOG-01](#log-01) | **S1** | Sessions | Session ownership is bound to a PC, not to a student | open |
| [LOG-02](#log-02) | **S2** | Sessions | Unused PCs write nothing — reports under-report idle time | open |
| [LOG-03](#log-03) | **S1** | Sessions | Anyone who knows a Student ID can set that student's password | open |
| [LOG-04](#log-04) | **S2** | Sessions | Login has no lock — two students can claim one PC | open |
| [LOG-05](#log-05) | **S2** | Sessions | The sweeper always runs; there is no "automatic logout" off-switch | open |
| [LOG-06](#log-06) | **S2** | Sessions | Default passwords never force a change; the force-change flow is dead code | open |
| [LOG-07](#log-07) | **S3** | Sessions | `logoutReason` accepts any string; token check silently skipped when empty | open |
| [LOG-08](#log-08) | **S2** | Reports | Exports silently cap at 50 rows *(→ [RPT-03](reporting-gaps.md))* | open |
| [PURP-01](#purp-01) | **S2** | Kiosk UI | "Student Registration" screen registers nothing | open |
| [PURP-02](#purp-02) | **S2** | Admin UI | Both lock buttons lie about what they lock | open |
| [PURP-03](#purp-03) | **S3** | Admin UI | 869-line duplicate kiosk page that is not routed anywhere | open |
| [PURP-04](#purp-04) | **S2** | Kiosk | Remote lock/unlock only works for the Electron shell | open |
| [PURP-05](#purp-05) | **S2** | Admin UI | "Session History" is decided by a URL string inside a shared component | open |
| [PURP-06](#purp-06) | **S3** | Admin UI | "Lock All" status is local state — it forgets and never confirms | open |
| [PURP-07](#purp-07) | **S3** | Reports | "Grade Level" filters a course/degree column *(→ [RPT-04 §4](reporting-gaps.md))* | open |
| [PURP-08](#purp-08) | **S3** | Reports | AI insights silently degrade; model name is unverifiable | open |
| [PURP-09](#purp-09) | **S2** | Ops | Student import loads a library from the public internet | open |
| [PURP-10](#purp-10) | **S2** | Data | Deleting a student leaves their session running | open |
| [REL-01](#rel-01) | **S2** | Reliability | 12 swallowed errors; settings save can fail silently forever | open |
| [REL-02](#rel-02) | **S2** | Reliability | Two sources of truth for the number of PCs | open |
| [REL-03](#rel-03) | **S2** | Reliability | Client and server disagree on what "inactivity" means | open |
| [REL-04](#rel-04) | **S2** | Reliability | Settings live in a JSON file, not the database | open |
| [REL-05](#rel-05) | **S2** | Reliability | Server clock is the only clock — a wrong PC clock breaks sessions | open |
| [REL-06](#rel-06) | **S3** | Reports | "Week"/"Month"/"Today" are rolling windows in local time *(→ [RPT-10](reporting-gaps.md))* | open |
| [REL-07](#rel-07) | **S2** | Build | Deployed frontend is a committed build artifact, not built source | open |
| [REL-08](#rel-08) | **S3** | Reliability | No render error boundary — one exception blanks the kiosk | open |
| [OPS-01](#ops-01) | **S3** | Frontend | Dashboard polls by hand while react-query retries underneath | open |
| [OPS-02](#ops-02) | **S3** | API | Two implementations of the same analytics endpoint | open |
| [OPS-03](#ops-03) | **S2** | Ops | Database password hard-coded in `package.json` | open |
| [OPS-04](#ops-04) | **S3** | Repo | 94 generated files and a full DB dump are committed | open |
| [OPS-05](#ops-05) | **S3** | UX | Password policy is 6 characters on the kiosk and 4 in the API | open |
| [OPS-06](#ops-06) | **S3** | Types | 30 `as any` casts hide schema drift | open |
| [OPS-07](#ops-07) | **S3** | Docs | OpenAPI spec describes endpoints that don't exist and misses those that do | open |
| [OPS-08](#ops-08) | **S3** | Process | No tests, no CI, no README, no `.env.example` | open |

---

## 3. Security — *who is allowed to do what*

### SEC-01
**Any logged-in librarian can become Super Admin by sending a header.** · `S1` · open

- **Where:** `artifacts/api-server/src/routes/admins-mgmt.ts:45-49`, `:71`, `:110`, `:157`;
  client side `artifacts/library-system/src/hooks/use-auth.ts:28`
- **Now:** `getCallerRole()` ignores the database and returns `req.adminRole`, which `requireAdmin`
  fills straight from the `x-admin-role` request header. The client sets that header from
  `localStorage.admin_role` — a value the user can edit in DevTools.
- **Purpose it should serve:** *Only a Super Admin may create, edit, or delete admin accounts.*
  Authorization must come from the **signed JWT that `requireAdmin` already verified**, or from the DB row.
- **Repro:** log in as `librarian`, open console, set
  `localStorage.admin_role = "super_admin"`, reload → the Admin Accounts screen now creates admins.
- **Also:** the comment above the function claims it looks up the role by `x-caller-username`. **No such
  header is ever read and no DB lookup happens** — the comment documents behaviour that was never built.
  And `isSuperAdminProtected()` reads `x-protect-super-admins` from the *same* untrusted headers, so the
  only guard against deleting the last Super Admin is also client-controlled.
- **Fix:** delete `getCallerRole`; use `req.adminRole` **as set by `jwt.verify`**. Never read role or
  protection flags from headers. Add a DB check so the last active `super_admin` can't be deleted.

### SEC-02
**Admin recovery codes are plaintext, in an undocumented column, with a public default.** · `S1` · open

- **Where:** `routes/admin.ts:456-490`, `routes/admin.ts:525`, `routes/admins-mgmt.ts:19,27,101,144`,
  `lib/db/src/schema/admins.ts` (no `secretCode`), `dump-…sql` (no `secret_code` column)
- **Now:** `/auth/verify-secret` and `/auth/reset-password` compare `admin.secretCode !== secretCode`
  using `as any` reads. The drizzle schema has **no `secretCode` field**, so the value is written through
  a cast. In the committed database dump the column does not exist at all.
- **Purpose it should serve:** *A librarian who forgets their password can prove ownership with a private
  recovery code and set a new one — without another admin's help.*
- **Why it matters:** as written, any admin who creates another admin supplies that admin's recovery code
  (`admins.tsx:117` makes it **required**). A Super Admin therefore knows every librarian's reset secret.
  Two unauthenticated, unthrottled endpoints later and they hold the account. Store codes **hashed**
  (bcrypt, same as passwords), add the column to the schema, and never let one admin set another's code.
- **Related:** `/auth/first-setup` is still live even though `index.ts` seeds `admin` / `admin123` on
  boot. On a fresh install the seeded account always exists, so first-setup always returns 409 — the
  screen is dead, but the code path (and its default `setup-aether-2024`) is live.

### SEC-03
**Kiosk escape PIN ships in plaintext to every student PC.** · `S1` · open

- **Where:** `artifacts/kiosk-electron/config.default.json:3` → `"emergencyPin": "260306"`,
  packaged via `extraResources` in `kiosk-electron/package.json`
- **Now:** the PIN is on disk in an installer resource students can open in Notepad.
- **Purpose it should serve:** *A librarian can leave fullscreen/kiosk mode for maintenance without
  uninstalling anything.* It is a break-glass credential, not a public setting.
- **Why it matters:** the entire point of the kiosk shell is that students cannot reach the desktop.
  A PIN in a readable file converts that control into a speed bump. Also, the current `main.js`
  **never reads `emergencyPin`** — the config value is dead weight that only leaks.
- **Fix:** remove it from the shipped config, or store a hash and verify server-side. Document the
  documented recovery path (`Ctrl+M` per the admin sidebar) so it is deliberate rather than secret.

### SEC-04
**Two password systems with no migration plan.** · `S1` · open

- **Where:** `routes/admin.ts:24-32`, `routes/sessions.ts:16-25` (`verifyPassword`),
  `lib/db/src/schema/students.ts:10-14`
- **Now:** `verifyPassword()` accepts bcrypt **or** falls through to `plain === stored`. Student creation
  hashes with bcrypt, but the schema comment still says *"Password is stored as plain text for now"*, and
  the dump's default is `''`. An empty stored hash means an empty password authenticates.
- **Purpose it should serve:** *A password is stored one way and verified one way.*
- **Why it matters:** the fallback exists for legacy rows, but nothing ever migrates them — so the
  insecure path is permanent. Worse, `''` (the column default) is the weakest possible plaintext value.
- **Fix:** one-time backfill script (rows whose `password` isn't a bcrypt hash → bcrypt of a forced reset
  value, with `mustChangePassword = true`), then delete the plaintext branch and the stale comment.

### SEC-05
**Three production secrets default to public constants.** · `S2` · open

| Secret | Fallback | Effect if env is unset |
|---|---|---|
| `JWT_SECRET` | `library-jwt-secret-change-me` (`admin.ts:35`, `admins-mgmt.ts:11`, `kiosk.ts:6`) | **Anyone can forge an admin token.** Three copies of the constant, three places to forget. |
| `MASTER_ADMIN_PASSWORD` | `admin123` (`index.ts:16`) | Well-known Super Admin on every fresh install. |
| `SETUP_CODE` | `setup-aether-2024` (`admin.ts:496`) | First-run takeover of an uninitialised install. |

- **Purpose it should serve:** *A missing secret is a configuration error, not a default.*
- **Fix:** validate required env at boot and **refuse to start** (fail loud, not open). Import one
  `config.ts` instead of three copies of the same constant.

### SEC-06
**Public endpoints that change accounts.** · `S1` · open

- **`POST /api/sessions/register`** (`sessions.ts:84-114`) — **no authentication at all**. Anyone on the LAN
  can create a student account for any unused ID. The kiosk UI never calls it (the "registration" screen
  uses `/change-password` instead), so it is a **dead public write endpoint** — the worst combination.
- **`POST /api/sessions/change-password`** (`sessions.ts:342-365`) — needs only a Student ID and the new
  password. See [LOG-03](#log-03).
- **Purpose it should serve:** *Account creation is a librarian action; password change requires proof of
  the old password or an authenticated session.*
- **Fix:** delete `/register` (the import + admin Students screen already cover it), or put it behind
  `requireAdmin`. Require `currentPassword` **or** a valid `sessionToken` on change-password.

### SEC-07
**Wildcard CORS and a client-supplied IP.** · `S2` · open

- **Where:** `app.ts:44` `app.use(cors())`; `routes/admin.ts:374-388` reads `?ip=` first, then
  `x-forwarded-for`
- **Now:** any website a student opens can call `http://<admin-pc>:3000/api/...` with `fetch()`. The
  PC-detection endpoint prefers an IP the caller passes in the query string.
- **Purpose it should serve:** *Only the library LAN should reach the API, and a PC's identity should be
  what the network says it is — never what the browser claims.*
- **Fix:** allow-list the kiosk/admin origins, and make PC detection use `req.socket.remoteAddress`
  (plus a trusted-proxy config) — with `?ip=` retained only for local debugging behind a flag.

### SEC-08
**No throttling on logins.** · `S2` · open

- **Where:** `/admin/login`, `/sessions/login`, `/auth/verify-secret`, `/auth/reset-password`
- **Now:** unlimited attempts. A 4-character student password (`min(4)` in `sessions.ts:44`) and a
  5-digit Student ID are brute-forceable in minutes on a LAN.
- **Purpose it should serve:** *Login is the one place slow is acceptable.*
- **Fix:** per-IP + per-account backoff (e.g. 5 fails → 60 s), log the failures, and raise the minimum
  password length ([OPS-05](#ops-05)).

---

## 4. Sessions — *the core function of the product*

> **The purpose of a session record:** answer, for any moment, *which student is on which PC since when,
> and how long did they get to use it.* Every defect here makes that sentence less true.

### LOG-01
**Session ownership is bound to a PC, not to a student.** · `S1` · open

- **Where:** `pages/kiosk/index.tsx:421-435` (detect PC by IP), `hooks/use-kiosk-session.ts:25-31`
  (session kept in `localStorage`), `hooks/use-kiosk-session.ts:96-112` (`beforeunload` → logout)
- **Now:** the kiosk stores the live session in `localStorage`. The server writes the session under
  `computerNumber` from IP detection. Four consequences:
  1. **No proof of presence.** After a student walks away *without* logging out (power cut, force-quit,
     `Ctrl+M`), the next student on that PC gets "This PC already has an active session" until the
     inactivity limit passes — while the original student keeps the PC "reserved".
  2. **A refresh ends the session — except the one path that was wired for it.** The `beforeunload`
     handler sends a logout beacon and wipes `localStorage`, and it skips both only when
     `kiosk_reload_in_progress` is set — which **only the Electron `Ctrl+R` handler ever sets**
     (`main.js:404`). So: Electron `Ctrl+R` keeps the session; a browser `F5`, or any other reload,
     logs the student out. And beacons are best-effort during unload: if it doesn't land, the server
     session survives *without* the local copy, and the PC answers "This PC already has an active
     session" until the idle limit expires. Neither outcome is what "Reload without ending session"
     implies (that hotkey hint is shown to admins in `admin-layout.tsx:130`).
  3. **Shared-profile machines leak sessions.** Anyone opening the kiosk URL on that PC inherits the
     stored session, including its `sessionToken`.
  4. **`computerNumber` is assumed, not verified.** It comes from an IP→PC table maintained by hand.
- **Purpose it should serve:** *A session belongs to a student for a bounded time on one PC, and the
  kiosk should be able to prove "this student is physically here".*
- **Fix (in order):** (a) the kiosk should always re-validate its stored session against
  `POST /sessions/heartbeat` on startup and drop it if the server says ended; (b) don't clear
  `localStorage` inside `beforeunload` unless the server confirmed; (c) add a per-PC "resume or end
  previous session" prompt instead of a blanket 409; (d) verify IP **on the server** for every
  session-bound call, not just at login.

### LOG-02
**Unused PCs record nothing.** · `S2` · open

- **Where:** `sessionsTable` only has `login_time` / `logout_time`.
- **Now:** reports can say "30 sessions, 40 hours used" but never "*PC 7 sat idle 6 of 8 hours*".
- **Purpose it should serve:** *Library staff need utilisation and ghost-session detection,* not only a
  login ledger. "Was this PC available?" is the question the dashboard implies it answers.
- **Fix:** add a `pc_events` / `pc_status` table (or an `availability` interval table) written by the
  sweeper and the kiosk's own presence heartbeat, so idle time is a fact rather than a subtraction.

### LOG-03
**Anyone who knows a Student ID can set that student's password.** · `S1` · open

- **Where:** `routes/sessions.ts:342-365` (`/change-password`), `pages/kiosk/index.tsx:228-252`
- **Now:** the "Forgot Password" panel only needs a Student ID — the same ID printed on a student card and
  visible on the PC next to yours. It then calls `/change-password` with no old password and no token.
- **Purpose it should serve:** *Only the student may change their password — proven by the old one or a
  live session.*
- **Why it matters:** a student can lock a classmate out of their account, then log in as them. Since the
  session log is the *only* record of PC use, that is also attendance fraud.
- **Fix:** require `currentPassword` (self-service path) or a valid `sessionToken` (in-session path);
  route genuine "forgot" through the librarian.

### LOG-04
**Login has no lock — two students can claim one PC.** · `S2` · open

- **Where:** `routes/sessions.ts:153-201`
- **Now:** "is this PC busy?" and "insert session" are separated by several awaits with no transaction or
  unique constraint. Two simultaneous logins on the same PC both pass the check.
- **Purpose it should serve:** *One PC, one active session, always.*
- **Fix:** a partial unique index — `UNIQUE (computer_number) WHERE is_active` (and
  `UNIQUE (student_id) WHERE is_active`) — and let the DB reject the loser. Also bounds [LOG-01](#log-01)'s
  "already logged in elsewhere" rule.

### LOG-05
**There is no way to turn off automatic logout.** · `S2` · open

- **Where:** `index.ts:66-70` `setInterval(sweepGhostSessions, 60_000)`, always on.
- **Now:** the sweeper closes every session idle past `inactivityLimitMinutes`, unconditionally.
- **Purpose it should serve:** *Settings exist so staff can decide policy.* Today the setting only changes
  the number, never whether the policy applies — and nothing in the Settings UI says so.
- **Fix:** add `autoLogoutEnabled` (+ a documented range) to system settings, honour it in the sweeper,
  and show the *next* sweep behaviour in the Settings screen so the librarian knows what will happen.

### LOG-06
**Default passwords never force a change.** · `S2` · open

- **Where:** `routes/students.ts:135-147` (`mustChangePassword: false` on create),
  `routes/sessions.ts:230` (returned on login), `pages/kiosk/index.tsx:439` (UI branch),
  `routes/students.ts:276` (`mustChangePassword` accepted but **no UI toggle** in `students.tsx`)
- **Now:** a student created by import or by the admin screen keeps `Student ID` as their password
  forever, because the flag is set to `false` at creation and nothing can set it to `true` from the UI.
- **Purpose it should serve:** *A first-time password is a one-time password.* The flow to enforce it is
  already written on the kiosk — it just can never trigger.
- **Fix:** set `mustChangePassword: true` when the password is the default (import + create), expose the
  toggle in the student edit dialog, and reset to `true` whenever a librarian resets a password.

### LOG-07
**`logoutReason` accepts anything; the token check can be skipped.** · `S3` · open

- **Where:** `routes/sessions.ts:239-292`
- **Now:** `reason` is written straight to the DB from the request body, and the guard is
  `if (session.sessionToken && session.sessionToken !== sessionToken)` — when the stored token is empty,
  **any** caller can close that session with any reason string. Report labels key off specific strings, so
  a typo silently becomes "Completed".
- **Purpose it should serve:** *`logoutReason` is an enum the reports depend on; the token is the only
  proof this logout is legitimate.*
- **Fix:** validate `reason` against `z.enum(["manual","inactivity","time_limit","admin"])` and make the
  token **mandatory** for student-initiated logout (with a separate admin-authorized path, see
  [PURP-11](#purp-11)).

### LOG-08
**Exports silently stop at 50 rows.** · `S2` · open

- **Where:** `pages/admin/sessions.tsx:243` (`limit: 50`), `:468` (`<ExportModal sessions={sessions} …>`)
- **Now:** the export modal receives the **current page**, not the query. "Export to PDF" for a semester
  produces 50 rows and the header still says the full semester. The `total` from the API is displayed but
  never compared.
- **Purpose it should serve:** *An export is a report of the filtered set — the thing a librarian signs.*
- **Why it matters:** a truncated report is indistinguishable from a complete one. This is the most likely
  path to a *wrong official record* in the whole system.
- **Fix:** export via a dedicated endpoint (or paginated loop) using the same filters, and show
  "Exporting 1,284 of 1,284" so the operator can verify the count.

---

## 5. Purpose mismatches — *the label says one thing, the code does another*

### PURP-01
**"Student Registration" registers nothing.** · `S2` · open

- **Where:** `pages/kiosk/index.tsx:281-292, 360, 376-379`
- **Now:** the screen says *"Student Registration — Set up your library account"*, and the button says
  *"Complete Registration"*. It calls `/api/sessions/change-password` — i.e. it **resets the password of an
  account that already exists**. A student not in the system sees *"Student ID not found. Please ask the
  librarian to add you first."* in the middle of a "Registration" screen.
- **Purpose it should serve:** either the screen is *"Activate your account"* (and says so), or it truly
  registers (and then [SEC-06](#sec-06) applies). Pick one.
- **Fix (recommended):** rename to **"First-time activation / Set my password"**, require the current
  default password, and drop the `/register` endpoint.

### PURP-02
**Both lock buttons lie.** · `S2` · open

| Control | Label | Actually does |
|---|---|---|
| Sidebar "Lock / Unlock this screen only" (`admin-layout.tsx:25-32`) | locks a screen | calls `window.aetherKiosk.lock/unlock` — in a normal browser that object is `undefined`, so it is a **silent no-op that still flips the button to "Locked"**; inside Electron it locks the *local* kiosk window, which is not "this screen" |
| Sidebar "Lock All PCs" (`admin-layout.tsx:34-48`) | locks every PC | POSTs `/api/kiosk/broadcast`; **students see nothing** unless they run the Electron shell ([PURP-04](#purp-04)); the button never checks the response, never reports `sent: 0` |

- **Purpose it should serve:** *A librarian closing the lab presses one button and knows every screen is
  locked — or is told exactly how many were not.*
- **Fix:** one control, real scope ("Lock all kiosks (12 connected)"), display `sent`/`total` from the
  response, and disable the local-only variant outside Electron (or label it "this PC").

### PURP-03
**A duplicate kiosk page nobody routes to.** · `S3` · open

- **Where:** `pages/admin/kiosk/index.tsx` (869 lines) — grepped: **zero imports, zero routes**.
  It is a divergent copy of `pages/kiosk/index.tsx` (901 lines) living under `admin/`.
- **Purpose it should serve:** one kiosk screen, one source of truth.
- **Why it matters:** every bug we fix in the real kiosk (LOG-06, PURP-01) exists again here, and the next
  developer may "fix" the wrong file. Delete it, or route it deliberately if it is a preview mode.

### PURP-04
**Remote lock/unlock only reaches the Electron shell.** · `S2` · open

- **Where:** `routes/kiosk.ts` (SSE `/events`), `kiosk-electron/src/main.js:234-258` (only consumer);
  `pages/kiosk/index.tsx` contains **no `EventSource`**.
- **Now:** "Lock All PCs" only affects PCs whose kiosk is the installed `.exe`. Any PC opened in a
  browser receives the broadcast and ignores it. The API's own `/kiosk/status` endpoint (which would tell
  the admin how many are listening) is **never called by the UI**.
- **Purpose it should serve:** *The lock is a safety control; it must not depend on which client the PC
  happens to run.*
- **Fix:** have the web kiosk subscribe to `/api/kiosk/events` too, show connected count in the admin
  sidebar, and surface `sent`/`total` after every broadcast.

### PURP-05
**"Session History" is a URL check inside a shared component.** · `S2` · open

- **Where:** `pages/admin/sessions.tsx:223` `const isHistoryPage = window.location.pathname.includes("history")`,
  routes in `App.tsx:41-42`
- **Now:** one component serves two routes; which data it shows depends on the pathname string.
  `window.location` is not reactive in wouter, so in-app navigation between the two routes can leave the
  wrong filter active until a full reload.
- **Purpose it should serve:** *The route decides the view.*
- **Fix:** two thin route wrappers (`<SessionsPage mode="active" />` / `mode="history"`) and drop the
  `window` read.

### PURP-06
**"Lock All" forgets its own state.** · `S3` · open

- **Where:** `admin-layout.tsx:22` `allLocked` is `useState(false)`
- **Now:** it resets on every navigation and on every reload, so the button flips back to "Lock All PCs"
  while the lab is still locked. There is no "current state" query.
- **Purpose it should serve:** *A control that says "Unlock All" should only say so because the PCs are
  actually locked.*
- **Fix:** track broadcast state server-side and return it from `/kiosk/status`.

### PURP-07
**"Grade Level" filters a course column.** · `S3` · open

- **Where:** `routes/admin.ts:146` (`gradeLevel` → `sessionsTable.degree`), API field names
  `byGradeLevel` / `gradeLevel`; UI label in `analytics.tsx` / `sessions.tsx`
- **Now:** the API calls it `gradeLevel`, stores `degree`, and the UI offers it as a course filter.
  `yearLevel` is a separate column. Three names for two concepts.
- **Purpose it should serve:** *Course (BSIT) and year level (3) are different questions; the report
  should not imply it can answer one while filtering the other.*
- **Fix:** settle on `degree` + `yearLevel` everywhere (schema, API, UI), keep a thin alias for one release.

### PURP-08
**AI insights fail in ways staff can't see.** · `S3` · open

- **Where:** `routes/analytics.ts:171-270`
- **Now:** with no `ANTHROPIC_API_KEY` it returns a helpful message — good. But when the key **is** set and
  the HTTP call fails or returns a non-200, the code still reads `aiData.content?.[0]?.text` and returns
  `"- No insights generated."` as if that were an insight. The model string `claude-haiku-4-5` is not
  validated anywhere, so a rename upstream turns the feature into a silent "No insights".
- **Purpose it should serve:** *An advisory feature may be unavailable — but it must say so, and never
  present a failure as a finding.*
- **Fix:** check `response.ok`, log the upstream error, surface "AI unavailable (HTTP 4xx)" and put the
  model name in config.

### PURP-09
**Student import needs the public internet.** · `S2` · open

- **Where:** `pages/admin/students.tsx:302`
  `await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs")`
- **Purpose:** *import a spreadsheet on a library PC, on a LAN, with no internet.*
- **Why it matters:** this is the onboarding path for hundreds of students. It fails (unhandled rejection →
  the import modal sits there) on exactly the isolated network the product is built for, and it violates
  the fixed-version supply-chain rule: the URL pins a version but not the bytes.
- **Fix:** add `xlsx` to `package.json`, bundle it, delete the remote import.

### PURP-10
**Deleting a student leaves the session running.** · `S2` · open

- **Where:** `routes/students.ts:290-308` — deletes the student row only.
- **Now:** the `sessions` table keeps its own copy of `name/degree/yearLevel` and a live `is_active` row,
  so a deleted student keeps a PC occupied until the sweeper fires, and their history stays forever
  (arguably correct — but unlabelled).
- **Purpose it should serve:** *"Remove student" ends their access now; their history is a separate,
  deliberate decision (archive vs delete).*
- **Fix:** on delete, close active sessions with reason `admin`; decide and document whether history is
  retained (recommended: keep, anonymise on request).

### PURP-11
**Force-logout from the admin screen uses the public logout endpoint.** · `S3` · open

- **Where:** `pages/admin/sessions.tsx:294-308`
- **Now:** the admin calls `/api/sessions/logout` with only a `Bearer` token the route never checks, sending
  `reason: "manual"`. So an *admin-initiated* end is recorded identically to a student tapping "End
  Session", and will break the moment [LOG-07](#log-07)'s token requirement is enforced.
- **Purpose it should serve:** *Reports should distinguish "student left" from "librarian ended it".*
- **Fix:** add `POST /api/admin/sessions/:id/force-logout` behind `requireAdmin`, write reason `admin`, and
  show that reason in the history export.

---

## 6. Reliability — *what breaks the purpose silently*

### REL-01
**12 swallowed errors.** · `S2` · open

- **Where:** run `pnpm audit:code` → `silent-catch`. Worst offenders:
  - `routes/admin.ts:346` — `saveSettings()` catches and discards. **The API returns
    `{ success: true }` even when the write failed**, so a librarian can change the inactivity limit, see a
    green toast, reboot, and get the old value back. *(Purpose: settings persist. They may not.)*
  - `routes/admin.ts:341` — `loadSettings()` discards a corrupt file and silently uses defaults, i.e. a
    truncated JSON file quietly resets the whole library policy.
  - `pages/admin/students.tsx:692` — deletes during import ignore `res.ok`, so a 403 counts as success and
    the toast still reports "N students removed".
- **Fix:** log + surface. For settings, write to a temp file and `rename` (atomic), return 500 on failure,
  and keep a `.bak` that is loaded if the primary is corrupt.

### REL-02
**Two sources of truth for the PC count.** · `S2` · open

- **Where:** `routes/admin.ts:37` `const TOTAL_COMPUTERS = 20` vs `settings.totalComputers`
  (`admin.ts:293,299`), plus `dashboard.tsx` caching `dashboard_total_pcs` in `localStorage`.
- **Now:** the dashboard, the kiosk grid, and the settings screen can each believe a different number of
  PCs exists. A PC above the count is silently missing from the grid while its session is live.
- **Purpose:** *the lab has one number of PCs, and every screen shows that number.*
- **Fix:** delete the constant; single settings read; derive the grid from `pc_settings` (the mappings
  table already knows which PCs exist).

### REL-03
**Client and server disagree about "inactivity".** · `S2` · open

- **Where:** client timer `hooks/use-kiosk-session.ts:150-170` (input events / OS idle), server sweeper
  `index.ts:42-64` (`last_activity`), server login recovery `routes/sessions.ts:159-185`.
- **Now:** three different opinions about when a student is idle:
  the client logs out on **browser** input; the server only sees `active: true` heartbeats; **Electron**
  injects OS-level idle time from `powerMonitor`, so a student watching a lecture video forever is "idle"
  by OS standards but never moves the mouse. Whichever fires first wins, and the recorded `logoutReason`
  differs depending on which one it was.
- **Purpose it should serve:** *one definition of idle, one place that enforces it.*
- **Fix:** server-owned policy (heartbeat carries `active`), with the client reduced to a *display* of the
  server's `remainingMinutes` — the API already returns it.

### REL-04
**Settings live in a JSON file, not the database.** · `S2` · open

- **Where:** `routes/admin.ts:307-349` (`SETTINGS_FILE = __dirname/../../system-settings.json`)
- **Now:** policies (inactivity limit, PC count, course list) are a file next to the build output. It is
  git-ignored, absent from the DB backup, incompatible with the settings-import that runs after an
  upgrade, and resolved by a path that differs between `tsx` (dev) and bundled `.mjs` (prod) — hence the
  legacy-file migration shim right above it.
- **Purpose it should serve:** *system policy is data, and data lives where it is backed up.*
- **Fix:** a `system_settings` table (single row, typed by zod on read/write) and a one-time import from
  the JSON file.

### REL-05
**The server clock is the only clock.** · `S2` · open

- **Where:** `sessions.loginTime` is computed **on the client** (`sessions.ts:197` `loginTime: new Date()`),
  while `heartbeat` computes elapsed time with the **server** clock (`sessions.ts:312`).
- **Now:** if a student PC's clock is off (very common on school images, and they are deliberately
  offline), a session can appear to start in the future or already expired. `remainingMinutes` can be
  negative-clamped to 0 for a fresh login.
- **Purpose it should serve:** *one clock (the server) owns all durations.*
- **Fix:** set `loginTime` server-side (`defaultNow()` already does it — stop passing it), and have the
  kiosk display server-provided times.

### REL-06
**Period names don't mean what they say.** · `S3` · open

- **Where:** `routes/admin.ts:199-213`, `routes/analytics.ts:10-22`
- **Now:** `week` = *the last 7 days*, `month` = *the last 30 days* (not the calendar month the UI's month
  picker implies), `today` = *midnight local server time*. `analytics/daily` builds its labels with
  `toISOString()` (`admin.ts:268`), which is UTC — so for UTC+8 (Manila) the chart's "today" is yesterday
  for 8 hours a day.
- **Purpose:** *when a librarian picks "this month", the number is for this month.*
- **Fix:** name the rolling options honestly (`Last 7 days`), and compute calendar buckets in a configured
  timezone (`Asia/Manila`) instead of `toISOString()`.

### REL-07
**The deployed frontend is a committed build.** · `S2` · open

- **Where:** `artifacts/api-server/public/assets/index-BWHRPgud.js` (tracked in git);
  production serving in `app.ts:54-76`; `build:server` copies `library-system/dist/public` there.
- **Now:** `NODE_ENV=production` serves whatever was last copied into `public/`. `pnpm dev` serves a *live*
  Vite build from `5173` instead. So the thing people test in dev and the thing installed on the admin PC
  are different builds, and the committed copy can be arbitrarily stale.
- **Purpose:** *what you test is what you ship.*
- **Fix:** build the web app during `build:server` only (never commit `public/assets`), add a
  version/hash banner to the admin footer so a stale install is obvious.

### REL-08
**No error boundary.** · `S3` · open

- **Where:** `App.tsx` — no `componentDidCatch` / `<ErrorBoundary>`.
- **Now:** any thrown render error (a bad date string, a null from an API) blanks the whole kiosk to a
  white screen. On a student PC nobody is there to reload it — the PC is simply dead until the next reboot.
- **Purpose:** *a kiosk must degrade to a usable "please ask the librarian" screen, never to white.*
- **Fix:** kiosk-specific error boundary that shows a reset button + auto-reload after N minutes.

---

## 7. Operations & hygiene

### OPS-01
**Hand-rolled polling under react-query.** · `S3` · open

- **Where:** `pages/admin/dashboard.tsx:121-130` (`setInterval` 30 s), `:55` and `:69` (raw `fetch` +
  `localStorage.getItem("admin_token")`), plus `App.tsx:19` sets `retry: false` globally.
- **Now:** the dashboard bypasses `useAdminAuth`/`authHeaders`, so a token refresh or logout leaves stale
  closures; and a global `retry: false` means a *transient* 500 shows "you have no data" — for the screen
  that reports the room's state.
- **Fix:** `refetchInterval: 30000` on the queries (dedupes across tabs), `retry: 2` for reads, and one
  fetch wrapper that reads headers from `useAdminAuth` instead of `localStorage` in five places.

### OPS-02
**Two `analytics/daily` implementations.** · `S3` · open

- **Where:** `routes/admin.ts:247-273` and `routes/analytics.ts` (the analytics router mounted at
  `/admin/analytics`). `admin.ts` also duplicates stats that `analytics.ts` computes differently
  (`averageDuration` vs `avgDurationMinutes`).
- **Purpose:** *one endpoint, one definition, one shape — the generated client can then describe it.*
- **Fix:** keep `analytics.ts`, delete the copy in `admin.ts`, update the UI call sites.

### OPS-03
**Database password in `package.json`.** · `S2` · open

- **Where:** `package.json:12,18,19` → `postgresql://postgres:030306@localhost:5432/aether_lms`
- **Purpose:** *credentials come from the environment, and the same repo works on any machine.*
- **Fix:** move to `.env` (add `.env.example`), read `DATABASE_URL` in the scripts, rotate the password.

### OPS-04
**Generated files are in the repo.** · `S3` · open

- **Where:** `git ls-files` → **94** files under `lib/*/dist`, `artifacts/api-server/public/assets`, plus
  `dump-aether_lms-202604231026.sql` (298 KB schema dump, ~1,800 lines; contains no student rows — good).
- **Purpose:** *generated output is rebuilt, not reviewed.* Committed `dist` makes a code review of
  `lib/api-client-react` meaningless (the `.d.ts` and the source can disagree).
- **Fix:** ignore `lib/*/dist` and `api-server/public/assets`, add a `git rm --cached` step, and move the
  dump to a `docs/schema/` reference with a dated README.

### OPS-05
**Password policy disagrees with itself.** · `S3` · open

- **Where:** kiosk forms require **6** (`pages/kiosk/index.tsx:52,60`), API requires **4**
  (`sessions.ts:44,49`, `students.ts:23`, `admins-mgmt.ts:18,26`), student ID format is fixed `YY-NNNNN`.
- **Purpose:** *the rule the user is shown is the rule the server enforces.*
- **Fix:** one exported `PASSWORD_MIN = 8` in a shared module used by zod **and** the forms.

### OPS-06
**30 `as any` casts hide schema drift.** · `S3` · open

- **Where:** `pnpm audit:code` → `any-cast`. Most are `secretCode`/`req.body` (a symptom of
  [SEC-02](#sec-02)) and `(req as any).adminRole` (a symptom of [SEC-01](#sec-01)).
- **Purpose:** *the compiler should be the first reviewer.* Every cast here marks a column or field that
  exists in one layer and not another.
- **Fix:** fix the schema and the casts disappear; add `noUncheckedIndexedAccess` and ban
  `@typescript-eslint/no-explicit-any` in CI.

### OPS-07
**The OpenAPI spec is fiction.** · `S3` · open

- **Where:** `lib/api-spec/openapi.yaml` vs `routes/`
- **Drift found:** spec declares `/sessions/active` (**no such route**),
  `/sessions/{sessionId}/heartbeat` (**real route is `/sessions/heartbeat` with `sessionId` in the body** —
  so the generated `useHeartbeat` client would 404), and it is missing `/sessions/register`,
  `/sessions/change-password`, `/admin/settings/*`, `/admin/analytics/*`, `/admin/computers`,
  `/admin/auth/*`, and the whole `/kiosk/*` router. `SessionRecord` exposes `researchTopic`, a column that
  nothing ever writes.
- **Purpose:** *the spec is the contract the generated zod validators and react-query hooks are built
  from.* When it drifts, the generated code is worse than useless — it type-checks while calling the wrong
  URL.
- **Fix:** generate the spec from the routers (or add a contract test that asserts every route in
  `routes/` appears in the spec). Regenerate on every API change.

### OPS-08
**No tests, no CI, no onboarding docs.** · `S3` · open

- **Now:** zero test files, no CI config, no `README.md`, no `.env.example`, no `docs/`. `start` script is
  Windows-only (`taskkill /F /IM node.exe`). The `bcrypt` and `jsonwebtoken` types are hand-written in
  `types.d.ts` instead of using `@types/*`.
- **Purpose:** *a new kiosk tech must be able to stand up the system, and a change must be able to fail
  on its own.*
- **Fix (smallest useful version):** `README` (prereqs → `db:push` → `db:seed` → `dev`, the 3 required env
  vars, the kiosk config file), `.env.example`, ~10 API tests for the session lifecycle + one for
  [SEC-01](#sec-01), and `pnpm audit:code --strict` as a CI gate (it needs no dependencies).

---

## 8. Suggested order of work

| Phase | Items | Why now |
|---|---|---|
| **P0 — stop the bleeding** (hours) | [SEC-01](#sec-01), [SEC-05](#sec-05), [SEC-03](#sec-03), [PURP-09](#purp-09), [REL-01](#rel-01) settings half | Fixable in isolation, no schema change, and each one is a *silent* failure or an outright bypass. |
| **P1 — protect students** (days) | [LOG-03](#log-03), [SEC-06](#sec-06), [SEC-02](#sec-02), [LOG-05](#log-05), [LOG-08](#log-08) | Account takeover + wrong official reports. |
| **P2 — make labels true** (1–2 weeks) | [PURP-01](#purp-01), [PURP-02](#purp-02), [PURP-04](#purp-04), [PURP-05](#purp-05), [REL-02](#rel-02), [REL-03](#rel-03), [REL-04](#rel-04), [PURP-11](#purp-11) | Removes the lies staff plan around; several share one refactor. |
| **P3 — durability** | [LOG-01](#log-01), [LOG-04](#log-04), [LOG-06](#log-06), [LOG-02](#log-02), [REL-07](#rel-07), [OPS-07](#ops-07), [OPS-08](#ops-08) | Needs schema/index changes and a repeatable release process. |
| **P4 — hygiene** | Everything else | Do opportunistically; the audit script keeps them from growing. |

### Reporting track

The reporting/analytics surface is tracked separately in [`reporting-gaps.md`](reporting-gaps.md)
(`RPT-01` … `RPT-12`) because it is a different question — *"can staff produce a defensible dataset?"*
rather than *"is this function correct?"*. The highest-leverage overlap with the table above:

| Reporting item | Depends on tracker item | Note |
|---|---|---|
| RPT-01 term filters are decorative | — | Pure UI + date-range work, no schema change |
| RPT-02 exports aren't valid data files | [LOG-08](#log-08) | Both fixed by moving export server-side |
| RPT-03 no coverage disclosure | [LOG-08](#log-08) | Show `1–50 of N`, stamp "as of" |
| RPT-07 records are deletable, no audit | [PURP-10](#purp-10) | Same fix: soft delete + audit log |
| RPT-08 no agreed definitions | [REL-03](#rel-03), [LOG-07](#log-07) | Needs one idle definition + a reason enum |
| RPT-10 UTC bucketing | [REL-06](#rel-06) | One configured timezone |

**Do this before starting the reporting work:** items [SEC-01](#sec-01), [LOG-03](#log-03) and
[REL-01](#rel-01). Reports built on an API where any librarian can become Super Admin, and where a
settings save can silently fail, are not evidence of anything.

---

## 9. Decisions & conventions — *the "we don't do that here" list*

These are the rules the entries above imply. Add a line when we settle an argument, so it isn't re-litigated.

| # | Rule | Because |
|---|---|---|
| 1 | **Authorization reads the verified token or the DB. Never a header, query param, or localStorage.** | [SEC-01](#sec-01) |
| 2 | **A missing secret stops the server. It never falls back to a default string.** | [SEC-05](#sec-05) |
| 3 | **A password is written and verified exactly one way.** | [SEC-04](#sec-04) |
| 4 | **Every mutating endpoint either requires auth or is deleted.** Dead public endpoints are still live endpoints. | [SEC-06](#sec-06) |
| 5 | **The server owns time, idle policy and PC identity. The client only displays them.** | [REL-03](#rel-03), [REL-05](#rel-05) |
| 6 | **A first-time password must be changed.** | [LOG-06](#log-06) |
| 7 | **Deleting a person closes their live access in the same transaction.** | [PURP-10](#purp-10) |
| 8 | **An export is the whole filtered set, or it says how many rows it left out.** | [LOG-08](#log-08) |
| 9 | **If a button can't do its label, the label changes or the button is disabled with a reason.** | [PURP-01](#purp-01), [PURP-02](#purp-02) |
| 10 | **No runtime `import`/`fetch` from the public internet.** Bundle it. | [PURP-09](#purp-09) |
| 11 | **`catch {}` is a bug unless the comment names the exact reason it's safe.** | [REL-01](#rel-01) |
| 12 | **One endpoint, one shape — and the OpenAPI spec is generated or verified.** | [OPS-02](#ops-02), [OPS-07](#ops-07) |
| 13 | **Config and policy are data (DB), secrets are env, never either in git.** | [REL-04](#rel-04), [OPS-03](#ops-03) |
| 14 | **`as any` is a code smell you have to justify in review.** | [OPS-06](#ops-06) |

---

## 10. Checked and *not* a problem (so nobody re-opens these)

| Suspect | Verdict |
|---|---|
| `students.ts` POST is unauthenticated | **False alarm** — mounted as `router.use("/students", requireAdmin, studentsRouter)` (`admin.ts:122`). |
| Kiosk page/`admin/layout` references `config`/`emergencyPin` | **Not real** — no `emergencyPin` consumer exists in `main.js`; the config value is dead weight ([SEC-03](#sec-03)). |
| `researchTopic` column | **Dead but harmless** — never written by any query; leftover from an older feature. Remove with the next migration, don't build on it. |
| The SQL dump leaks student data | **No** — schema/DDL only, zero `INSERT` rows. Still shouldn't be in the repo ([OPS-04](#ops-04)). |
| `/sessions/logout` accepts `sendBeacon` | **Works as intended** — `app.ts:30-41` re-parses `text/plain` bodies before `express.json()`. Fragile, but deliberate and documented. |
| `lib/api-client-react` is broken | **No** — `custom-fetch` correctly handles empty/204/BOM/RN; only the *spec* it is generated from has drifted ([OPS-07](#ops-07)). |
| Express 5 won't catch async errors | **Not the case** — Express 5 forwards rejected promises to the error handler; the gaps above are logical, not framework-level. |

---

## 11. Changelog

| Date | Change |
|---|---|
| 2026-11-06 | Initial audit (`49477fd`). 32 entries; baseline set in `docs/audit-baseline.json`. |
| 2026-11-06 | Added reporting track — see [`reporting-gaps.md`](reporting-gaps.md) (12 further entries). |
