/**
 * Report aggregation — pure functions over session facts.
 *
 * Why pure functions and not 15 SQL queries (see docs/reporting-gaps.md):
 *   1. CONSISTENCY. Every card, chart and export is derived from the same row set,
 *      so "total sessions" and the sum of the daily chart can never disagree —
 *      the failure mode that made the old dashboards untrustworthy.
 *   2. TESTABILITY. No database needed to prove the maths, so the definitions are
 *      locked down by tests (aggregate.test.ts).
 *   3. SPEED. One query, one pass. The browser makes one request for the whole
 *      screen instead of eight.
 *
 * Definitions live here and only here; docs/data-dictionary.md mirrors them.
 */

import {
  daysBetweenKeys,
  eachKey,
  zonedDateKey,
  zonedParts,
  zonedTimeToUtc,
  type ResolvedRange,
} from "./range";
import type {
  BucketRow,
  ComputerRow,
  CourseRow,
  DailyPoint,
  HourPoint,
  QualityIssue,
  ReportComputersResponse,
  ReportMeta,
  ReportOverviewResponse,
  ReportRepeatVisitsResponse,
  ReportSummary,
  SessionOutcome,
  YearLevelRow,
} from "./types";

export const DEFINITIONS_VERSION = "2026-11-06";

/** The minimum shape a session needs to be reportable. */
export interface SessionFact {
  id: number;
  studentId: string;
  degree: string | null;
  yearLevel: string | null;
  computerNumber: number;
  loginTime: Date;
  logoutTime: Date | null;
  durationMinutes: number | null;
  isActive: boolean;
  logoutReason: string | null;
}

/** Library opening hours, used only for the utilisation denominator. */
export interface LibraryHours {
  /** "HH:MM" 24h, library timezone. */
  open: string;
  close: string;
  /** 0 = Sunday … 6 = Saturday. Any day not listed counts as closed. */
  days: number[];
}

export const DEFAULT_LIBRARY_HOURS: LibraryHours = {
  open: "08:00",
  close: "17:00",
  days: [1, 2, 3, 4, 5],
};

export interface AggregateContext {
  range: ResolvedRange;
  /** Configured number of PCs. 0/undefined disables occupancy + utilisation. */
  totalComputers?: number;
  libraryHours?: LibraryHours;
  /** Active students on the registry; 0/undefined disables reach %. */
  enrolledStudents?: number;
  /** Session length limit from settings; used to flag over-limit rows. */
  sessionTimeLimitMinutes?: number;
  /** "Now" — injectable for tests. */
  now?: Date;
}

// ─── Meta ────────────────────────────────────────────────────────────────────

export function buildMeta(range: ResolvedRange, now: Date = new Date()): ReportMeta {
  return {
    label: range.label,
    period: range.kind,
    fromDate: range.fromInclusive,
    toDate: range.toInclusive,
    timezone: range.timezone,
    days: range.days,
    includesToday: range.includesToday,
    generatedAt: now.toISOString(),
    definitionsVersion: DEFINITIONS_VERSION,
  };
}

// ─── Outcome normalisation (RPT-09) ──────────────────────────────────────────

const LIBRARIAN_REASONS = new Set(["admin", "librarian", "forced", "force", "force_logout"]);

/** Map the free-text logout reason onto a closed set of outcomes. */
export function toOutcome(s: Pick<SessionFact, "isActive" | "logoutReason">): SessionOutcome {
  if (s.isActive) return "active";
  const reason = (s.logoutReason ?? "").trim().toLowerCase();
  if (reason === "manual") return "manual";
  if (reason === "inactivity") return "inactivity";
  if (reason === "time_limit") return "time_limit";
  if (LIBRARIAN_REASONS.has(reason)) return "librarian";
  return "unknown";
}

export const OUTCOME_LABELS: Record<SessionOutcome, string> = {
  manual: "Logged out by student",
  inactivity: "Ended automatically (inactivity)",
  time_limit: "Ended at time limit",
  librarian: "Ended by librarian",
  active: "Still active",
  unknown: "Unspecified",
};

// ─── Duration ────────────────────────────────────────────────────────────────

/**
 * Minutes a session occupied a PC.
 * - Finished sessions: stored duration, else computed from the timestamps.
 * - Active sessions: computed up to `now` (used for occupancy, never for averages).
 */
export function sessionMinutes(s: SessionFact, now: Date): number {
  if (!s.isActive) {
    if (typeof s.durationMinutes === "number" && Number.isFinite(s.durationMinutes)) {
      return Math.max(0, s.durationMinutes);
    }
    if (s.logoutTime) {
      return Math.max(0, Math.round((s.logoutTime.getTime() - s.loginTime.getTime()) / 60_000));
    }
    return 0;
  }
  const end = Math.max(now.getTime(), s.loginTime.getTime());
  return Math.round((end - s.loginTime.getTime()) / 60_000);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

// ─── Capacity ────────────────────────────────────────────────────────────────

/** Minutes the library is open per day, from "HH:MM" strings. */
export function openMinutesPerDay(hours: LibraryHours): number {
  const [oh, om] = hours.open.split(":").map(Number);
  const [ch, cm] = hours.close.split(":").map(Number);
  const minutes = ch * 60 + cm - (oh * 60 + om);
  return minutes > 0 ? minutes : 0;
}

/** Number of open days inside the window (inclusive), in the library timezone. */
export function openDaysInRange(range: ResolvedRange, hours: LibraryHours): number {
  if (hours.days.length === 0) return 0;
  let count = 0;
  // A window that starts before the first record would otherwise invent capacity
  // for years the library was not recording ("all" started at 2000-01-01).
  const first = range.firstRecordKey && range.firstRecordKey > range.fromInclusive
    ? range.firstRecordKey
    : range.fromInclusive;
  if (first > range.toInclusive) return 0;
  for (const key of eachKey(first, range.toInclusive)) {
    const [y, m, d] = key.split("-").map(Number);
    // Weekday of a calendar date is timezone-independent.
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (hours.days.includes(weekday)) count++;
  }
  return count;
}

// ─── Daily trend ─────────────────────────────────────────────────────────────

/** One point per calendar day in the window — gaps filled with zero, never skipped. */
export function buildDaily(sessions: SessionFact[], range: ResolvedRange, now: Date): DailyPoint[] {
  const byDay = new Map<string, { sessions: number; students: Set<string>; minutes: number }>();
  for (const key of eachKey(range.fromInclusive, range.toInclusive)) {
    byDay.set(key, { sessions: 0, students: new Set(), minutes: 0 });
  }

  for (const s of sessions) {
    const key = zonedDateKey(s.loginTime, range.timezone);
    const bucket = byDay.get(key);
    if (!bucket) continue; // outside the window (defensive)
    bucket.sessions += 1;
    bucket.students.add(s.studentId);
    if (!s.isActive) bucket.minutes += sessionMinutes(s, now);
  }

  return [...byDay.entries()].map(([date, v]) => ({
    date,
    sessions: v.sessions,
    uniqueStudents: v.students.size,
    minutes: v.minutes,
  }));
}

// ─── Hourly occupancy ────────────────────────────────────────────────────────

/**
 * Busy PC-minutes per hour-of-day across the whole window.
 *
 * Each session is clipped to the window and split at local hour boundaries, so a
 * 07:50–08:30 session contributes 10 minutes to hour 7 and 30 to hour 8.
 * Sessions that span midnight are handled correctly because the split uses the
 * session's own local wall clock at every step.
 */
export function busyMinutesByHour(
  sessions: SessionFact[],
  range: ResolvedRange,
  now: Date,
): number[] {
  const tz = range.timezone;
  const [fy, fm, fd] = range.fromInclusive.split("-").map(Number);
  const [ty, tm, td] = range.toInclusive.split("-").map(Number);
  const windowStart = zonedTimeToUtc(fy, fm, fd, tz).getTime();
  const windowEnd = zonedTimeToUtc(ty, tm, td + 1, tz).getTime();

  const minutes = new Array<number>(24).fill(0);

  for (const s of sessions) {
    const startMs = Math.max(s.loginTime.getTime(), windowStart);
    const rawEnd = s.isActive ? now.getTime() : (s.logoutTime?.getTime() ?? s.loginTime.getTime() + (s.durationMinutes ?? 0) * 60_000);
    const endMs = Math.min(rawEnd, windowEnd);
    if (endMs <= startMs) continue;

    let cursor = startMs;
    // Walk to each local hour boundary. Bounded by the number of hours in a day
    // per session in the worst case; sessions are minutes long in practice.
    let guard = 0;
    while (cursor < endMs && guard++ < 24 * 3) {
      const p = zonedParts(new Date(cursor), tz);
      const nextHour = new Date(
        zonedTimeToUtc(p.year, p.month, p.day, tz, p.hour + 1, 0, 0).getTime(),
      ).getTime();
      const sliceEnd = Math.min(nextHour, endMs);
      minutes[p.hour] += (sliceEnd - cursor) / 60_000;
      cursor = sliceEnd;
    }
  }

  return minutes;
}

export function buildHours(
  sessions: SessionFact[],
  range: ResolvedRange,
  now: Date,
  totalComputers: number,
): HourPoint[] {
  const perHourSessions = new Array<number>(24).fill(0);
  for (const s of sessions) {
    const p = zonedParts(s.loginTime, range.timezone);
    perHourSessions[p.hour] += 1;
  }
  const busy = busyMinutesByHour(sessions, range, now);
  const days = Math.max(1, range.days);
  const hasPcs = totalComputers > 0;

  return Array.from({ length: 24 }, (_, hour) => {
    // Average concurrent PCs busy during this hour across the window.
    const avgBusyPcs = busy[hour] / (days * 60);
    return {
      hour,
      sessions: perHourSessions[hour],
      avgBusyPcs: Math.round(avgBusyPcs * 100) / 100,
      occupancyPct: hasPcs ? Math.round((avgBusyPcs / totalComputers) * 1000) / 10 : null,
    };
  });
}

// ─── Weekday × hour matrix ───────────────────────────────────────────────────

/**
 * Login counts as a 7 × 24 grid (weekday × local hour).
 * This is the picture a timetable argument needs — a peak-hours bar chart cannot
 * tell you that Tuesday 10am is the crunch while Monday 10am is quiet.
 */
export function buildWeekdayHour(sessions: SessionFact[], range: ResolvedRange): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const s of sessions) {
    const p = zonedParts(s.loginTime, range.timezone);
    grid[p.weekday][p.hour] += 1;
  }
  return grid;
}

// ─── Breakdowns ──────────────────────────────────────────────────────────────

const UNSPECIFIED = "Unspecified";

export function buildByCourse(sessions: SessionFact[], now: Date): CourseRow[] {
  const total = sessions.length;
  const groups = new Map<string, { sessions: number; students: Set<string>; minutes: number; completed: number }>();

  for (const s of sessions) {
    const key = (s.degree ?? "").trim() || UNSPECIFIED;
    let g = groups.get(key);
    if (!g) {
      g = { sessions: 0, students: new Set(), minutes: 0, completed: 0 };
      groups.set(key, g);
    }
    g.sessions += 1;
    g.students.add(s.studentId);
    if (!s.isActive) {
      g.minutes += sessionMinutes(s, now);
      g.completed += 1;
    }
  }

  return [...groups.entries()]
    .map(([degree, g]) => ({
      degree,
      sessions: g.sessions,
      uniqueStudents: g.students.size,
      avgSessionMinutes: g.completed > 0 ? Math.round(g.minutes / g.completed) : 0,
      totalMinutes: g.minutes,
      sharePct: total > 0 ? Math.round((g.sessions / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions || a.degree.localeCompare(b.degree));
}

export function buildByYearLevel(sessions: SessionFact[]): YearLevelRow[] {
  const total = sessions.length;
  const groups = new Map<string, { sessions: number; students: Set<string> }>();
  for (const s of sessions) {
    const key = (s.yearLevel ?? "").trim() || UNSPECIFIED;
    let g = groups.get(key);
    if (!g) {
      g = { sessions: 0, students: new Set() };
      groups.set(key, g);
    }
    g.sessions += 1;
    g.students.add(s.studentId);
  }
  return [...groups.entries()]
    .map(([yearLevel, g]) => ({
      yearLevel,
      sessions: g.sessions,
      uniqueStudents: g.students.size,
      sharePct: total > 0 ? Math.round((g.sessions / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => {
      const na = Number(a.yearLevel);
      const nb = Number(b.yearLevel);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.yearLevel.localeCompare(b.yearLevel);
    });
}

export function buildComputers(sessions: SessionFact[], now: Date): ComputerRow[] {
  const groups = new Map<number, { sessions: number; minutes: number; students: Set<string> }>();
  for (const s of sessions) {
    let g = groups.get(s.computerNumber);
    if (!g) {
      g = { sessions: 0, minutes: 0, students: new Set() };
      groups.set(s.computerNumber, g);
    }
    g.sessions += 1;
    g.students.add(s.studentId);
    if (!s.isActive) g.minutes += sessionMinutes(s, now);
  }
  return [...groups.entries()]
    .map(([computerNumber, g]) => ({
      computerNumber,
      sessions: g.sessions,
      totalMinutes: g.minutes,
      uniqueStudents: g.students.size,
    }))
    .sort((a, b) => a.computerNumber - b.computerNumber);
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export function buildSummary(
  sessions: SessionFact[],
  range: ResolvedRange,
  ctx: AggregateContext,
  now: Date,
): ReportSummary {
  const completed = sessions.filter((s) => !s.isActive);
  const durations = completed.map((s) => sessionMinutes(s, now));
  // RPT-11: sub-minute rows are almost always double logins; flag them and keep
  // them out of the averages so one stray row cannot move a published mean.
  const countable = durations.filter((d) => d >= 1);
  const underOne = durations.filter((d) => d < 1).length;

  const totalMinutes = durations.reduce((a, b) => a + b, 0);
  const uniqueStudents = new Set(sessions.map((s) => s.studentId)).size;

  const hours = ctx.libraryHours ?? DEFAULT_LIBRARY_HOURS;
  const totalComputers = ctx.totalComputers ?? 0;
  const capacityPcMinutes = totalComputers * openDaysInRange(range, hours) * openMinutesPerDay(hours);

  const outcomeCounts = new Map<SessionOutcome, number>();
  for (const s of sessions) {
    const o = toOutcome(s);
    outcomeCounts.set(o, (outcomeCounts.get(o) ?? 0) + 1);
  }

  const enrolled = ctx.enrolledStudents ?? 0;
  const days = Math.max(1, range.days);

  return {
    totalSessions: sessions.length,
    completedSessions: completed.length,
    activeSessions: sessions.length - completed.length,
    uniqueStudents,
    totalMinutes,
    avgSessionMinutes: countable.length > 0
      ? Math.round(countable.reduce((a, b) => a + b, 0) / countable.length)
      : 0,
    medianSessionMinutes: median(countable),
    longestSessionMinutes: countable.length > 0 ? Math.max(...countable) : 0,
    underOneMinuteSessions: underOne,
    capacityPcMinutes: capacityPcMinutes > 0 ? capacityPcMinutes : 0,
    utilisationPct: capacityPcMinutes > 0
      ? Math.round((totalMinutes / capacityPcMinutes) * 1000) / 10
      : null,
    enrolledStudents: enrolled,
    reachPct: enrolled > 0 ? Math.round((uniqueStudents / enrolled) * 1000) / 10 : null,
    avgSessionsPerDay: Math.round((sessions.length / days) * 10) / 10,
    byOutcome: [...outcomeCounts.entries()]
      .map(([outcome, count]) => ({ outcome, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ─── Data quality (RPT-11) ───────────────────────────────────────────────────

export function buildQuality(sessions: SessionFact[], ctx: AggregateContext, now: Date): ReportOverviewResponse["quality"] {
  const limit = ctx.sessionTimeLimitMinutes ?? 60;
  const issues: QualityIssue[] = [];

  const underOne = sessions.filter((s) => !s.isActive && sessionMinutes(s, now) < 1).length;
  if (underOne > 0) {
    issues.push({
      code: "under_one_minute",
      severity: "info",
      label: "Sessions under 1 minute",
      count: underOne,
      treatment: "Excluded from average and median duration (usually a double login).",
    });
  }

  const overLimit = sessions.filter((s) => !s.isActive && sessionMinutes(s, now) > limit + 5).length;
  if (overLimit > 0) {
    issues.push({
      code: "over_time_limit",
      severity: "warning",
      label: `Sessions longer than the ${limit}-minute limit (+5 min grace)`,
      count: overLimit,
      treatment: "Included as recorded — likely a sweeper delay, not student behaviour.",
    });
  }

  const skew = sessions.filter((s) => s.logoutTime && s.logoutTime.getTime() < s.loginTime.getTime()).length;
  if (skew > 0) {
    issues.push({
      code: "clock_skew",
      severity: "warning",
      label: "Logout before login (clock skew)",
      count: skew,
      treatment: "Clamped to 0 minutes; investigate the PC clock.",
    });
  }

  const missingDegree = sessions.filter((s) => !(s.degree ?? "").trim()).length;
  if (missingDegree > 0) {
    issues.push({
      code: "missing_degree",
      severity: "warning",
      label: "Sessions with no course recorded",
      count: missingDegree,
      treatment: 'Grouped as "Unspecified" in the course breakdown.',
    });
  }

  const missingYear = sessions.filter((s) => !(s.yearLevel ?? "").trim()).length;
  if (missingYear > 0) {
    issues.push({
      code: "missing_year_level",
      severity: "warning",
      label: "Sessions with no year level recorded",
      count: missingYear,
      treatment: 'Grouped as "Unspecified" in the year-level breakdown.',
    });
  }

  const active = sessions.filter((s) => s.isActive).length;
  if (active > 0) {
    issues.push({
      code: "still_active",
      severity: "info",
      label: "Sessions still running",
      count: active,
      treatment: "Counted as sessions and in occupancy, excluded from duration averages.",
    });
  }

  const total = sessions.length;
  const completeness = [
    { field: "Course (degree)", present: total - missingDegree, total },
    { field: "Year level", present: total - missingYear, total },
    {
      field: "Duration",
      present: total - sessions.filter((s) => s.isActive || s.durationMinutes === null).length,
      total,
    },
  ].map((c) => ({
    ...c,
    pct: c.total > 0 ? Math.round((c.present / c.total) * 1000) / 10 : 100,
  }));

  return { issues, completeness };
}

// ─── Public: one call builds the whole overview ──────────────────────────────

export function aggregateOverview(
  sessions: SessionFact[],
  ctx: AggregateContext,
): ReportOverviewResponse {
  const now = ctx.now ?? new Date();
  const totalComputers = ctx.totalComputers ?? 0;
  return {
    meta: buildMeta(ctx.range, now),
    summary: buildSummary(sessions, ctx.range, ctx, now),
    daily: buildDaily(sessions, ctx.range, now),
    hours: buildHours(sessions, ctx.range, now, totalComputers),
    byCourse: buildByCourse(sessions, now),
    byYearLevel: buildByYearLevel(sessions),
    weekdayHour: buildWeekdayHour(sessions, ctx.range),
    quality: buildQuality(sessions, ctx, now),
  };
}

export function aggregateComputers(
  sessions: SessionFact[],
  ctx: AggregateContext,
): ReportComputersResponse {
  const now = ctx.now ?? new Date();
  const computers = buildComputers(sessions, now);
  const totalMinutes = computers.reduce((a, c) => a + c.totalMinutes, 0);
  const busiest = computers.reduce<ComputerRow | null>(
    (best, c) => (best === null || c.totalMinutes > best.totalMinutes ? c : best),
    null,
  );
  return { meta: buildMeta(ctx.range, now), computers, totalMinutes, busiest };
}

/**
 * Repeat-visit distribution (R6). Answers "is reach broad or deep?" —
 * the question a single "top 5 students" table cannot.
 */
export function aggregateRepeatVisits(
  sessions: SessionFact[],
  ctx: AggregateContext,
): ReportRepeatVisitsResponse {
  const now = ctx.now ?? new Date();
  const visits = new Map<string, number>();
  for (const s of sessions) visits.set(s.studentId, (visits.get(s.studentId) ?? 0) + 1);

  const buckets: BucketRow[] = [
    { bucket: "1 visit", students: 0, sharePct: 0 },
    { bucket: "2–4 visits", students: 0, sharePct: 0 },
    { bucket: "5–9 visits", students: 0, sharePct: 0 },
    { bucket: "10+ visits", students: 0, sharePct: 0 },
  ];

  for (const count of visits.values()) {
    if (count <= 1) buckets[0].students++;
    else if (count <= 4) buckets[1].students++;
    else if (count <= 9) buckets[2].students++;
    else buckets[3].students++;
  }

  const totalStudents = visits.size;
  for (const b of buckets) {
    b.sharePct = totalStudents > 0 ? Math.round((b.students / totalStudents) * 1000) / 10 : 0;
  }

  const totalVisits = [...visits.values()].reduce((a, b) => a + b, 0);

  return {
    meta: buildMeta(ctx.range, now),
    buckets,
    totalStudents,
    averageVisitsPerStudent: totalStudents > 0
      ? Math.round((totalVisits / totalStudents) * 10) / 10
      : 0,
    oneVisitSharePct: totalStudents > 0
      ? Math.round((buckets[0].students / totalStudents) * 1000) / 10
      : 0,
  };
}

/** Exposed for the route so it can decide whether a window is worth rendering. */
export { daysBetweenKeys };
