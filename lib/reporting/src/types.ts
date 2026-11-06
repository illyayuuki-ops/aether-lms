/**
 * Response shapes for the reporting API.
 *
 * Kept in one shared package so the API and the web app cannot drift apart —
 * the drift between the OpenAPI spec and the routes is what produced OPS-07.
 * Every response embeds `meta` so any table can print its own provenance
 * (period label, row count, timestamp) without the UI guessing.
 */

import type { PeriodKind } from "./range";

/** Provenance block attached to every report response and export. */
export interface ReportMeta {
  /** What the period means in words, e.g. "1st Semester AY 2026-2027 (15 Jun – 31 Oct 2026)". */
  label: string;
  period: PeriodKind;
  /** YYYY-MM-DD, inclusive, library timezone. */
  fromDate: string;
  /** YYYY-MM-DD, inclusive, library timezone. */
  toDate: string;
  timezone: string;
  days: number;
  /** True when the window includes today, so the numbers will still change. */
  includesToday: boolean;
  /** ISO instant this response was computed. Print it on every export. */
  generatedAt: string;
  /** Bumped when a definition changes; lets a paper cite the method version. */
  definitionsVersion: string;
}

export interface ReportSummary {
  totalSessions: number;
  completedSessions: number;
  activeSessions: number;
  uniqueStudents: number;
  /** Sum of finished session durations. */
  totalMinutes: number;
  avgSessionMinutes: number;
  medianSessionMinutes: number;
  longestSessionMinutes: number;
  /** Sessions shorter than 1 minute — usually double logins. Excluded from averages. */
  underOneMinuteSessions: number;
  /** Denominator: PCs × open minutes in the window (0 when library hours are unknown). */
  capacityPcMinutes: number;
  /** totalMinutes ÷ capacityPcMinutes, 0–100. Null when capacity is unknown. */
  utilisationPct: number | null;
  /** Denominator: active students on the registry. 0 when unknown. */
  enrolledStudents: number;
  /** uniqueStudents ÷ enrolledStudents. Null when unknown. */
  reachPct: number | null;
  /** Average sessions per calendar day in the window. */
  avgSessionsPerDay: number;
  /** Sessions grouped by how they ended. */
  byOutcome: { outcome: SessionOutcome; count: number }[];
}

/** How a session ended — the 4-way mapping RPT-09 asked for. */
export type SessionOutcome = "manual" | "inactivity" | "time_limit" | "librarian" | "active" | "unknown";

export interface DailyPoint {
  date: string; // YYYY-MM-DD (library timezone)
  sessions: number;
  uniqueStudents: number;
  minutes: number;
}

export interface HourPoint {
  hour: number; // 0–23
  sessions: number;
  /** Average number of PCs busy during this hour across the window. */
  avgBusyPcs: number;
  /** 0–100, avgBusyPcs ÷ configured PCs. Null when PC count is unknown. */
  occupancyPct: number | null;
}

export interface CourseRow {
  degree: string;
  sessions: number;
  uniqueStudents: number;
  avgSessionMinutes: number;
  totalMinutes: number;
  /** Share of all sessions in the window, 0–100. */
  sharePct: number;
}

export interface YearLevelRow {
  yearLevel: string;
  sessions: number;
  uniqueStudents: number;
  sharePct: number;
}

export interface ComputerRow {
  computerNumber: number;
  sessions: number;
  totalMinutes: number;
  uniqueStudents: number;
}

export interface BucketRow {
  /** Label for the bucket, e.g. "1 visit", "2–4 visits", "5–9 visits", "10+ visits". */
  bucket: string;
  students: number;
  sharePct: number;
}

export interface QualityIssue {
  code:
    | "under_one_minute"
    | "over_time_limit"
    | "clock_skew"
    | "missing_degree"
    | "missing_year_level"
    | "still_active";
  severity: "info" | "warning";
  label: string;
  count: number;
  /** How this issue is handled in the headline numbers. */
  treatment: string;
}

/** One response for the whole overview screen — fewer round-trips = faster reports. */
export interface ReportOverviewResponse {
  meta: ReportMeta;
  summary: ReportSummary;
  daily: DailyPoint[];
  hours: HourPoint[];
  byCourse: CourseRow[];
  byYearLevel: YearLevelRow[];
  /** 7 rows (0 = Sunday) × 24 columns (hour of local login time). */
  weekdayHour: number[][];
  quality: {
    issues: QualityIssue[];
    completeness: { field: string; present: number; total: number; pct: number }[];
  };
}

export interface ReportFunnelResponse {
  meta: ReportMeta;
  /** Attempts that could not start a session, by reason. */
  unmetDemand: { outcome: string; label: string; count: number }[];
  /** Sessions that did start. */
  started: number;
  /** Attempts ÷ (attempts + started), 0–100. */
  unmetRatePct: number | null;
  byHour: { hour: number; unmet: number }[];
}

export interface ReportRepeatVisitsResponse {
  meta: ReportMeta;
  buckets: BucketRow[];
  totalStudents: number;
  averageVisitsPerStudent: number;
  /** Students who visited once only, as a share of all visitors. */
  oneVisitSharePct: number;
}

export interface ReportComputersResponse {
  meta: ReportMeta;
  computers: ComputerRow[];
  /** PC-minutes of use across the window. */
  totalMinutes: number;
  /** The busiest PC (by minutes). */
  busiest: ComputerRow | null;
}
