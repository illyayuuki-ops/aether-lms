import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionsTable, studentsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { loadSettings } from "../routes/admin";
import crypto from "node:crypto";
import bcrypt from "bcrypt";

const router: IRouter = Router();

function isBcryptHash(value: string): boolean {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}

async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (isBcryptHash(stored)) {
    try {
      return await bcrypt.compare(plain, stored);
    } catch {
      return false;
    }
  }
  return plain === stored;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const studentIdSchema = z
  .string()
  .regex(/^\d{2}-\d{5}$/, "Student ID must be in YY-NNNNN format (e.g. 24-12913)");

const LoginSchema = z.object({
  studentId:      studentIdSchema,
  password:       z.string().min(1, "Password is required"),
  computerNumber: z.number().int().positive("Computer number is required"),
});

const RegisterSchema = z.object({
  studentId: studentIdSchema,
  name:      z.string().min(2, "Name is required"),
  degree:    z.string().min(1, "Course is required"),
  yearLevel: z.string().min(1, "Year level is required"),
  password:  z.string().min(4, "Password must be at least 4 characters"),
});

const ChangePasswordSchema = z.object({
  studentId:   studentIdSchema,
  newPassword: z.string().min(4, "Password must be at least 4 characters"),
});

// ─── Lookup student ───────────────────────────────────────────────────────────

router.get("/lookup", async (req, res) => {
  const studentId = req.query.studentId as string;
  if (!studentId) {
    res.status(400).json({ error: "missing", message: "studentId is required." });
    return;
  }

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.studentId, studentId))
    .limit(1);

  if (!student) {
    res.status(404).json({ error: "not_found", message: "Student not found." });
    return;
  }

  res.json({
    studentId: student.studentId,
    name:      student.name,
    degree:    student.degree,
    yearLevel: student.yearLevel,
    isActive:  student.isActive,
    mustChangePassword: student.mustChangePassword,
  });
});

// ─── Register (self-service) ──────────────────────────────────────────────────

router.post("/register", async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.errors[0]?.message });
    return;
  }

  const existing = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.studentId, parsed.data.studentId))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "exists", message: "This Student ID is already registered." });
    return;
  }

  await db.insert(studentsTable).values({
    studentId:          parsed.data.studentId,
    name:               parsed.data.name,
    degree:             parsed.data.degree,
    yearLevel:          parsed.data.yearLevel,
    password:           parsed.data.password,
    mustChangePassword: false,
    isActive:           true,
  });

  res.status(201).json({ success: true, message: "Account created." });
});

// ─── Login ────────────────────────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.errors[0]?.message });
    return;
  }

  const { studentId, password, computerNumber } = parsed.data;

  // Find student
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.studentId, studentId))
    .limit(1);

  if (!student) {
    res.status(401).json({ error: "not_found", message: "Student ID not found. Please contact the librarian." });
    return;
  }

  if (!student.isActive) {
    res.status(401).json({ error: "inactive", message: "Your account is inactive. Please contact the librarian." });
    return;
  }

  const passwordValid = await verifyPassword(password, student.password);
  if (!passwordValid) {
    res.status(401).json({ error: "wrong_password", message: "Incorrect password." });
    return;
  }

  const settings = loadSettings();
  const inactivityCutoff = new Date(Date.now() - settings.inactivityLimitMinutes * 60 * 1000);

  // Check if PC already has an active session
  const [existingPcSession] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.computerNumber, computerNumber), eq(sessionsTable.isActive, true)))
    .limit(1);

  if (existingPcSession) {
    // If stale (no activity for inactivity limit), close it and proceed
    if (existingPcSession.lastActivity && existingPcSession.lastActivity < inactivityCutoff) {
      const now = new Date();
      await db
        .update(sessionsTable)
        .set({
          isActive: false,
          logoutTime: now,
          durationMinutes: Math.round((now.getTime() - existingPcSession.loginTime.getTime()) / 60000),
          logoutReason: "inactivity",
        })
        .where(eq(sessionsTable.id, existingPcSession.id));
    } else {
      res.status(409).json({ error: "pc_in_use", message: "This PC already has an active session." });
      return;
    }
  }

  // Check if student already has an active session elsewhere
  const [existingStudentSession] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.studentId, studentId), eq(sessionsTable.isActive, true)))
    .limit(1);

  if (existingStudentSession) {
    // If stale (no activity for inactivity limit), close it and proceed
    if (existingStudentSession.lastActivity && existingStudentSession.lastActivity < inactivityCutoff) {
      const now = new Date();
      await db
        .update(sessionsTable)
        .set({
          isActive: false,
          logoutTime: now,
          durationMinutes: Math.round((now.getTime() - existingStudentSession.loginTime.getTime()) / 60000),
          logoutReason: "inactivity",
        })
        .where(eq(sessionsTable.id, existingStudentSession.id));
    } else {
      res.status(409).json({ error: "already_logged_in", message: "You are already logged in on another PC." });
      return;
    }
  }

  // Create session
  const sessionToken = crypto.randomBytes(32).toString("hex");

  const [session] = await db
    .insert(sessionsTable)
    .values({
      studentId:      student.studentId,
      name:           student.name,
      degree:         student.degree,
      yearLevel:      student.yearLevel,
      computerNumber,
      loginTime:      new Date(),
      lastActivity:   new Date(),
      isActive:       true,
      sessionToken,
    })
    .returning();

  res.json({
    sessionId:          session.id,
    studentId:          student.studentId,
    name:               student.name,
    degree:             student.degree,
    yearLevel:          student.yearLevel,
    computerNumber:     session.computerNumber,
    loginTime:          session.loginTime,
    mustChangePassword: student.mustChangePassword,
    sessionToken,
    inactivityLimitMinutes: settings.inactivityLimitMinutes,
    sessionTimeLimitMinutes: settings.sessionTimeLimitMinutes,
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

router.post("/logout", async (req, res) => {
  let body: any = req.body ?? {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (Buffer.isBuffer(body)) {
    try { body = JSON.parse(body.toString("utf8")); } catch { body = {}; }
  }

  const { sessionId, reason, sessionToken } = body;

  if (!sessionId) {
    res.status(400).json({ error: "missing", message: "sessionId is required." });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);

  if (!session) {
    res.status(404).json({ error: "not_found", message: "Session not found." });
    return;
  }

  if (!session.isActive) {
    res.json({ success: true, message: "Session already ended." });
    return;
  }

  if (session.sessionToken && session.sessionToken !== sessionToken) {
    res.status(403).json({ error: "forbidden", message: "Invalid session token." });
    return;
  }

  const now      = new Date();
  const duration = Math.round((now.getTime() - session.loginTime.getTime()) / 60000);

  await db
    .update(sessionsTable)
    .set({
      isActive:        false,
      logoutTime:      now,
      durationMinutes: duration,
      logoutReason:    reason ?? "manual",
    })
    .where(eq(sessionsTable.id, sessionId));

  res.json({ success: true, durationMinutes: duration });
});

// ─── Heartbeat (keeps session alive) ─────────────────────────────────────────

router.post("/heartbeat", async (req, res) => {
  const { sessionId } = req.body ?? {};
  if (!sessionId) { res.status(400).json({ error: "missing" }); return; }

  const [session] = await db
    .select({ 
      id: sessionsTable.id, 
      isActive: sessionsTable.isActive, 
      loginTime: sessionsTable.loginTime 
    })
    .from(sessionsTable)
    .where(eq(sessionsTable.id, sessionId))
    .limit(1);

  if (!session) { res.json({ active: false, error: "not_found" }); return; }
  if (!session.isActive) { res.json({ active: false, error: "session_ended" }); return; }

  const settings = loadSettings();
  const elapsedMinutes = (Date.now() - session.loginTime.getTime()) / 60000;
  if (elapsedMinutes > settings.sessionTimeLimitMinutes) {
    const now = new Date();
    await db.update(sessionsTable).set({
      isActive: false,
      logoutTime: now,
      durationMinutes: Math.round((now.getTime() - session.loginTime.getTime()) / 60000),
      logoutReason: "time_limit",
    }).where(eq(sessionsTable.id, sessionId));
    res.json({ active: false, error: "time_limit" });
    return;
  }

  await db.update(sessionsTable).set({ lastActivity: new Date() })
    .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.isActive, true)));

  res.json({
    success: true,
    active: true,
    sessionTimeLimitMinutes: settings.sessionTimeLimitMinutes,
    remainingMinutes: Math.max(0, settings.sessionTimeLimitMinutes - elapsedMinutes),
  });
});

// ─── Change password ──────────────────────────────────────────────────────────

router.post("/change-password", async (req, res) => {
  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.errors[0]?.message });
    return;
  }

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.studentId, parsed.data.studentId))
    .limit(1);

  if (!student) {
    res.status(404).json({ error: "not_found", message: "Student not found." });
    return;
  }

  await db
    .update(studentsTable)
    .set({ password: parsed.data.newPassword, mustChangePassword: false, updatedAt: new Date() })
    .where(eq(studentsTable.id, student.id));

  res.json({ success: true });
});

export default router;