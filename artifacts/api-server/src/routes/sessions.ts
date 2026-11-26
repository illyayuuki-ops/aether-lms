import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionsTable, studentsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { loadSettings } from "../lib/settings";
import { hashPassword, verifyPassword, isBcryptHash } from "../middlewares/auth";
import { rateLimit } from "../middlewares/rate-limit";
import { MIN_PASSWORD_LENGTH, SESSION_TOKEN_BYTES } from "../lib/config";
import crypto from "node:crypto";

const router: IRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many login attempts. Please wait a few minutes and try again.",
});

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many password attempts. Please wait a few minutes and try again.",
});

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
  password:  z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

// Ownership can be proven three ways:
//   1. currentPassword  — normal in-session change
//   2. sessionToken     — change without re-typing the password
//   3. "first login"    — the account still uses its default password
//                         (mustChangePassword = true, or the stored password
//                         literally equals the student ID). This keeps the
//                         self-service "set my first password" flow working
//                         without letting anyone reset a real password by
//                         simply knowing a student ID.
const ChangePasswordSchema = z.object({
  studentId:       studentIdSchema,
  newPassword:     z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  currentPassword: z.string().min(1).optional(),
  sessionToken:    z.string().min(1).optional(),
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

router.post("/register", passwordLimiter, async (req, res) => {
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
    password:           await hashPassword(parsed.data.password),
    mustChangePassword: false,
    isActive:           true,
  });

  res.status(201).json({ success: true, message: "Account created." });
});

// ─── Login ────────────────────────────────────────────────────────────────────

router.post("/login", loginLimiter, async (req, res) => {
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

  // Opportunistically upgrade legacy plaintext passwords to bcrypt on a
  // successful login, so old imported accounts self-heal without a forced
  // reset. Never blocks the login if the rehash fails.
  if (!isBcryptHash(student.password)) {
    try {
      await db
        .update(studentsTable)
        .set({ password: await hashPassword(password) })
        .where(eq(studentsTable.id, student.id));
    } catch {
      /* best effort */
    }
  }

  const settings = loadSettings();
  const inactivityCutoff = new Date(Date.now() - settings.inactivityLimitMinutes * 60 * 1000);

  // Create the session atomically. The read-then-write sequence below used to
  // race: two simultaneous logins on the same PC could both pass the "in use"
  // check and create two active sessions. `FOR UPDATE` row locks plus running
  // everything in one transaction closes that window.
  let created: { session: typeof sessionsTable.$inferSelect } | { conflict: "pc_in_use" | "already_logged_in" };

  try {
    created = await db.transaction(async (tx) => {
      const [existingPcSession] = await tx
        .select()
        .from(sessionsTable)
        .where(and(eq(sessionsTable.computerNumber, computerNumber), eq(sessionsTable.isActive, true)))
        .limit(1)
        .for("update");

      if (existingPcSession) {
        if (existingPcSession.lastActivity && existingPcSession.lastActivity < inactivityCutoff) {
          const now = new Date();
          await tx
            .update(sessionsTable)
            .set({
              isActive: false,
              logoutTime: now,
              durationMinutes: Math.round((now.getTime() - existingPcSession.loginTime.getTime()) / 60000),
              logoutReason: "inactivity",
            })
            .where(eq(sessionsTable.id, existingPcSession.id));
        } else {
          return { conflict: "pc_in_use" as const };
        }
      }

      const [existingStudentSession] = await tx
        .select()
        .from(sessionsTable)
        .where(and(eq(sessionsTable.studentId, studentId), eq(sessionsTable.isActive, true)))
        .limit(1)
        .for("update");

      if (existingStudentSession) {
        if (existingStudentSession.lastActivity && existingStudentSession.lastActivity < inactivityCutoff) {
          const now = new Date();
          await tx
            .update(sessionsTable)
            .set({
              isActive: false,
              logoutTime: now,
              durationMinutes: Math.round((now.getTime() - existingStudentSession.loginTime.getTime()) / 60000),
              logoutReason: "inactivity",
            })
            .where(eq(sessionsTable.id, existingStudentSession.id));
        } else {
          return { conflict: "already_logged_in" as const };
        }
      }

      const sessionToken = crypto.randomBytes(SESSION_TOKEN_BYTES).toString("hex");

      const [session] = await tx
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

      return { session };
    });
  } catch {
    res.status(500).json({ error: "db_error", message: "Could not start a session. Please try again." });
    return;
  }

  if ("conflict" in created) {
    if (created.conflict === "pc_in_use") {
      res.status(409).json({ error: "pc_in_use", message: "This PC already has an active session." });
    } else {
      res.status(409).json({ error: "already_logged_in", message: "You are already logged in on another PC." });
    }
    return;
  }

  const session = created.session;
  const sessionToken = session.sessionToken;

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
  const { sessionId, active } = req.body ?? {};
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

  // Only refresh lastActivity when the client reports real input activity,
  // so server-side staleness (ghost sweeper / stale-login recovery) is meaningful.
  if (active === true) {
    await db.update(sessionsTable).set({ lastActivity: new Date() })
      .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.isActive, true)));
  }

  res.json({
    success: true,
    active: true,
    sessionTimeLimitMinutes: settings.sessionTimeLimitMinutes,
    remainingMinutes: Math.max(0, settings.sessionTimeLimitMinutes - elapsedMinutes),
  });
});

// ─── Change password ──────────────────────────────────────────────────────────
//
// Authorization: the caller must prove ownership of the account with EITHER
// the current password OR a valid, still-active session token. Previously this
// endpoint accepted only a studentId, so anyone who knew an ID could take over
// the account.

router.post("/change-password", passwordLimiter, async (req, res) => {
  const parsed = ChangePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.errors[0]?.message });
    return;
  }

  const { studentId, newPassword, currentPassword, sessionToken } = parsed.data;

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.studentId, studentId))
    .limit(1);

  if (!student || !student.isActive) {
    res.status(404).json({ error: "not_found", message: "Student not found." });
    return;
  }

  let authorized = false;

  if (currentPassword) {
    authorized = await verifyPassword(currentPassword, student.password);
  }

  if (!authorized && sessionToken) {
    const [activeSession] = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(
        and(
          eq(sessionsTable.studentId, studentId),
          eq(sessionsTable.isActive, true),
          eq(sessionsTable.sessionToken, sessionToken),
        ),
      )
      .limit(1);
    authorized = Boolean(activeSession);
  }

  // First-login / default-password accounts may set their own password without
  // proving ownership — the "secret" is the student ID they already typed.
  if (!authorized) {
    const isDefaultPassword = student.mustChangePassword || student.password === studentId;
    if (isDefaultPassword) authorized = true;
  }

  if (!authorized) {
    res.status(401).json({
      error: "unauthorized",
      message: "Your current password or an active session is required to change your password.",
    });
    return;
  }

  await db
    .update(studentsTable)
    .set({ password: await hashPassword(newPassword), mustChangePassword: false, updatedAt: new Date() })
    .where(eq(studentsTable.id, student.id));

  res.json({ success: true });
});

export default router;