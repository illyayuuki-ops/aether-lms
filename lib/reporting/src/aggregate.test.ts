/**
 * Tests for report aggregation — the definitions that every published number
 * depends on. Run with: pnpm --dir lib/reporting test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateOverview,
  busyMinutesByHour,
  aggregateRepeatVisits,
  aggregateComputers,
  buildDaily,
  buildHours,
  buildSummary,
  openDaysInRange,
  openMinutesPerDay,
  sessionMinutes,
  toOutcome,
  DEFAULT_LIBRARY_HOURS,
  DEFINITIONS_VERSION,
  type SessionFact,
} from "./aggregate";
import { resolveRange, zonedTimeToUtc, DEFAULT_LIBRARY_TZ } from "./range";

const TZ = DEFAULT_LIBRARY_TZ;

/** Build a session at a given Manila wall-clock time. */
function session(over: Partial<SessionFact> & { login: [number, number, number, number, number]; minutes?: number }): SessionFact {
  const [y, mo, d, h, mi] = over.login;
  const loginTime = zonedTimeToUtc(y, mo, d, TZ, h, mi, 0);
  const minutes = over.minutes ?? 30;
  const isActive = over.isActive ?? false;
  const logoutTime = isActive ? null : new Date(loginTime.getTime() + minutes * 60_000);
  return {
    id: over.id ?? Math.floor(Math.random() * 1e9),
    studentId: over.studentId ?? "24-00001",
    degree: over.degree ?? "BSIT",
    yearLevel: over.yearLevel ?? "2",
    computerNumber: over.computerNumber ?? 1,
    loginTime,
    logoutTime,
    durationMinutes: over.durationMinutes ?? (isActive ? null : minutes),
    isActive,
    logoutReason: over.logoutReason ?? "manual",
  };
}

const NOV = { kind: "custom" as const, from: "2026-11-01", to: "2026-11-30", tz: TZ };
const range = resolveRange(NOV);
const NOW = zonedTimeToUtc(2026, 11, 30, TZ, 23, 0, 0);

const ctx = {
  range,
  now: NOW,
  totalComputers: 20,
  sessionTimeLimitMinutes: 60,
  enrolledStudents: 1000,
  libraryHours: DEFAULT_LIBRARY_HOURS,
};

// ─── Outcomes ────────────────────────────────────────────────────────────────

test("outcomes are a closed set — time_limit and librarian no longer collapse into 'Completed'", () => {
  assert.equal(toOutcome({ isActive: true, logoutReason: null }), "active");
  assert.equal(toOutcome({ isActive: false, logoutReason: "manual" }), "manual");
  assert.equal(toOutcome({ isActive: false, logoutReason: "inactivity" }), "inactivity");
  assert.equal(toOutcome({ isActive: false, logoutReason: "time_limit" }), "time_limit");
  assert.equal(toOutcome({ isActive: false, logoutReason: "admin" }), "librarian");
  assert.equal(toOutcome({ isActive: false, logoutReason: "MANUAL " }), "manual");
  assert.equal(toOutcome({ isActive: false, logoutReason: null }), "unknown");
});

// ─── Capacity ────────────────────────────────────────────────────────────────

test("open minutes and open days use the configured week", () => {
  assert.equal(openMinutesPerDay(DEFAULT_LIBRARY_HOURS), 9 * 60); // 08:00–17:00
  // November 2026: 30 days, Mon–Fri only → 21 working days (Nov 1 is a Sunday).
  assert.equal(openDaysInRange(range, DEFAULT_LIBRARY_HOURS), 21);
});

test("utilisation is total session minutes over PC×open-minutes capacity", () => {
  // 21 open days × 540 min × 20 PCs = 226,800 PC-minutes.
  const capacity = 21 * 540 * 20;
  // 100 sessions × 30 min = 3,000 minutes.
  const sessions = Array.from({ length: 100 }, (_, i) =>
    session({ login: [2026, 11, 2 + (i % 20), 9, 0], studentId: `24-${String(i).padStart(5, "0")}` }),
  );
  const summary = buildSummary(sessions, range, ctx, NOW);
  assert.equal(summary.capacityPcMinutes, capacity);
  assert.equal(summary.totalMinutes, 3000);
  assert.equal(summary.utilisationPct, Math.round((3000 / capacity) * 1000) / 10);
});

test("reach % uses the enrolled denominator and is null when unknown", () => {
  const sessions = [
    session({ login: [2026, 11, 2, 9, 0], studentId: "24-00001" }),
    session({ login: [2026, 11, 3, 9, 0], studentId: "24-00002" }),
    session({ login: [2026, 11, 3, 10, 0], studentId: "24-00001" }),
  ];
  const withDenominator = buildSummary(sessions, range, ctx, NOW);
  assert.equal(withDenominator.uniqueStudents, 2);
  assert.equal(withDenominator.reachPct, 0.2);

  const without = buildSummary(sessions, range, { ...ctx, enrolledStudents: 0 }, NOW);
  assert.equal(without.reachPct, null, "no denominator must publish null, never 0%");
});

// ─── Averages ────────────────────────────────────────────────────────────────

test("sub-minute sessions are excluded from averages but counted in the total", () => {
  const sessions = [
    session({ login: [2026, 11, 2, 9, 0], minutes: 0 }),   // double login
    session({ login: [2026, 11, 2, 10, 0], minutes: 0 }),
    session({ login: [2026, 11, 2, 11, 0], minutes: 60 }),
    session({ login: [2026, 11, 2, 13, 0], minutes: 30 }),
  ];
  const s = buildSummary(sessions, range, ctx, NOW);
  assert.equal(s.totalSessions, 4);
  assert.equal(s.underOneMinuteSessions, 2);
  assert.equal(s.avgSessionMinutes, 45, "mean of 60 and 30 only");
  assert.equal(s.medianSessionMinutes, 45);
  assert.equal(s.totalMinutes, 90, "zero-minute rows add nothing to the total");
});

test("median handles odd and even counts", () => {
  const odd = [10, 20, 60].map((m, i) => session({ login: [2026, 11, 2 + i, 9, 0], minutes: m }));
  assert.equal(buildSummary(odd, range, ctx, NOW).medianSessionMinutes, 20);

  const even = [10, 20, 40, 60].map((m, i) => session({ login: [2026, 11, 2 + i, 9, 0], minutes: m }));
  assert.equal(buildSummary(even, range, ctx, NOW).medianSessionMinutes, 30);
});

test("active sessions are excluded from duration stats but count as sessions", () => {
  const sessions = [
    session({ login: [2026, 11, 2, 9, 0], minutes: 40 }),
    session({ login: [2026, 11, 30, 20, 0], isActive: true }),
  ];
  const s = buildSummary(sessions, range, ctx, NOW);
  assert.equal(s.totalSessions, 2);
  assert.equal(s.activeSessions, 1);
  assert.equal(s.completedSessions, 1);
  assert.equal(s.avgSessionMinutes, 40);
});

test("a missing stored duration falls back to the timestamps", () => {
  const s = session({ login: [2026, 11, 2, 9, 0], minutes: 45, durationMinutes: null });
  assert.equal(sessionMinutes(s, NOW), 45);
});

test("active session minutes are measured up to now, for occupancy only", () => {
  const s = session({ login: [2026, 11, 2, 9, 0], isActive: true });
  const at11 = zonedTimeToUtc(2026, 11, 2, TZ, 11, 0, 0);
  assert.equal(sessionMinutes(s, at11), 120);
});

// ─── Daily trend ─────────────────────────────────────────────────────────────

test("daily trend has one point per calendar day, zero-filled", () => {
  const sessions = [session({ login: [2026, 11, 5, 9, 0] })];
  const daily = buildDaily(sessions, range, NOW);
  assert.equal(daily.length, 30);
  assert.equal(daily[0].date, "2026-11-01");
  assert.equal(daily[29].date, "2026-11-30");
  assert.equal(daily.find((d) => d.date === "2026-11-05")!.sessions, 1);
  assert.equal(daily.find((d) => d.date === "2026-11-06")!.sessions, 0);
  assert.equal(daily.reduce((a, d) => a + d.sessions, 0), sessions.length);
});

test("daily buckets by Manila date, not UTC (the RPT-10 fix)", () => {
  // 23:30 UTC on 5 Nov is 07:30 on 6 Nov in Manila → must land on the 6th.
  const s = session({ login: [2026, 11, 6, 7, 30] });
  const daily = buildDaily([s], range, NOW);
  assert.equal(daily.find((d) => d.date === "2026-11-06")!.sessions, 1);
  assert.equal(daily.find((d) => d.date === "2026-11-05")!.sessions, 0);
});

test("daily sessions always sum to the total (cards and chart cannot disagree)", () => {
  const sessions = Array.from({ length: 137 }, (_, i) =>
    session({ login: [2026, 11, 1 + (i % 30), 8 + (i % 9), 0] }),
  );
  const overview = aggregateOverview(sessions, ctx);
  assert.equal(
    overview.daily.reduce((a, d) => a + d.sessions, 0),
    overview.summary.totalSessions,
  );
  assert.equal(
    overview.byCourse.reduce((a, c) => a + c.sessions, 0),
    overview.summary.totalSessions,
  );
  assert.equal(
    overview.byYearLevel.reduce((a, c) => a + c.sessions, 0),
    overview.summary.totalSessions,
  );
});

// ─── Hourly occupancy ────────────────────────────────────────────────────────

test("a session crossing an hour boundary is split between both hours", () => {
  // 07:50 → 08:30 = 10 min in hour 7, 30 min in hour 8.
  const s = session({ login: [2026, 11, 2, 7, 50], minutes: 40 });
  const busy = busyMinutesByHour([s], range, NOW);
  assert.equal(busy[7], 10);
  assert.equal(busy[8], 30);
  assert.equal(busy.reduce((a, b) => a + b, 0), 40);
});

test("a session crossing midnight is split across days and hours", () => {
  // 23:40 → 00:20 next day: 20 min in hour 23, 20 min in hour 0.
  const s = session({ login: [2026, 11, 2, 23, 40], minutes: 40 });
  const busy = busyMinutesByHour([s], range, NOW);
  assert.equal(busy[23], 20);
  assert.equal(busy[0], 20);
});

test("occupancy is busy PC-minutes over (days × 60 × PCs)", () => {
  // One PC busy for the full 09:00 hour on one day, 20 PCs configured.
  const s = session({ login: [2026, 11, 2, 9, 0], minutes: 60 });
  const hours = buildHours([s], range, NOW, 20);
  // 60 busy minutes ÷ (30 days × 60 min × 20 PCs) = 0.167% → rounded to 0.2
  assert.equal(hours[9].occupancyPct, 0.2);
});

test("occupancy is null when the PC count is unknown", () => {
  const hours = buildHours([session({ login: [2026, 11, 2, 9, 0] })], range, NOW, 0);
  assert.equal(hours[9].occupancyPct, null);
});

test("sessions outside the window are clipped, not counted", () => {
  // Login before the window, logout inside it.
  const s: SessionFact = {
    id: 1, studentId: "24-00001", degree: "BSIT", yearLevel: "1", computerNumber: 1,
    loginTime: zonedTimeToUtc(2026, 10, 31, TZ, 23, 0, 0),
    logoutTime: zonedTimeToUtc(2026, 11, 1, TZ, 1, 0, 0),
    durationMinutes: 120, isActive: false, logoutReason: "manual",
  };
  const busy = busyMinutesByHour([s], range, NOW);
  // Only the 00:00–01:00 slice on 1 Nov falls inside the window.
  assert.equal(busy[0], 60);
  assert.equal(busy.reduce((a, b) => a + b, 0), 60);
});

// ─── Breakdowns ──────────────────────────────────────────────────────────────

test("course breakdown sorts by sessions and shares sum to ~100%", () => {
  const sessions = [
    ...Array.from({ length: 6 }, () => session({ login: [2026, 11, 2, 9, 0], degree: "BSIT" })),
    ...Array.from({ length: 3 }, () => session({ login: [2026, 11, 2, 9, 0], degree: "BSED" })),
    session({ login: [2026, 11, 2, 9, 0], degree: "" }),
  ];
  const overview = aggregateOverview(sessions, ctx);
  assert.equal(overview.byCourse[0].degree, "BSIT");
  assert.equal(overview.byCourse[0].sessions, 6);
  assert.equal(overview.byCourse[0].sharePct, 60);
  assert.equal(overview.byCourse.at(-1)!.degree, "Unspecified");
  const sum = overview.byCourse.reduce((a, c) => a + c.sharePct, 0);
  assert.ok(Math.abs(sum - 100) < 0.2, `shares summed to ${sum}`);
});

test("year level sorts numerically, not alphabetically", () => {
  const sessions = ["12", "2", "10", "1"].map((y) =>
    session({ login: [2026, 11, 2, 9, 0], yearLevel: y }),
  );
  const overview = aggregateOverview(sessions, ctx);
  assert.deepEqual(overview.byYearLevel.map((r) => r.yearLevel), ["1", "2", "10", "12"]);
});

// ─── Quality ─────────────────────────────────────────────────────────────────

test("quality flags over-limit and missing fields with their treatment", () => {
  const sessions = [
    session({ login: [2026, 11, 2, 9, 0], minutes: 300 }),      // over the 60-min limit
    session({ login: [2026, 11, 2, 10, 0], degree: "" }),
    session({ login: [2026, 11, 30, 22, 0], isActive: true }),
  ];
  const { quality } = aggregateOverview(sessions, ctx);
  const codes = quality.issues.map((i) => i.code);
  assert.ok(codes.includes("over_time_limit"));
  assert.ok(codes.includes("missing_degree"));
  assert.ok(codes.includes("still_active"));
  assert.ok(quality.completeness.find((c) => c.field === "Course (degree)")!.pct < 100);
});

// ─── Meta ────────────────────────────────────────────────────────────────────

test("every response carries provenance for the export header", () => {
  const overview = aggregateOverview([], ctx);
  assert.equal(overview.meta.fromDate, "2026-11-01");
  assert.equal(overview.meta.toDate, "2026-11-30");
  assert.equal(overview.meta.timezone, TZ);
  assert.equal(overview.meta.days, 30);
  assert.equal(overview.meta.definitionsVersion, DEFINITIONS_VERSION);
  assert.ok(overview.meta.generatedAt);
});

test("an empty period returns zeros, not NaN or a crash", () => {
  const overview = aggregateOverview([], ctx);
  assert.equal(overview.summary.totalSessions, 0);
  assert.equal(overview.summary.avgSessionMinutes, 0);
  assert.equal(overview.summary.medianSessionMinutes, 0);
  assert.equal(overview.summary.utilisationPct, 0);
  assert.equal(overview.daily.length, 30);
  assert.equal(overview.byCourse.length, 0);
});

// ─── Repeat visits & computers ───────────────────────────────────────────────

test("repeat-visit buckets add up and one-visit share is computed", () => {
  const sessions = [
    ...Array.from({ length: 10 }, () => session({ login: [2026, 11, 2, 9, 0], studentId: "A" })),
    ...Array.from({ length: 3 }, () => session({ login: [2026, 11, 3, 9, 0], studentId: "B" })),
    session({ login: [2026, 11, 4, 9, 0], studentId: "C" }),
  ];
  const r = aggregateRepeatVisits(sessions, ctx);
  assert.equal(r.totalStudents, 3);
  assert.deepEqual(r.buckets.map((b) => b.students), [1, 1, 0, 1]);
  assert.equal(r.buckets.reduce((a, b) => a + b.students, 0), 3);
  assert.equal(r.oneVisitSharePct, 33.3);
  assert.equal(r.averageVisitsPerStudent, 4.7); // 14 visits / 3 students
});

test("computer report identifies the busiest PC by minutes", () => {
  const sessions = [
    session({ login: [2026, 11, 2, 9, 0], computerNumber: 1, minutes: 30 }),
    session({ login: [2026, 11, 3, 9, 0], computerNumber: 1, minutes: 30 }),
    session({ login: [2026, 11, 4, 9, 0], computerNumber: 7, minutes: 120 }),
  ];
  const r = aggregateComputers(sessions, ctx);
  assert.equal(r.computers.length, 2);
  assert.equal(r.totalMinutes, 180);
  assert.equal(r.busiest!.computerNumber, 7);
});

test("weekday × hour matrix counts logins by local weekday and hour", () => {
  // 2026-11-02 is a Monday. 09:00 and a second at 14:00.
  const sessions = [
    session({ login: [2026, 11, 2, 9, 0] }),
    session({ login: [2026, 11, 2, 9, 45] }),
    session({ login: [2026, 11, 2, 14, 10] }),
    session({ login: [2026, 11, 7, 9, 0] }), // Saturday
  ];
  const { weekdayHour } = aggregateOverview(sessions, ctx);
  assert.equal(weekdayHour.length, 7);
  assert.equal(weekdayHour[1][9], 2, "Monday 9am");
  assert.equal(weekdayHour[1][14], 1, "Monday 2pm");
  assert.equal(weekdayHour[6][9], 1, "Saturday 9am");
  assert.equal(weekdayHour.reduce((a, r) => a + r.reduce((x, y) => x + y, 0), 0), 4);
});

test("deterministic: same input twice gives identical output", () => {
  const sessions = Array.from({ length: 25 }, (_, i) =>
    session({ login: [2026, 11, 1 + (i % 28), 8 + (i % 9), (i * 7) % 60], minutes: 20 + (i % 40) }),
  );
  const a = aggregateOverview(sessions, ctx);
  const b = aggregateOverview(sessions, ctx);
  assert.deepEqual({ ...a, summary: { ...a.summary } }, { ...b, summary: { ...b.summary } });
  assert.deepEqual(a.daily, b.daily);
  assert.deepEqual(a.hours, b.hours);
});

// ─── Regressions found while running the live preview ────────────────────────

test("'all' does not invent capacity for years before the first record", () => {
  // Regression: 'all' fell back to 2000-01-01, so 26 years of empty capacity
  // made utilisation read 0.2% instead of the real figure.
  const range = resolveRange({
    kind: "all",
    now: new Date("2026-11-06T04:00:00Z"),
    tz: TZ,
    firstRecordKey: "2026-11-02",
  });
  assert.equal(range.fromInclusive, "2026-11-02");

  const sessions = [session({ login: [2026, 11, 2, 9, 0], minutes: 60 })];
  const openDays = openDaysInRange(range, DEFAULT_LIBRARY_HOURS);
  assert.equal(openDays, 5); // Mon 2 – Fri 6 Nov 2026 are all weekdays
  assert.equal(range.days, 5);

  const overview = aggregateOverview(sessions, {
    range,
    now: new Date("2026-11-06T04:00:00Z"),
    totalComputers: 20,
  });
  // 5 open days × 540 min × 20 PC = 54,000 — not millions of PC-minutes.
  assert.equal(overview.summary.capacityPcMinutes, 54_000);
  assert.equal(overview.summary.utilisationPct, 0.1);
});

test("a window starting before the first record is clamped, never negative", () => {
  const range = resolveRange({
    kind: "custom",
    from: "2026-01-01",
    to: "2026-11-06",
    now: new Date("2026-11-06T04:00:00Z"),
    tz: TZ,
    firstRecordKey: "2026-11-01",
  });
  assert.equal(range.firstRecordKey, "2026-11-01");
  assert.ok(openDaysInRange(range, DEFAULT_LIBRARY_HOURS) > 0);
});
