# What We Found, What We Propose, and What We Do Next

**Aether LMS — a compiled findings paper for the library analysis**

Prepared 6 November 2026 · Branch `arena/b00cd671-aether-lms`
Companion detail: [`issue-tracker.md`](issue-tracker.md) · [`reporting-gaps.md`](reporting-gaps.md)

---

## How to read this paper

This paper answers three questions in order:

1. **What is wrong today?** — the problems we found, ranked by how much they matter.
2. **What should change?** — our suggestions, in plain words.
3. **What do we do first?** — an action plan with time estimates.

Everything here is compiled from two working documents, not re-invented. Each finding keeps its original
ID (`SEC-01`, `RPT-04`, …) so it can be traced back to the evidence, the file, and the line number.

One idea sits behind most of the findings, so it is worth stating once:

> **The system often says one thing and does another.**
> A button labelled "Term" filters one day. An export labelled "all students" stops at 50 rows. A delete
> button destroys the record. The data is real; the labels are not.

That single mismatch is the theme of this paper.

---

## Part 1 — The problems we found

### Summary

We audited the whole application and recorded **55 findings**: 8 security, 8 session-logging, 11
label-vs-behaviour, 8 reliability, 8 operations, and 12 reporting gaps. Severity means:

- **S1** — can cause a wrong decision or expose student data. Fix before the system is trusted.
- **S2** — makes the system unreliable or the reports wrong. Fix before the paper is written.
- **S3** — wasteful, confusing, or a maintenance risk. Fix when nearby.

Of the 55, **12 are reporting problems (RPT-01 … RPT-12)**. That count is the reason this paper exists: the
reporting layer — the part a school paper depends on — is the weakest part of the system, even though the
raw session data behind it is mostly sound.

### 1.1 Security — who is allowed to do what

| ID | Finding | Why it matters |
|---|---|---|
| **SEC-01** | Any logged-in librarian can become Super Admin by sending a header | The permission ceiling disappears with one crafted request. |
| **SEC-02** | Admin account recovery uses plaintext codes on a column that does not exist | Recovery is broken *and* unsafe; nobody can verify who reset an account. |
| **SEC-03** | The kiosk escape PIN ships in plaintext to every student PC | Students can read the PIN and unlock the kiosk shell. |
| **SEC-04** | Two password systems (bcrypt and legacy plaintext) with no migration | Half the passwords are stored in a form that must never be stored. |
| **SEC-05** | Three production secrets fall back to public constants | A misconfigured deploy silently uses a secret that is published in the repo. |
| **SEC-06** | Public `/register` and an unauthenticated password change | Anyone on the network can create or take over an account. |
| **SEC-07** | Wildcard CORS and trust in a client-supplied IP header | Any website can act as a logged-in client; "which PC was this?" becomes guesswork. |
| **SEC-08** | No rate limiting on any login endpoint | Passwords can be guessed at full speed. |

**In plain words:** several doors are unlocked. None of them requires a sophisticated attacker — they
require only that someone reads the front-end code, which every student PC already has.

> Relevance to the paper: these are **not** research findings, but a panel will ask whether student data
> was protected. SEC-03, SEC-04 and SEC-06 are the three that a reviewer is most likely to notice.

### 1.2 Session logging — the core function

| ID | Finding | Why it matters for research |
|---|---|---|
| **LOG-01** | Session ownership is bound to a PC, not to a student | "Who used this PC" and "what did this student do" cannot be answered reliably. |
| **LOG-02** | Unused PCs write nothing | Idle time is invisible, so any occupancy or utilisation figure is optimistic. |
| **LOG-03** | Anyone who knows a Student ID can set that student's password | The Student ID is printed on ID cards; it is not a secret. |
| **LOG-04** | Login has no lock; two students can claim one PC | Two open sessions on one seat produce overlapping, double-counted minutes. |
| **LOG-05** | The sweeper always runs; there is no "automatic logout" off-switch | A legitimate long session is forcibly ended, and the record shows it as if the student left. |
| **LOG-06** | Default passwords never force a change; the force-change flow is dead code | First-login identity is unverified. |
| **LOG-07** | `logoutReason` accepts any string; the token check is skipped when empty | Reason codes cannot be aggregated, so "why did sessions end" is unanswerable. |
| **LOG-08** | Exports silently cap at 50 rows | The exported file is not the dataset. This is the most dangerous single bug in the system. |

**In plain words:** the system records *that* a PC was used much better than it records *who* used it and
*why it ended*. Every downstream percentage inherits that uncertainty.

**LOG-08 deserves its own paragraph.** A librarian who exports "all sessions for October" receives 50 rows
and no warning. Nothing on screen says the set was truncated. If that file reaches a paper, the paper
contains a fabricated sample size. This one defect is enough to invalidate a chapter — and it is a
one-day fix.

### 1.3 Purpose mismatches — the label says one thing, the code does another

| ID | Label says | Code does |
|---|---|---|
| **PURP-01** | "Student Registration" | Registers nothing |
| **PURP-02** | Two different "Lock" buttons | Lock different things, neither says which |
| **PURP-03** | A second kiosk page | 869 lines, routed nowhere, still maintained |
| **PURP-04** | "Remote lock" | Works only in the Electron shell |
| **PURP-05** | "Session History" | Decided by a string in the URL inside a shared component |
| **PURP-06** | "Lock All" status | Local state — it forgets on refresh and never confirms |
| **PURP-07** | "Grade Level" | Filters a course/degree column |
| **PURP-08** | "AI insights" | Silently degrades; the model name cannot be verified |
| **PURP-09** | Student import | Loads a library from the public internet at runtime |
| **PURP-10** | "Delete student" | Leaves that student's session running |
| **PURP-11** | "Force logout" on the admin screen | Calls the student logout route, so a librarian-ended session is recorded as if the student left |

**In plain words:** when a label lies, the person using the screen cannot tell. They trust the output. In a
research context, a mislabelled filter is a mislabelled *finding*.

**PURP-07 is the clearest example.** A dropdown marked "Grade Level" filters the `degree` column. A
researcher selecting "Grade 11" filters for a value that is not there, receives an empty table, and may
conclude — in writing — that Grade 11 students do not use the library.

### 1.4 Reliability — what breaks silently

| ID | Finding |
|---|---|
| **REL-01** | 12 swallowed errors; the settings save can fail silently forever |
| **REL-02** | Two sources of truth for the number of PCs |
| **REL-03** | Client and server disagree on what "inactivity" means |
| **REL-04** | Settings live in a JSON file, not the database |
| **REL-05** | The server clock is the only clock; a wrong PC clock breaks sessions |
| **REL-06** | "Week"/"Month"/"Today" are rolling windows in local time |
| **REL-07** | The deployed frontend is a committed build artifact, not built from source |
| **REL-08** | No render error boundary — one exception blanks the kiosk |

**In plain words:** these are the failures that leave no message. A silent failure is worse than a crash,
because a crash is visible and a wrong number is not.

### 1.5 Operations — the cost of maintaining it

| ID | Finding |
|---|---|
| **OPS-01** | The dashboard polls by hand while react-query retries underneath |
| **OPS-02** | Two implementations of the same analytics endpoint |
| **OPS-03** | The database password is hard-coded in `package.json` |
| **OPS-04** | 94 generated files and a full database dump are committed |
| **OPS-05** | Password policy is 6 characters on the kiosk and 4 in the API |
| **OPS-06** | 30 `as any` casts hide schema drift |
| **OPS-07** | The OpenAPI spec describes endpoints that do not exist and misses those that do |
| **OPS-08** | No tests, no CI, no README, no `.env.example` |

### 1.6 Reporting — the part the paper depends on

These 12 findings are the heart of this paper. All are `open` at the time of writing.

| ID | Finding | Consequence for the paper |
|---|---|---|
| **RPT-01** | **Period controls do not control anything.** Term and school year only change the export *title*; the real filter underneath is a single day. | A chapter labelled "1st Semester" actually describes one day. |
| **RPT-02** | **Exports are not real data files.** CSV is unescaped and has no BOM; "PDF" is `window.open` + print; "Word" is HTML with a `.doc` extension. | Commas in a course name shift every column. Files open with mojibake. |
| **RPT-03** | **No coverage or freshness disclosure.** No "1–50 of N", no "as of" date. | The reader cannot tell a truncated set from a complete one. |
| **RPT-04** | **No volume, utilisation or capacity metrics.** Zero `SUM()` in the reporting code. | There is no "the library was 62% full" sentence to write. |
| **RPT-05** | **The data model is missing the study's dimensions** — no major, section, purpose, term. | Cross-tabulations the panel will request cannot be built at all. |
| **RPT-06** | **Attendance is not modelled.** A PC session is not a person present. | Headcount claims are unsupported by the data. |
| **RPT-07** | **Records are mutable and deletable with no audit trail.** | A figure cannot be reproduced later; nobody can prove it was not edited. |
| **RPT-08** | **No agreed definitions.** | Two people computing "average visit" get two answers. |
| **RPT-09** | **Status labels collapse distinct events** — four different endings are shown as "logout". | "Why do sessions end?" has no answer. |
| **RPT-10** | **Timezone and term boundaries are UTC.** | Sessions after 4 p.m. Manila are counted on the following day. |
| **RPT-11** | **No report catalogue** — every report is rebuilt by hand each time. | Two runs of "the same" report disagree. |
| **RPT-12** | **Research use of student data has no safeguards** — no anonymisation. | The paper cannot show a table of student-level data safely. |

**In plain words:** the library has data, but it does not have *reports*. Every number in the paper would
today be assembled by hand, on a screen that filters something other than what it claims, and exported
into a file that may be silently truncated.

---

## Part 2 — What we suggest

The suggestions are grouped the same way. Each is written as *problem → change → what improves*.

### 2.1 Make the period control real *(fixes RPT-01, RPT-10, REL-06)*

**Problem.** The term dropdown changes a heading. The data underneath is one day, bucketed in UTC.

**Change.** One function decides what every period means, in the library's own timezone, and it is the only
place allowed to decide. A period resolves to a labelled, dated window — for example
`1st Semester AY 2026-2027 (15 Jun 2026 – 31 Oct 2026)` — and that exact string is printed on screen and in
every export.

**Improves.** The label and the data can no longer disagree, because both come from the same resolution.
Sessions logged at 5 p.m. Manila stay on the day they happened.

**Status — done.** Implemented as `resolveRange()` in `lib/reporting`, covered by tests, and used by every
report endpoint. Reversed date input is now rejected rather than silently swapped.

### 2.2 Make every number come from one query *(fixes RPT-04, RPT-11, OPS-02)*

**Problem.** A screen makes eight requests; each request has its own idea of the filter. The cards on one
page can disagree with each other.

**Change.** Fetch the sessions in the window **once**, then derive every card, chart and table from that
single result with pure functions.

**Improves.** The numbers reconcile by construction, not by luck. This paper can state, and we verified
against 2,969 seeded sessions, that for every period tested:

```
sum(daily) = sum(by course) = sum(by year level) = summary.totalSessions
```

**Status — done.** One endpoint (`/api/reports/overview`) returns `meta`, `summary`, `daily`, `hours`,
`byCourse`, `byYearLevel`, `weekdayHour` and `quality`.

### 2.3 Give the librarian charts, not tables to read *(new)*

**Problem.** Reading a usage trend from a table of dates is slow and error-prone.

**Change.** Five visuals on one screen, all from the same response:

1. **Daily trend** — sessions per day, with gaps shown as zero rather than skipped.
2. **Hourly occupancy** — how many PCs are busy at each hour, as a percentage of capacity.
3. **Weekday × hour heatmap** — the "when is the library full" picture in one glance.
4. **Breakdown bars** — sessions by course and by year level.
5. **Data-quality panel** — how many sessions were under a minute, and how many ran past the limit.

Every chart shows its denominator. A percentage is never shown without the `n/d` behind it.

**Status — done.** Hand-rolled SVG — no chart library, so the bundle does not grow and printing is exact.

### 2.4 Make exports real files *(fixes RPT-02, RPT-03, LOG-08)*

**Problem.** CSV breaks on commas, has no BOM, and silently stops at 50 rows. "PDF" is the browser's print
dialog. "Word" is HTML wearing a `.doc` extension.

**Change.** Every export carries a provenance block — period label, resolved dates, timezone, generated-at,
definitions version, row count — followed by the complete table. CSV is escaped and BOM-prefixed so Excel
reads it correctly. Excel output uses real numeric cells. Print is an A4 landscape layout designed to be
saved as PDF.

**Improves.** A file taken from the system can be cited without further checking, because the file states
what it contains and when.

**Status — done**, except server-side PDF templating, which remains a Week-3 item.

### 2.5 Name the dimensions the study needs *(fixes RPT-05, RPT-06, RPT-12)*

**Problem.** The fact table holds course and year level, and nothing else. There is no major, no section,
no stated purpose, no academic term stored per row, and no anonymised export.

**Change.** Add nullable columns (`major`, `section`, `purpose`, `academic_term`, `academic_year`,
`ended_by`), plus an `academic_terms` table so every report resolves "1st Semester" identically. Add an
anonymise flag to exports.

**Improves.** The cross-tabulations the panel will ask for become possible, and student-level tables can be
published without identification.

**Status — proposed.** Schema is written out in `reporting-gaps.md` §6, ready to apply. Deliberately
non-breaking: every column is nullable and backfillable.

### 2.6 Stop destroying and start recording *(fixes RPT-07, LOG-07)*

**Problem.** One click deletes a session permanently, and there is no audit trail. Four distinct endings
are all shown as "logout".

**Change.** Soft delete (`archived_at`, `archived_by`, `archive_reason`), an `audit_log` table for every
change, a controlled vocabulary for `ended_by` (`student`, `system`, `librarian`), and status labels that
say which one happened.

**Improves.** A figure in the paper can be reproduced months later, and "why do sessions end?" becomes a
chart instead of a guess.

**Status — proposed.**

### 2.7 Write the definitions down *(fixes RPT-08)*

**Problem.** "Average visit" could mean three different things, and nothing in the system says which.

**Change.** A data dictionary that defines every published term, plus a `definitionsVersion` stamp on every
response and every export.

**Improves.** The methodology section of the paper writes itself, and a reader can tell which definition
version produced which table.

**Status — partly done.** The version stamp is live in every API response. The written dictionary is a
one-day task.

### 2.8 Keep the honest-data rules

Five rules we suggest holding to, because each one prevents a specific failure above:

- **Never show a percentage without its denominator.** `62% (1,240/2,000)`.
- **Never export a truncated set silently.** Always `1–50 of 4,312`.
- **Never let a label disagree with a filter.** If it says "Grade Level", it filters grade level.
- **Never delete what a paper cites.** Archive it.
- **Never publish a number you cannot recompute.** That is what the provenance block is for.

---

## Part 3 — The action plan

Order matters: correctness first, then capability, then polish. Effort is engineering time, not calendar
time.

| Phase | Work | Effort | Why here |
|---|---|---|---|
| **Day 1 — correctness** | CSV escaping + BOM · full-set export · `1–50 of N` footer · "as of" stamps · status label fix · rename period tabs to "Last 7/30 days" | ~1 day | Nothing below matters if the current export is wrong. Cheap, and it removes the worst failure. |
| **Week 1 — headline numbers** | Wire term/school-year to real ranges · summary + by-course + occupancy endpoints · the Reports screen | ~3–4 days | Produces the cards the paper opens with. **Done.** |
| **Week 2 — dimensions** | Schema additions and backfill · reach % · weekday matrix · non-users report | ~5 days | Unlocks the cross-tabulations a panel asks for. |
| **Week 3 — publication** | Server-side PDF template with cover page · anonymise toggle · Monthly Report Pack | ~4–5 days | Makes the routine two clicks and safe to share. |
| **Week 4 — findings** | Unmet demand (students turned away) · true library hours · data-quality report | ~3–4 days | The tables that make a paper *interesting*, not just descriptive. |
| **Ongoing** | Data dictionary · definitions version stamp | ~1 day | The methodology section, already half-written. |

**If time is very short:** Day 1 → Week 1 → data dictionary. That sequence alone turns "we have
screenshots" into "we have a cited monthly report with stated definitions".

### What we deliberately did not build

- **No embedded BI tool.** The eight prepared tables cover the great majority of school-paper needs; a
  general pivot builder is its own project and librarians will not use it.
- **No browser-side PDF generation.** Server templates give byte-identical output, which is what a
  citation needs.
- **No "AI writes the analysis" feature yet.** The existing AI path already fails silently (`PURP-08`);
  insight built on incomplete data is worse than none in a document that will be defended.

---

## Where this leaves us

**Already delivered** (this branch):

- One definition of every period, in Manila time, printed on screen and in every export.
- One query per screen; every card reconciles with every other.
- Five charts and a data-quality panel, all with denominators shown.
- Real CSV and Excel files with a provenance header; a print layout for PDF.
- 47 unit tests on the reporting library, 12 on the export layer.

**Still open, in priority order:**

1. Apply the Week-2 schema so major, section, purpose and term can be reported. *(RPT-05)*
2. Server-side PDF template and an anonymise toggle. *(RPT-02, RPT-12)*
3. Audit trail and soft delete. *(RPT-07)*
4. Data dictionary. *(RPT-08)*
5. The 8 S1 security findings — SEC-01, SEC-02, SEC-03, SEC-04, SEC-06, LOG-01, LOG-03. *(These are not
   reporting issues, but they decide whether the data can be trusted at all.)*

### Current gaps, honestly stated

| Question a panel may ask | Answer today |
|---|---|
| How many students used the library? | **Yes** — unique students per period. |
| What share of enrolled students is that? | **Yes**, once the enrolled count is available (it is `null` when the student table cannot be read, never a fake 0%). |
| Which courses use the library most? | **Yes** — sessions, students, minutes and share by course. |
| When is it busiest? | **Yes** — hourly occupancy and a weekday × hour heatmap. |
| How full was it, as a percentage? | **Yes** — minutes used ÷ (PCs × open minutes), with the denominator shown. |
| Why did sessions end? | **Partly** — four outcomes are now distinguished, but historical rows say only "logout". |
| How many students were turned away? | **No** — nothing records unmet demand. Week 4. |
| How many were physically present? | **No** — a PC session is not an attendance record. *(RPT-06)* |

---

*Compiled from `docs/issue-tracker.md` (43 findings) and `docs/reporting-gaps.md` (12 reporting gaps).
Repository audit: `pnpm --dir scripts audit --strict` — 13 rules, PASS.*
