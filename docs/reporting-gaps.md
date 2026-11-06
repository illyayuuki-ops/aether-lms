# Aether LMS — Reporting & Research-Data Gaps

> Companion to [`issue-tracker.md`](issue-tracker.md). That file covers *correctness*; this one covers
> **"can a librarian produce a defensible dataset for a school analysis paper in under an hour?"**
> Today the answer is **no** — not because the data is missing, but because the reports are built for
> *watching the room*, not for *publishing numbers about it*.
>
> Audit date: 2026-11-06 · branch `arena/b00cd671-aether-lms` · commit `49477fd`
> IDs here are `RPT-xx` and are referenced from the tracker.

---

## 1. TL;DR

| # | What's wrong | Effect on a paper |
|---|---|---|
| 1 | The **School Year / Semester dropdowns are decorative** — they only change the exported title | The report header says "1st Semester AY 2026-2027" while the table contains whatever the filters happened to be |
| 2 | **Exports silently stop at 50 rows** (LOG-08) and never state the real count | Systematic under-counting that looks like a complete table |
| 3 | **CSV isn't escaped and has no BOM**; "PDF" is a print dialog; "Word" is HTML renamed `.doc` | Names with commas/suffixes break columns, Excel mangles accents (`Ñ`, `ñ`, `é`), PDF layout depends on the browser |
| 4 | **No hours, no utilisation, no capacity anywhere** — there is not a single `SUM(duration)` in the API | You can say "1,284 sessions" but not "42% of available PC-hours were used" |
| 5 | **The dimensions a study needs aren't captured** (major/section, purpose of use, term, first-visit, unmet demand) | Hypothesis-level analysis (course × hour, demand vs capacity) is impossible, not just inconvenient |
| 6 | **Records are mutable and deletable** — a librarian can delete a session row with one click, no audit | The dataset can change after collection with no record of who removed what. A panel can ask, and there's no answer |

The good news: items 1–3 and most of 4 are **fixable in days without a schema change**. Items 5–6 are the
real work, and they're worth doing because they're what turn this from "a log of logins" into
"an instrument for a study".

---

## 2. The questions your panel will ask — and today's answer

A library-use paper is built from a small set of questions. Here's what the system can answer right now.

| Research question | Answerable today? | Why / why not |
|---|---|---|
| How many students used the library this month? | ✅ Yes | `stats.totalSessions`, `uniqueStudents` |
| How long did an average session last? | ✅ Yes | `avgDurationMinutes` (completed sessions only) |
| Which courses use the library most? | ✅ Yes (count only) | `byGradeLevel` — but named as grade level, and **no per-course average duration or hours** |
| What are the peak hours? | ✅ Yes | `peakHours` (24 buckets) |
| **What percentage of the student body used the library?** | ❌ No | No denominator anywhere; reach % (`uniqueStudents ÷ enrolled`) is never computed |
| **How many PC-hours were used, and what share of capacity was that?** | ❌ No | No `SUM(durationMinutes)`, no operating-hours model |
| **How many students wanted a PC and couldn't get one?** | ❌ No | The 409 "PC already in use" is returned and forgotten — unmet demand is invisible |
| **Do the same students come repeatedly, or is reach broad?** | ❌ No | No visit frequency distribution; `topStudents` shows only the top 5 |
| **Which students never came? (absence analysis)** | ❌ No | Requires the full registry ★ a date range — doable in SQL, absent from every report |
| **What did students use the PC for?** | ❌ No | A `research_topic` column exists and is never written (OPS-07). Purpose of use is unrecorded |
| **How do weekdays / terms compare?** | ❌ No | No weekday grouping, no term boundaries (see RPT-01) |
| **Did usage change after an intervention (new PCs, longer hours)?** | ❌ No | No term/semester dimension, so periods can't be compared cleanly |

**Read that table again**: the system answers *operational* questions well and *analytical* questions not
at all. That's the gap worth closing.

---

## 3. Problems

### RPT-01 · **Report period controls don't control anything** · `S2` · open

- **Where:** `artifacts/library-system/src/pages/admin/sessions.tsx:239-240` (state),
  `:339-347` (the two `<select>`s), `:468` (used **only** in the export title string),
  `:250` (the date filter is a single `startDate = endDate` day)
- **Now:** "School Year" and "Semester" are collected, displayed in the dialog, and **never sent to the
  API**. The only real time filter is *one calendar day*. There is no "this week / this month / this
  semester / custom range" on the history screen at all.
- **Purpose it should serve:** *the header of an exported table must describe exactly the rows under it.*
- **This is the single most damaging reporting bug**: it produces a document that is *confidently wrong*.
- **Fix:** derive `{from, to}` from Semester + School Year (configurable term calendar in settings), send
  those bounds to the API, and print the resolved range — `2026-06-15 → 2026-10-31`, not just "1st Sem".

### RPT-02 · **Exports aren't real data files** · `S2` · open

- **Where:** `sessions.tsx:66-78` (CSV), `:84-118` (`exportToHTML`), `:120-126` (Word), `:130-137` (PDF)
- **Now:**
  - **CSV** — every cell is wrapped in `"` with no escaping: a name containing `"` or a degree like
    `ARTS & DESIGN, TVL` breaks the column count. No UTF-8 BOM, so Excel (the tool librarians actually
    use) shows `BaÃ±o` / `SeÃ±or` style mojibake.
  - **"PDF"** — `window.open` + `document.write` + `setTimeout(print)`. Pop-up blockers kill it silently;
    the page has no margins control beyond CSS `@page`, no generated-date line, and the operator can print
    to any paper size.
  - **"Word"** — the same HTML with a `.doc` extension. Word warns about the mismatch; tables reflow.
- **Purpose it should serve:** *the file that leaves the system is the one the study is built on.* It has to
  open cleanly in Excel/Sheets/Word, keep every column, and carry its own provenance.
- **Fix:** use a CSV writer with proper quoting (`"` → `""`) and a `\uFEFF` BOM; generate PDF server-side
  from a fixed template; add a header block to **every** export: school, term, resolved date range,
  generated-by, generated-at, row count, and a footnote with the definitions used.

### RPT-03 · **No coverage/freshness disclosure** · `S2` · open *(extends LOG-08)*

- **Now:** the API returns `{ sessions, total, page, limit }` and the UI prints the page slice. Nothing on
  screen or in the export says "showing 50 of 1,284". The dashboard's live numbers have no "as of
  HH:MM:SS" either, and the kiosk grid is built from a 30-second poll.
- **Purpose:** *a number people will quote must carry its own scope and timestamp.*
- **Fix:** show `1–50 of 1,284` in the table footer; stamp every export and every printed dashboard with
  "as of <time>"; block "Export" unless the export covers the whole filtered set.

### RPT-04 · **No volume, utilisation or capacity metrics** · `S2` · open

- **Where:** `routes/admin.ts:189-243` (`/stats`), `routes/analytics.ts:35-131` (`/usage-patterns`)
  — verified: **no `SUM()` of any kind exists in the API**.
- **Now:** every reported figure is a *count*. The system cannot answer "how many PC-hours did the library
  deliver", "what share of open hours were PCs busy", or "what share of seats were used at 2 pm".
- **Purpose:** *utilisation is the number a library's budget case is made of.*
- **Fix:** add to `/stats` and `/usage-patterns`:
  `totalDurationMinutes`, `avgSessionMinutes`, `pcs×openHours` denominator,
  `utilisationPct`, and per-hour occupancy (`occupied PC-minutes ÷ (PCs × 60)` for that hour).

### RPT-05 · **The data model is missing the study's dimensions** · `S2` · open

| Dimension | Status today | Needed for |
|---|---|---|
| `major` | Exists on `students`, **not copied to `sessions`** | per-major analysis |
| `section` / block | Absent | class-level comparisons |
| **purpose of use** | `research_topic` column exists, **never written** | *the* headline finding of a library study |
| academic term / school year | Absent (only `login_time`) | term-over-term comparison |
| first-time vs returning | Derivable only by expensive lookup, never exposed | onboarding vs habitual use |
| unmet demand | Not recorded (409 discarded) | demand vs capacity argument |
| student type (new/transferee/graduating) | Absent | cohort analysis |

- **Purpose:** *a session row is the unit of analysis — it must carry every dimension the analysis slices by.*
- **Fix:** add `major`, `section`, `purpose`, `academic_term`, `academic_year` to `sessions`; capture
  `purpose` at login as a 4–6 item picklist (Study/Research · Assignment · Internet access · Printing ·
  Group work · Other) — **and make it optional so it never blocks a login**. Note `research_topic` already
  exists: revive it rather than adding a second column.

### RPT-06 · **Attendance is not modelled** · `S2` · open

- **Now:** a "visit" only exists if a *PC session* was created. A student who came to read, borrow, or
  print is invisible; a student who was absent is indistinguishable from one who came and didn't log in.
- **Purpose:** *for a school paper, "who used the library" and "who was in the library" are different
  questions, and the first one is currently the only one answerable.*
- **Fix:** introduce a lightweight `visits` concept (or reuse `sessions` with a nullable PC) so a
  librarian can log a walk-in visit in two taps — or at minimum document this limitation explicitly in the
  methodology (see RPT-09) rather than letting the paper overclaim.

### RPT-07 · **Records are mutable — and deletable — with no audit trail** · `S2` · open

- **Where:** `routes/admin.ts:175-185` (`DELETE /admin/sessions/:id`),
  `pages/admin/sessions.tsx:281-293` + `:439-442` (trash icon, one confirm)
- **Now:** any admin can permanently remove a session record. There is no soft-delete, no `deleted_at`,
  no `deleted_by`, no audit log. The same applies to student records (`students.ts:290-308`).
- **Purpose:** *once a dataset is used as evidence, it must be append-only-ish: corrections are new
  records, not silent erasures.*
- **Why it matters for the paper:** during review someone will ask "was this cleaned?" — and the honest
  answer today is "we can't show you". It also makes accidental loss permanent.
- **Fix:** soft delete (`archived_at`, `archived_by`, `archive_reason`) + an `audit_log` table
  (who, what, when, before→after) + make export *exclude* archived rows and *count* them in the footnote.

### RPT-08 · **No agreed definitions, so numbers can't be defended** · `S3` · open

- **Now:** "session", "duration", "active", "auto-logout" mean different things in different places:
  the client ends on browser input, the server sweeps on `lastActivity`, the Electron shell injects OS idle
  time (REL-03); `durationMinutes` is only written on close; `time_limit` and admin force-logout both
  render as "Completed" (§4 below).
- **Purpose:** *any figure in the paper needs one written definition in one place.*
- **Fix:** add `docs/data-dictionary.md` — every field, its type, its allowed values, its rule
  ("duration = logout_time − login_time, rounded to the minute, null while active"), and the known
  limitations. This is a 1-day task that directly raises the paper's methodology section from
  "we exported a report" to "we computed X as defined in §3.2".

### RPT-09 · **Status labels collapse distinct events** · `S3` · open

- **Where:** `sessions.tsx:72`, `:91`, `:188`, `:434`
- **Now:** `logoutReason === "inactivity" ? "Auto-Logout" : "Completed"` — so **`time_limit`, admin
  force-logout, and manual logout are all reported as "Completed"**. The paper cannot distinguish
  "the student finished" from "we cut them off".
- **Fix:** full 4-way mapping (Manual · Inactivity · Time limit · Ended by librarian) validated by an enum
  (LOG-07), and expose it as a filter.

### RPT-10 · **Timezone and term boundaries are UTC** · `S3` · open *(extends REL-06)*

- **Where:** `routes/admin.ts:268` `toISOString().split("T")[0]`;
  `sessions.tsx:64` school-year list from `new Date().getFullYear()`
- **Now:** for UTC+8 (Asia/Manila) the daily bucket labelled "today" actually starts 8 hours earlier, and
  evening sessions (8 pm–midnight) fall into *tomorrow's* bucket. Term cut-offs computed this way shift an
  entire evening of traffic into the next period.
- **Fix:** one configured timezone (`Asia/Manila`), calendar bucketing in that zone, and term boundaries
  defined in settings so every report resolves them identically.

### RPT-11 · **No report catalogue — everything is rebuilt by hand** · `S2` · open

- **Now:** to write one chapter the librarian visits three screens, sets filters by hand, exports three
  times, and stitches them in Excel — each time, with no guarantee the filters match.
- **Purpose:** *the common reports should be one click, pre-labelled, and mutually consistent.*
- **Fix:** a **Reports** page with a catalogue (§5 below): pick term → pick report → export. All reports
  resolve their date range from the same term definition, so the numbers reconcile across tables.

### RPT-12 · **Research use of student data has no safeguards** · `S2` · open

- **Now:** exports contain full name + Student ID, no option to pseudonymise, no stated policy, no
  aggregate-only mode.
- **Purpose:** *a paper needs to show it handled personal data lawfully (PH Data Privacy Act / school IRB).*
- **Fix:** an "Anonymise" export toggle (Student ID → stable hash, name → initials or removed), an
  aggregate-only export, a retention note in the docs, and a footer line on every export stating the
  policy and the responsible office.

---

## 4. Small but visible: the paper's reputation

These don't break anything, they just make the output look unreviewed.

| Where | Now | Should be |
|---|---|---|
| `sessions.tsx:72,91,188,434` | `time_limit` + admin logout → **"Completed"** | 4-way reason label |
| `routes/admin.ts:146,240` | API field **`gradeLevel`** holding a *course* | `degree` (PURP-07) |
| `sessions.tsx:64` | School-year list `2024-2025 … 2028-2029` regardless of term | derived from term calendar |
| `sessions.tsx:71` | Duration shown `1h 5m` / `—` for active | show running time, mark "in progress" |
| `sessions.tsx:66` | Export columns have **no** `major`, `purpose`, `term`, `reason code` | add them (RPT-05) |
| `analytics.tsx:215` | "Avg / Day (7d)" ignores the selected period | label it, or compute for the period |
| `analytics.tsx` | No export button at all | every chart should be exportable as CSV |

---

## 5. What to add — the report catalogue

One page, `/admin/reports`, with a date-range/term selector at the top and a card per report. Each card
shows a 1-line definition and an estimated row count ("About 1,284 rows · 42 KB") before you click.

| # | Report | Grain | Columns | Answers |
|---|---|---|---|---|
| R1 | **Library Usage Summary** | one row per period | sessions, unique students, total PC-hours, avg duration, utilisation %, reach % | the headline numbers |
| R2 | **Session Log** (full) | one row per session | date, in, out, duration, reason, name, ID, course, major, year, PC, purpose | appendix / dataset |
| R3 | **Usage by Course** | one row per course | course, students enrolled, students who visited, reach %, sessions, avg duration, total hours | "which programs use us" |
| R4 | **Peak Hours / Occupancy** | one row per hour (0–23) | hour, sessions, avg occupied PCs, occupancy % | staffing & scheduling |
| R5 | **Weekday × Hour Matrix** | 7 × 24 grid | session counts | timetable argument |
| R6 | **Repeat Visits** | one row per student (bucketed) | visits bucket (1, 2–4, 5–9, 10+), students | habitual vs occasional use |
| R7 | **Top Users / Frequency** | one row per student | visits, total hours, avg per visit, last visit | recognition + outlier check |
| R8 | **Non-Users** *(needs the registry join)* | one row per student | course, year, visits = 0 | absence analysis / outreach |
| R9 | **Unmet Demand** *(needs new table)* | one row per attempt | date, hour, PC, student, outcome | demand vs capacity |
| R10 | **Term Comparison** *(needs term field)* | one row per term | term, sessions, hours, reach %, utilisation % | before/after an intervention |
| R11 | **Data Quality** | one row per check | orphan sessions, zero-length sessions, over-limit sessions, missing course, missing purpose | transparency appendix |

R1–R7 are computed from data that **already exists** — they're pure query work. R8 is a `LEFT JOIN`
against `students`. R9 and R10 need the schema additions below.

**Monthly Report Pack** — one button that produces R1–R6 + R11 for a chosen month as a single ZIP (or one
multi-sheet XLSX), plus a cover page stating school, term, generated-by/at, and definitions. This is the
"easy usage" feature: the librarian's monthly routine becomes *two clicks*, and every month is comparable
because the definitions are fixed in code.

---

## 6. What to add — data model

Minimal, non-breaking. Each block is independently shippable.

```sql
-- 1. Dimensions on the fact table (RPT-05) — additive, nullable, backfillable
ALTER TABLE sessions
  ADD COLUMN major             text,
  ADD COLUMN section           text,
  ADD COLUMN purpose           text,          -- 'study'|'research'|'assignment'|'internet'|'printing'|'group'|'other'
  ADD COLUMN academic_term     text,          -- '1st'|'2nd'|'summer'
  ADD COLUMN academic_year     text,          -- '2026-2027'
  ADD COLUMN ended_by          text,          -- 'student'|'system'|'librarian'
  ADD COLUMN archived_at       timestamptz,   -- soft delete (RPT-07)
  ADD COLUMN archived_by       integer,
  ADD COLUMN archive_reason    text;

-- 2. Unmet demand (R9, RPT-05)
CREATE TABLE session_attempts (
  id            serial PRIMARY KEY,
  student_id    text,                        -- null when the student gave up looking
  computer_number int,
  attempted_at  timestamptz NOT NULL DEFAULT now(),
  outcome       text NOT NULL                -- 'no_pc_available'|'pc_busy'|'already_logged_in'|'bad_password'
);

-- 3. Utilisation denominator (R4/R1) — replaces guessing "PCs × hours"
CREATE TABLE library_hours (
  id          serial PRIMARY KEY,
  weekday     int,                           -- 0-6
  opens_at    time NOT NULL,
  closes_at   time NOT NULL,
  total_pcs   int  NOT NULL,                 -- snapshot; PC count changes over time
  effective_from date NOT NULL,
  effective_to   date
);

-- 4. Terms, so every report resolves ranges the same way (RPT-01, RPT-10)
CREATE TABLE academic_terms (
  id            serial PRIMARY KEY,
  school_year   text NOT NULL,               -- '2026-2027'
  term          text NOT NULL,               -- '1st'|'2nd'|'summer'
  starts_on     date NOT NULL,
  ends_on       date NOT NULL
);

-- 5. Audit trail (RPT-07)
CREATE TABLE audit_log (
  id          serial PRIMARY KEY,
  actor_id    int,
  entity      text NOT NULL,                 -- 'session'|'student'|'admin'|'settings'
  entity_id   int,
  action      text NOT NULL,                 -- 'create'|'update'|'archive'|'delete'
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
```

**Backfill is trivial**: `major` from `students.major`; `academic_term/year` from `login_time` once the
terms table exists; `purpose` stays null for old rows (and the report footnote says so — which is honest
and panel-friendly).

---

## 7. What to add — API

| Endpoint | Returns | Serves |
|---|---|---|
| `GET /api/reports/summary?from&to` | sessions, unique students, total minutes, avg, utilisation %, reach % | R1 |
| `GET /api/reports/by-course?from&to` | per course: enrolled, visited, reach %, sessions, avg, hours | R3 |
| `GET /api/reports/occupancy?from&to` | per hour: sessions, avg busy PCs, occupancy % | R4 |
| `GET /api/reports/weekday-hour?from&to` | 7×24 matrix | R5 |
| `GET /api/reports/repeat-visits?from&to` | visit-count buckets | R6 |
| `GET /api/reports/non-users?from&to` | students with zero visits | R8 |
| `GET /api/reports/unmet-demand?from&to` | attempts by hour/PC/outcome | R9 |
| `GET /api/reports/quality?from&to` | counts of each anomaly class | R11 |
| `GET /api/reports/:id/export?format=csv\|xlsx\|pdf&from&to&anonymise=true` | **server-generated** file with header block | all |

Two rules for all of them:

1. **Server-side export only.** Client-side export is why we have RPT-02 and LOG-08. The server knows the
   whole filtered set and can stream it in chunks.
2. **Every response carries its own provenance:** `{ from, to, resolvedLabel: "1st Sem AY 2026-2027",
   rowCount, generatedAt, timezone: "Asia/Manila", definitionsVersion: "2026-11-06" }` so the UI can
   print it and the paper can cite it.

---

## 8. The paper-ready table set

If the goal is a school analysis paper, these eight tables cover a typical chapter structure. Each has a
single owner endpoint, so the numbers reconcile across the whole document.

| Table | Title | Source | Analysis |
|---|---|---|---|
| **1** | Student population and library reach | R1 + R8 | % of enrolled students who used the library |
| **2** | Usage by course/program | R3 | which programs over/under-use; χ² material |
| **3** | Peak hours and occupancy | R4 | staffing recommendation |
| **4** | Weekday × hour distribution | R5 | timetable fit |
| **5** | Session duration distribution | R2 | mean/median, share under 15 min (ghost sessions) |
| **6** | Frequency of use (repeat visits) | R6 | breadth vs depth of reach |
| **7** | Unmet demand | R9 | how often PCs were unavailable |
| **8** | Data quality & limitations | R11 | what was excluded and why |

Provide these as **saved report definitions** so the librarian regenerates the same eight tables each term
with consistent filters — that is the difference between a one-off paper and a repeatable instrument.

---

## 9. Data-quality controls worth adding

These are cheap and they're what make the numbers defensible.

| Control | Rule | Surfaced as |
|---|---|---|
| **Zero-length sessions** | flag `duration < 1 min` (double login, instant logout) | R11 count, excluded from averages by definition |
| **Over-limit sessions** | flag `duration > session_time_limit + 5 min` (sweeper lag) | R11 |
| **Orphan sessions** | active session whose PC mapping no longer exists | R11 |
| **Missing dimensions** | `major`/`course`/`purpose` null share | R11 "completeness %" per column |
| **Clock skew** | `login_time > now()` or `logout_time < login_time` | R11 |
| **Archived rows** | excluded from reports, counted in the footnote | every export |
| **Snapshot rule** | every export states "data as of <timestamp>" | every export |
| **Freeze rule** | once a term is closed, mark its rows read-only (no edits, no deletes) | prevents retroactive tampering |

---

## 10. Suggested sequence

| Phase | Work | Effort | Why first |
|---|---|---|---|
| **Day 1 (quick wins, no schema)** | CSV escaping + BOM · full-set export · `1–50 of N` footer · "as of" stamps · status label fix (RPT-09) · rename period tabs to "Last 7/30 days" | ~1 day | Makes existing exports *correct* — nothing below matters if the current CSV is broken |
| **Week 1** | Wire term/school-year to real date ranges (RPT-01) · `/reports/summary` + `by-course` + `occupancy` · R1/R3/R4 cards on a new Reports page | ~3–4 days | Delivers the headline numbers the paper opens with |
| **Week 2** | Schema additions (dimensions, `ended_by`, soft delete, audit) + backfill · R2/R5/R6/R8 | ~5 days | Unlocks reach %, weekday matrix, non-users |
| **Week 3** | Server-side export (CSV → XLSX → PDF template with cover page) · anonymise toggle · Monthly Report Pack | ~4–5 days | Makes the routine two clicks and IRB-safe |
| **Week 4** | `session_attempts` + unmet demand (R9) · `library_hours` for true utilisation · Data Quality report | ~3–4 days | The "findings" tables that make a paper interesting |
| **Ongoing** | `docs/data-dictionary.md` + definitions version stamp | ~1 day | The methodology section writes itself |

Suggested order if time is very short: **Day 1 → Week 1 → data dictionary**. That alone turns "we have
screenshots" into "we have a cited monthly report with stated definitions".

---

## 11. What *not* to build

- **Don't embed a BI tool / chart builder.** The eight tables above cover 95% of school-paper needs;
  a general pivot builder is a project on its own and librarians won't use it.
- **Don't generate PDFs in the browser.** Server-side templates give identical output every time, which is
  exactly what a citation needs.
- **Don't add an "AI writes the analysis" feature before the data is clean.** PURP-08 shows the current AI
  path already fails silently; insights from incomplete data are worse than no insights in a document that
  will be defended.
- **Don't report percentages without denominators.** Every % in the UI should show `n/d` on hover — that is
  the single habit that keeps a paper honest.
- **Don't keep the 50-row export "because it's faster".** A wrong number that arrives quickly costs more
  than a correct one that takes four seconds.

---

## 12. Changelog

| Date | Change |
|---|---|
| 2026-11-06 | Initial reporting-gap audit (RPT-01 … RPT-12) against `49477fd`. |
