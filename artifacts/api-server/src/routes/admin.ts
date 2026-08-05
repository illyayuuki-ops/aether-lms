import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sessionsTable, adminsTable, pcSettingsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, sql, count, avg } from "drizzle-orm";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import {
  GetAllSessionsQueryParams,
  GetStatsQueryParams,
} from "@workspace/api-zod";
import studentsRouter from "./students";
import adminsMgmtRouter from "./admins-mgmt";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "library-admin-secret-token-2024";
const TOTAL_COMPUTERS = 20;

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ") || auth.slice(7) !== ADMIN_TOKEN) {
    res.status(401).json({ error: "unauthorized", message: "Admin access required." });
    return;
  }
  next();
}

const AdminLoginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// ─── Zod schemas for PC Settings ───────────────────────────────────────────

const PcMappingSchema = z.object({
  pcNumber: z.number().int().positive("PC number must be a positive integer"),
  ipAddress: z
    .string()
    .regex(/^(\d{1,3}\.){3}\d{1,3}$/, "Invalid IP address format (e.g. 192.168.1.101)"),
  label: z.string().nullable().optional(),
});

const BulkPcMappingsSchema = z.object({
  mappings: z.array(PcMappingSchema).min(1, "At least one mapping is required"),
});

// ─── Auth — fully DB-driven, no hardcoded accounts ──────────────────────────

router.post("/login", async (req, res) => {
  const parsed = AdminLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;

  const [admin] = await db
    .select()
    .from(adminsTable)
    .where(and(eq(adminsTable.username, username), eq(adminsTable.isActive, true)))
    .limit(1);

  if (admin && admin.password === password) {
    await db
      .update(adminsTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminsTable.id, admin.id));
    res.json({ token: ADMIN_TOKEN, role: admin.role, username: admin.username, message: "Login successful" });
    return;
  }

  res.status(401).json({ error: "invalid_credentials", message: "Incorrect username or password." });
});

router.use("/students", requireAdmin, studentsRouter);
router.use("/admins", requireAdmin, adminsMgmtRouter);
router.use("/analytics", requireAdmin, analyticsRouter);

// ─── Sessions ───────────────────────────────────────────────────────────────

router.get("/sessions", requireAdmin, async (req, res) => {
  const parsed = GetAllSessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const { startDate, endDate, gradeLevel, computerNumber, page, limit } = parsed.data;
  const pageNum  = page  ?? 1;
  const limitNum = limit ?? 50;
  const conditions = [];

  if (startDate) conditions.push(gte(sessionsTable.loginTime, new Date(startDate as unknown as string)));
  if (endDate) {
    const end = new Date(endDate as unknown as string);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(sessionsTable.loginTime, end));
  }
  if (gradeLevel)     conditions.push(eq(sessionsTable.degree, gradeLevel));
  if (computerNumber) conditions.push(eq(sessionsTable.computerNumber, Number(computerNumber)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db.select({ count: count() }).from(sessionsTable).where(whereClause);

  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(whereClause)
    .orderBy(sql`${sessionsTable.loginTime} DESC`)
    .limit(limitNum)
    .offset((pageNum - 1) * limitNum);

  const mapped = sessions.map((s) => ({
    sessionId: s.id, studentId: s.studentId, name: s.name,
    degree: s.degree, yearLevel: s.yearLevel, computerNumber: s.computerNumber,
    researchTopic: s.researchTopic, loginTime: s.loginTime, logoutTime: s.logoutTime,
    durationMinutes: s.durationMinutes, logoutReason: s.logoutReason, isActive: s.isActive,
  }));

  res.json({ sessions: mapped, total: totalResult.count, page: pageNum, limit: limitNum });
});

// ─── DELETE a session log ────────────────────────────────────────────────────

router.delete("/sessions/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id", message: "Session ID must be a number." }); return; }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id)).limit(1);
  if (!session)          { res.status(404).json({ error: "not_found",      message: "Session not found." }); return; }
  if (session.isActive)  { res.status(409).json({ error: "session_active", message: "Cannot delete an active session." }); return; }

  await db.delete(sessionsTable).where(eq(sessionsTable.id, id));
  res.json({ success: true, message: "Session deleted." });
});

// ─── Stats ──────────────────────────────────────────────────────────────────

router.get("/stats", requireAdmin, async (req, res) => {
  const parsed = GetStatsQueryParams.safeParse(req.query);
  const period = parsed.success ? (parsed.data.period ?? "today") : "today";

  const now = new Date();
  let startDate: Date;
  switch (period) {
    case "week":  startDate = new Date(now); startDate.setDate(now.getDate() - 7); break;
    case "month": startDate = new Date(now); startDate.setMonth(now.getMonth() - 1); break;
    case "year":  startDate = new Date(now); startDate.setFullYear(now.getFullYear() - 1); break;
    default:      startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
  }

  const periodCondition = gte(sessionsTable.loginTime, startDate);

  const [totalResult]  = await db.select({ count: count() }).from(sessionsTable).where(periodCondition);
  const [activeResult] = await db.select({ count: count() }).from(sessionsTable).where(and(periodCondition, eq(sessionsTable.isActive, true)));
  const uniqueStudentsResult = await db.selectDistinct({ studentId: sessionsTable.studentId }).from(sessionsTable).where(periodCondition);
  const [avgResult] = await db.select({ avg: avg(sessionsTable.durationMinutes) }).from(sessionsTable).where(and(periodCondition, eq(sessionsTable.isActive, false)));

  const gradeLevelStats = await db
    .select({ gradeLevel: sessionsTable.degree, count: count() })
    .from(sessionsTable).where(periodCondition).groupBy(sessionsTable.degree);

  const computerStats = await db
    .select({ computerNumber: sessionsTable.computerNumber, count: count() })
    .from(sessionsTable).where(periodCondition)
    .groupBy(sessionsTable.computerNumber).orderBy(sessionsTable.computerNumber);

  res.json({
    totalSessions: totalResult.count,
    activeSessions: activeResult.count,
    uniqueStudents: uniqueStudentsResult.length,
    avgDurationMinutes: Math.round(Number(avgResult.avg) || 0),
    byGradeLevel: gradeLevelStats.map((g) => ({ gradeLevel: g.gradeLevel, count: g.count })),
    byComputer:   computerStats.map((c)  => ({ computerNumber: c.computerNumber, count: c.count })),
  });
});

// ─── Analytics — Daily trend (fixes 404 on /analytics/daily) ────────────────

router.get("/analytics/daily", requireAdmin, async (req, res) => {
  const days = Math.min(parseInt(req.query.days as string) || 7, 90);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      date:     sql<string>`DATE(${sessionsTable.loginTime})::text`,
      sessions: count(),
    })
    .from(sessionsTable)
    .where(gte(sessionsTable.loginTime, startDate))
    .groupBy(sql`DATE(${sessionsTable.loginTime})`)
    .orderBy(sql`DATE(${sessionsTable.loginTime})`);

  // Fill missing days with 0 so chart has no gaps
  const result: { date: string; sessions: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const found = rows.find((r) => r.date === dateStr);
    result.push({ date: dateStr, sessions: found ? Number(found.sessions) : 0 });
  }

  res.json({ daily: result, days });
});

// ─── Computers ──────────────────────────────────────────────────────────────

router.get("/computers", requireAdmin, async (_req, res) => {
  const activeSessions = await db.select().from(sessionsTable).where(eq(sessionsTable.isActive, true));
  const now = new Date();

  const activeMap = new Map(
    activeSessions.map((s) => [s.computerNumber, {
      sessionId: s.id, studentId: s.studentId, name: s.name,
      degree: s.degree, yearLevel: s.yearLevel, computerNumber: s.computerNumber,
      researchTopic: s.researchTopic, loginTime: s.loginTime, lastActivity: s.lastActivity,
      elapsedMinutes: Math.round((now.getTime() - s.loginTime.getTime()) / 60000),
      timeLimitMinutes: 60, inactivityLimitMinutes: 10,
    }])
  );

  const computers = Array.from({ length: TOTAL_COMPUTERS }, (_, i) => {
    const num = i + 1;
    const session = activeMap.get(num) ?? null;
    return { computerNumber: num, isInUse: !!session, currentSession: session };
  });

  res.json({ computers, totalComputers: TOTAL_COMPUTERS, inUse: activeSessions.length, available: TOTAL_COMPUTERS - activeSessions.length });
});

// ─── System Settings — persisted to disk ─────────────────────────────────────

const SETTINGS_FILE = path.join(process.cwd(), "system-settings.json");

const DEFAULT_SYSTEM_SETTINGS = {
  inactivityLimitMinutes: 10,
  sessionTimeLimitMinutes: 60,
  courses: [
    "BEED", "BSA", "BSBA", "BSED", "BSHM", "BSIE", "BSIT", "BSMA", "BSP", "BSTM",
    "SHS", "STEM", "ABM", "HUMSS", "GAS",
    "TVL - ICT", "TVL - HE", "TVL - IA", "TVL - AFA",
    "SPORTS", "ARTS & DESIGN",
    "JHS", "MS", "LS", "KS",
  ],
  yearLevels: ["1","2","3","4","5","6","7","8","9","10","11","12"],
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
      return { ...DEFAULT_SYSTEM_SETTINGS, ...JSON.parse(raw) };
    }
  } catch { }
  return { ...DEFAULT_SYSTEM_SETTINGS };
}

function saveSettings(settings: typeof DEFAULT_SYSTEM_SETTINGS) {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8"); } catch { }
}

let systemSettings = loadSettings();

router.get("/settings/system", requireAdmin, (_req, res) => {
  res.json(systemSettings);
});

router.put("/settings/system", requireAdmin, async (req, res) => {
  const SystemSettingsSchema = z.object({
    inactivityLimitMinutes: z.number().int().min(1).max(120).optional(),
    sessionTimeLimitMinutes: z.number().int().min(1).max(480).optional(),
    courses:    z.array(z.string().min(1)).min(1).optional(),
    yearLevels: z.array(z.string().min(1)).min(1).optional(),
  });

  const parsed = SystemSettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "validation_error", message: parsed.error.message }); return; }

  systemSettings = { ...systemSettings, ...parsed.data };
  saveSettings(systemSettings);
  res.json({ success: true, settings: systemSettings });
});

// ─── PC Detection ────────────────────────────────────────────────────────────

router.get("/settings/pc-mappings/detect", async (req, res) => {
  const rawQueryIp = req.query.ip;
  const ip = Array.isArray(rawQueryIp) ? rawQueryIp[0] : rawQueryIp as string | undefined;

  const fwdHeader = req.headers["x-forwarded-for"];
  const fwdStr = Array.isArray(fwdHeader) ? fwdHeader[0] : fwdHeader;

  const rawIp: string =
    (typeof ip === "string" ? ip : undefined) ??
    (typeof fwdStr === "string" ? fwdStr.split(",")[0]?.trim() : undefined) ??
    req.socket.remoteAddress ??
    "";

  const clientIp = rawIp.replace("::ffff:", "");

  if (!clientIp) {
    return res.status(400).json({ error: "no_ip", message: "Could not determine client IP address." });
  }

  const isLocalhost = clientIp === "127.0.0.1" || clientIp === "::1";

  const [match] = await db.select().from(pcSettingsTable).where(eq(pcSettingsTable.ipAddress, clientIp)).limit(1);

  if (match) {
    return res.json({ pcNumber: match.pcNumber, ipAddress: match.ipAddress, label: match.label, detectedIp: clientIp });
  }

  if (isLocalhost) {
    return res.json({ pcNumber: 1, detectedIp: clientIp, isFallback: true, message: "Dev mode fallback (localhost)" });
  }

  return res.status(404).json({ error: "not_found", message: `No PC assigned to IP: ${clientIp}`, detectedIp: clientIp });
});

// ─── PC Mapping CRUD ──────────────────────────────────────────────────────────

// GET all PC mappings
router.get("/settings/pc-mappings", requireAdmin, async (_req, res) => {
  try {
    const mappings = await db.select().from(pcSettingsTable);
    res.json({ mappings });
  } catch {
    res.status(500).json({ error: "db_error", message: "Failed to fetch PC mappings." });
  }
});

// POST — save a single PC mapping (insert or update)
router.post("/settings/pc-mappings", requireAdmin, async (req, res) => {
  const parsed = PcMappingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }
  const { pcNumber, ipAddress, label } = parsed.data;
  try {
    const [existing] = await db.select().from(pcSettingsTable).where(eq(pcSettingsTable.pcNumber, pcNumber)).limit(1);
    if (existing) {
      await db.update(pcSettingsTable).set({ ipAddress, label, updatedAt: new Date() }).where(eq(pcSettingsTable.pcNumber, pcNumber));
    } else {
      await db.insert(pcSettingsTable).values({ pcNumber, ipAddress, label: label || `PC-${pcNumber}` });
    }
    res.json({ success: true, message: `PC ${pcNumber} mapping saved.` });
  } catch {
    res.status(500).json({ error: "db_error", message: "Failed to save PC mapping." });
  }
});

// DELETE a PC mapping
router.delete("/settings/pc-mappings/:pcNumber", requireAdmin, async (req, res) => {
  const pcNumber = parseInt(String(req.params.pcNumber), 10);
  if (isNaN(pcNumber)) { res.status(400).json({ error: "invalid_id" }); return; }
  try {
    await db.delete(pcSettingsTable).where(eq(pcSettingsTable.pcNumber, pcNumber));
    res.json({ success: true, message: `PC ${pcNumber} mapping removed.` });
  } catch {
    res.status(500).json({ error: "db_error", message: "Failed to delete PC mapping." });
  }
});

// ─── Auth Routes (no Bearer required) ────────────────────────────────────────

// POST /auth/verify-secret — verify username + secret code for password reset
router.post("/auth/verify-secret", async (req, res) => {
  const { username, secretCode } = req.body ?? {};
  if (!username || !secretCode) {
    res.status(400).json({ error: "missing_fields", message: "Username and secret code are required." });
    return;
  }
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.username, username)).limit(1);
  if (!admin || !(admin as any).secretCode || (admin as any).secretCode !== secretCode) {
    res.status(401).json({ error: "invalid", message: "Username or secret code is incorrect." });
    return;
  }
  res.json({ success: true });
});

// POST /auth/reset-password — reset password after secret code verified
router.post("/auth/reset-password", async (req, res) => {
  const { username, secretCode, newPassword } = req.body ?? {};
  if (!username || !secretCode || !newPassword) {
    res.status(400).json({ error: "missing_fields", message: "All fields are required." });
    return;
  }
  if (newPassword.length < 4) {
    res.status(400).json({ error: "weak_password", message: "Password must be at least 4 characters." });
    return;
  }
  const [admin] = await db.select().from(adminsTable).where(eq(adminsTable.username, username)).limit(1);
  if (!admin || !(admin as any).secretCode || (admin as any).secretCode !== secretCode) {
    res.status(401).json({ error: "invalid", message: "Username or secret code is incorrect." });
    return;
  }
  await db.update(adminsTable).set({ password: newPassword } as any).where(eq(adminsTable.id, admin.id));
  res.json({ success: true, message: "Password reset successfully." });
});

// POST /auth/first-setup — create first admin when no admins exist
router.post("/auth/first-setup", async (req, res) => {
  const { username, password, secretCode, setupCode } = req.body ?? {};

  // Verify setup code from env
  const validSetupCode = process.env.SETUP_CODE || "setup-aether-2024";
  if (setupCode !== validSetupCode) {
    res.status(403).json({ error: "invalid_setup_code", message: "Invalid setup code. Check your .env file." });
    return;
  }

  // Only allow if no admins exist yet
  const [existing] = await db.select({ id: adminsTable.id }).from(adminsTable).limit(1);
  if (existing) {
    res.status(409).json({ error: "already_setup", message: "An admin already exists. Use the login page." });
    return;
  }

  if (!username || username.length < 3) {
    res.status(400).json({ error: "validation_error", message: "Username must be at least 3 characters." });
    return;
  }
  if (!password || password.length < 4) {
    res.status(400).json({ error: "validation_error", message: "Password must be at least 4 characters." });
    return;
  }
  if (!secretCode) {
    res.status(400).json({ error: "validation_error", message: "Secret code is required." });
    return;
  }

  await db.insert(adminsTable).values({
    username, password, role: "super_admin", isActive: true,
    ...(({ secretCode } as any)),
  } as any);

  res.status(201).json({ success: true, message: "Admin account created." });
});

export default router;