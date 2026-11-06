/**
 * Reporting API — see docs/reporting-gaps.md (RPT-01 … RPT-12).
 *
 * Design rules for everything in this file:
 *   1. ONE query per request. The whole overview screen comes from a single
 *      SELECT, then pure functions from @workspace/reporting derive every card,
 *      chart and table. Eight round-trips became one, and the numbers cannot
 *      disagree with each other any more.
 *   2. Every response carries `meta` (period label, resolved dates, timezone,
 *      generated-at, definitions version) so an export can print its provenance.
 *   3. Every period is resolved by resolveRange() in the library timezone.
 *      Nothing here calls toISOString() to decide which day a row belongs to.
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionsTable, studentsTable } from "@workspace/db/schema";
import { and, gte, lt, eq, count, sql } from "drizzle-orm";
import { z } from "zod";
import {
  aggregateComputers,
  aggregateOverview,
  aggregateRepeatVisits,
  buildDaily,
  resolveRange,
  rangeToInstants,
  zonedDateKey,
  PERIOD_OPTIONS,
  type PeriodKind,
  type SessionFact,
} from "@workspace/reporting";
import { loadSettings } from "./admin";

const router: IRouter = Router();

// ─── Period parsing ──────────────────────────────────────────────────────────

const PERIOD_KEYS = PERIOD_OPTIONS.map((o) => o.kind) as [PeriodKind, ...PeriodKind[]];

const RangeQuerySchema = z.object({
  period: z.enum(PERIOD_KEYS).default("this_month"),
  /** YYYY-MM-DD, required with period=custom */
  from: z.string().optional(),
  to: z.string().optional(),
  /** Optional display name, e.g. "1st Semester AY 2026-2027". */
  label: z.string().max(120).optional(),
  /** IANA zone override; defaults to the server setting. */
  tz: z.string().max(64).optional(),
});

/** Settings values this module needs, with safe fallbacks. */
function reportingSettings() {
  const settings = loadSettings();
  const raw = settings as typeof settings & {
    libraryOpenTime?: string;
    libraryCloseTime?: string;
    libraryDays?: number[];
  };
  return {
    totalComputers: settings.totalComputers ?? 20,
    sessionTimeLimitMinutes: settings.sessionTimeLimitMinutes ?? 60,
    libraryHours: {
      open: raw.libraryOpenTime ?? "08:00",
      close: raw.libraryCloseTime ?? "17:00",
      days: Array.isArray(raw.libraryDays) && raw.libraryDays.length > 0
        ? raw.libraryDays
        : [1, 2, 3, 4, 5],
    },
  };
}

/** Earliest recorded login — used to label "all time" honestly. */
async function firstRecordKey(tz: string): Promise<string | undefined> {
  const [row] = await db
    .select({ earliest: sql<Date | null>`MIN(${sessionsTable.loginTime})` })
    .from(sessionsTable);
  if (!row?.earliest) return undefined;
  return zonedDateKey(new Date(row.earliest), tz);
}

async function countEnrolledStudents(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(studentsTable)
    .where(eq(studentsTable.isActive, true));
  return Number(row?.n ?? 0);
}

/** Resolve the window from the query string, with 400s instead of 500s. */
async function resolveFromQuery(raw: unknown) {
  const parsed = RangeQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      status: 400,
      body: { error: "validation_error", message: parsed.error.errors[0]?.message ?? "Invalid query." },
    };
  }
  const { period, from, to, label, tz } = parsed.data;
  if (period === "custom" && (!from || !to)) {
    return {
      ok: false as const,
      status: 400,
      body: { error: "validation_error", message: "period=custom requires from and to (YYYY-MM-DD)." },
    };
  }

  const settings = reportingSettings();
  const zone = tz ?? "Asia/Manila";

  try {
    const range = resolveRange({
      kind: period,
      from,
      to,
      label,
      tz: zone,
      firstRecordKey: period === "all" ? await firstRecordKey(zone) : undefined,
    });
    return { ok: true as const, range, settings };
  } catch (err) {
    return {
      ok: false as const,
      status: 400,
      body: { error: "invalid_range", message: err instanceof Error ? err.message : "Invalid date range." },
    };
  }
}

/** Fetch every session that STARTS inside the window, in one query. */
async function fetchSessions(range: ReturnType<typeof resolveRange>): Promise<SessionFact[]> {
  const { from, to } = rangeToInstants(range);
  const rows = await db
    .select({
      id: sessionsTable.id,
      studentId: sessionsTable.studentId,
      degree: sessionsTable.degree,
      yearLevel: sessionsTable.yearLevel,
      computerNumber: sessionsTable.computerNumber,
      loginTime: sessionsTable.loginTime,
      logoutTime: sessionsTable.logoutTime,
      durationMinutes: sessionsTable.durationMinutes,
      isActive: sessionsTable.isActive,
      logoutReason: sessionsTable.logoutReason,
    })
    .from(sessionsTable)
    .where(and(gte(sessionsTable.loginTime, from), lt(sessionsTable.loginTime, to)));

  return rows.map((r) => ({
    ...r,
    loginTime: new Date(r.loginTime),
    logoutTime: r.logoutTime ? new Date(r.logoutTime) : null,
  }));
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/** What the UI uses to build the period picker without guessing labels. */
router.get("/periods", (_req, res) => {
  res.json({
    periods: PERIOD_OPTIONS,
    timezone: "Asia/Manila",
    definitionsVersion: "2026-11-06",
  });
});

/** Everything the overview screen needs, in one request. */
router.get("/overview", async (req, res) => {
  const resolved = await resolveFromQuery(req.query);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }

  const { range, settings } = resolved;
  const [sessions, enrolledStudents] = await Promise.all([
    fetchSessions(range),
    countEnrolledStudents(),
  ]);

  const payload = aggregateOverview(sessions, {
    range,
    totalComputers: settings.totalComputers,
    sessionTimeLimitMinutes: settings.sessionTimeLimitMinutes,
    libraryHours: settings.libraryHours,
    enrolledStudents,
  });

  res.json(payload);
});

/** Compact KPI block for dashboards — same maths, far less payload. */
router.get("/summary", async (req, res) => {
  const resolved = await resolveFromQuery(req.query);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const { range, settings } = resolved;
  const [sessions, enrolledStudents] = await Promise.all([
    fetchSessions(range),
    countEnrolledStudents(),
  ]);
  const { summary, meta } = aggregateOverview(sessions, {
    range,
    totalComputers: settings.totalComputers,
    sessionTimeLimitMinutes: settings.sessionTimeLimitMinutes,
    libraryHours: settings.libraryHours,
    enrolledStudents,
  });
  res.json({ meta, summary });
});

/** Daily trend only — for charts that poll. */
router.get("/daily", async (req, res) => {
  const resolved = await resolveFromQuery(req.query);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const { range } = resolved;
  const sessions = await fetchSessions(range);
  const { meta } = aggregateOverview(sessions, { range });
  const daily = buildDaily(sessions, range, new Date());
  res.json({
    meta,
    daily,
    totalSessions: daily.reduce((a, d) => a + d.sessions, 0),
  });
});

/** Per-PC usage (R7 support). */
router.get("/computers", async (req, res) => {
  const resolved = await resolveFromQuery(req.query);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const { range, settings } = resolved;
  const sessions = await fetchSessions(range);
  res.json(
    aggregateComputers(sessions, {
      range,
      totalComputers: settings.totalComputers,
      libraryHours: settings.libraryHours,
    }),
  );
});

/** Repeat-visit distribution (R6). */
router.get("/repeat-visits", async (req, res) => {
  const resolved = await resolveFromQuery(req.query);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const { range } = resolved;
  const sessions = await fetchSessions(range);
  res.json(aggregateRepeatVisits(sessions, { range }));
});

export default router;
