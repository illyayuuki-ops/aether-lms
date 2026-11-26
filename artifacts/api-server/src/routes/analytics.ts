import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, lt, count, avg, sql } from "drizzle-orm";

const router: IRouter = Router();

// ─── Helper: get startDate from period string ────────────────────────────────

function getStartDate(period: string, year?: number, month?: number): Date {
  const now = new Date();
  if (period === "all" || (year !== undefined && month !== undefined)) {
    if (year !== undefined && month !== undefined) {
      return new Date(year, month - 1, 1, 0, 0, 0, 0);
    }
    return new Date(0); // Unix epoch for "all"
  }
  switch (period) {
    case "week":  { const d = new Date(now); d.setDate(now.getDate() - 7);       return d; }
    case "year":  { const d = new Date(now); d.setFullYear(now.getFullYear()-1); return d; }
    case "today": { const d = new Date(now); d.setHours(0,0,0,0);               return d; }
    default:      { const d = new Date(now); d.setMonth(now.getMonth() - 1);    return d; } // month
  }
}

function getEndDate(period: string, year?: number, month?: number): Date | undefined {
  if (period === "all") return undefined;
  if (year !== undefined && month !== undefined) {
    return new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
  }
  return undefined;
}

// ─── Usage Patterns (existing — peak hours, degree stats, daily trend, top students) ──

router.get("/usage-patterns", async (req, res) => {
  try {
    const period   = (req.query.period as string) ?? "month";
    const year     = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const month    = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
    const startDate = getStartDate(period, year, month);
    const endDate = getEndDate(period, year, month);
    const conditions = [gte(sessionsTable.loginTime, startDate)];
    if (endDate) conditions.push(lte(sessionsTable.loginTime, endDate));
    const condition = conditions.length > 1 ? and(...conditions) : conditions[0];

    // Peak hours
    const hourRows = await db
      .select({
        hour:  sql<number>`EXTRACT(HOUR FROM ${sessionsTable.loginTime})::int`,
        count: count(),
      })
      .from(sessionsTable)
      .where(condition)
      .groupBy(sql`EXTRACT(HOUR FROM ${sessionsTable.loginTime})`);

    const peakHours = Array.from({ length: 24 }, (_, h) => ({
      hour:  h,
      count: hourRows.find(r => r.hour === h)?.count ?? 0,
    }));

    // Degree stats
    const degreeRows = await db
      .select({
        degree:      sessionsTable.degree,
        sessions:    count(),
        avgDuration: avg(sessionsTable.durationMinutes),
      })
      .from(sessionsTable)
      .where(condition)
      .groupBy(sessionsTable.degree)
      .orderBy(sql`count(*) DESC`);

    const degreeStats = degreeRows.map(r => ({
      degree:      r.degree,
      sessions:    r.sessions,
      avgDuration: Math.round(Number(r.avgDuration) || 0),
    }));

    // Daily trend (last 7 days regardless of period)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyRows = await db
      .select({
        date:     sql<string>`DATE(${sessionsTable.loginTime})::text`,
        sessions: count(),
      })
      .from(sessionsTable)
      .where(gte(sessionsTable.loginTime, sevenDaysAgo))
      .groupBy(sql`DATE(${sessionsTable.loginTime})`)
      .orderBy(sql`DATE(${sessionsTable.loginTime})`);

    // Top students
    const topRows = await db
      .select({
        studentId:   sessionsTable.studentId,
        name:        sessionsTable.name,
        degree:      sessionsTable.degree,
        visits:      count(),
        avgDuration: avg(sessionsTable.durationMinutes),
      })
      .from(sessionsTable)
      .where(condition)
      .groupBy(sessionsTable.studentId, sessionsTable.name, sessionsTable.degree)
      .orderBy(sql`count(*) DESC`)
      .limit(5);

    const topStudents = topRows.map(r => ({
      studentId:   r.studentId,
      name:        r.name,
      degree:      r.degree,
      visits:      r.visits,
      avgDuration: Math.round(Number(r.avgDuration) || 0),
    }));

    res.json({
      peakHours,
      degreeStats,
      dailyTrend: dailyRows,
      topStudents,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "analytics_error", message: "Failed to fetch analytics." });
  }
});

// ─── Top Students (used by dashboard Top 5 widget) ───────────────────────────

router.get("/top-students", async (req, res) => {
  try {
    const period    = (req.query.period as string) ?? "month";
    const year      = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const month     = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
    const limit     = Math.min(parseInt(req.query.limit as string) || 5, 20);
    const startDate = getStartDate(period, year, month);
    const endDate = getEndDate(period, year, month);
    const conditions = [gte(sessionsTable.loginTime, startDate)];
    if (endDate) conditions.push(lte(sessionsTable.loginTime, endDate));
    const condition = conditions.length > 1 ? and(...conditions) : conditions[0];

    const rows = await db
      .select({
        studentId:    sessionsTable.studentId,
        name:         sessionsTable.name,
        degree:       sessionsTable.degree,
        yearLevel:    sessionsTable.yearLevel,
        sessionCount: count(),
      })
      .from(sessionsTable)
      .where(condition)
      .groupBy(
        sessionsTable.studentId,
        sessionsTable.name,
        sessionsTable.degree,
        sessionsTable.yearLevel,
      )
      .orderBy(sql`count(*) DESC`)
      .limit(limit);

    res.json({ students: rows, period, startDate });
  } catch (err) {
    console.error("Top students error:", err);
    res.status(500).json({ error: "top_students_error", message: "Failed to fetch top students." });
  }
});

// ─── AI Insights ─────────────────────────────────────────────────────────────

router.get("/ai-insights", async (req, res) => {
  try {
    const period    = (req.query.period as string) ?? "month";
    const year      = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const month     = req.query.month ? parseInt(req.query.month as string, 10) : undefined;
    const startDate = getStartDate(period, year, month);
    const endDate = getEndDate(period, year, month);
    const conditions = [gte(sessionsTable.loginTime, startDate)];
    if (endDate) conditions.push(lte(sessionsTable.loginTime, endDate));
    const condition = conditions.length > 1 ? and(...conditions) : conditions[0];

    // Gather stats for the prompt
    const [totalResult] = await db
      .select({ count: count() })
      .from(sessionsTable)
      .where(condition);

    const [activeResult] = await db
      .select({ count: count() })
      .from(sessionsTable)
      .where(and(condition, eq(sessionsTable.isActive, true)));

    const uniqueStudents = await db
      .selectDistinct({ studentId: sessionsTable.studentId })
      .from(sessionsTable)
      .where(condition);

    const [avgResult] = await db
      .select({ avg: avg(sessionsTable.durationMinutes) })
      .from(sessionsTable)
      .where(and(condition, eq(sessionsTable.isActive, false)));

    const degreeStats = await db
      .select({ degree: sessionsTable.degree, count: count() })
      .from(sessionsTable)
      .where(condition)
      .groupBy(sessionsTable.degree)
      .orderBy(sql`count(*) DESC`)
      .limit(3);

    const pcStats = await db
      .select({ pc: sessionsTable.computerNumber, count: count() })
      .from(sessionsTable)
      .where(condition)
      .groupBy(sessionsTable.computerNumber)
      .orderBy(sql`count(*) DESC`)
      .limit(1);

    const topStudents = await db
      .select({ name: sessionsTable.name, count: count() })
      .from(sessionsTable)
      .where(condition)
      .groupBy(sessionsTable.name)
      .orderBy(sql`count(*) DESC`)
      .limit(1);

    // Build prompt
    const prompt = `You are a library usage analyst for a school library PC management system. Based on this data, give 3-4 concise bullet point insights (plain text, no markdown, no asterisks, each line starts with "- "):
- Period: past ${period}
- Total sessions: ${totalResult.count}
- Currently active: ${activeResult.count}
- Unique students: ${uniqueStudents.length}
- Average session duration: ${Math.round(Number(avgResult.avg) || 0)} minutes
- Top courses using PCs: ${degreeStats.map(d => `${d.degree} (${d.count} sessions)`).join(", ") || "No data"}
- Busiest PC: PC ${pcStats[0]?.pc ?? "N/A"} (${pcStats[0]?.count ?? 0} sessions)
- Most frequent student: ${topStudents[0]?.name ?? "N/A"} (${topStudents[0]?.count ?? 0} sessions)
Focus on usage patterns and give one actionable recommendation for the librarian. Be concise and specific.`;

    // Check for API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.json({
        insights: "- AI insights unavailable. Add ANTHROPIC_API_KEY to your .env file to enable this feature.",
        period,
      });
      return;
    }

    // Call the Anthropic API. Bounded by a timeout so a hung upstream cannot
    // hold the request open indefinitely, and errors are surfaced rather than
    // silently rendering "no insights".
    let response: globalThis.Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:      "claude-haiku-4-5",
          max_tokens: 400,
          messages:   [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      console.error("AI insights request failed:", err);
      res.status(504).json({ error: "ai_timeout", message: "The insights service did not respond in time." });
      return;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("AI insights upstream error:", response.status, detail.slice(0, 500));
      res.status(502).json({ error: "ai_upstream_error", message: "The insights service returned an error." });
      return;
    }

    const aiData = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = aiData.content?.[0]?.text ?? "- No insights generated.";

    res.json({ insights: text, period });
  } catch (err) {
    console.error("AI insights error:", err);
    res.status(500).json({ error: "ai_error", message: "Failed to generate AI insights." });
  }
});

export default router;