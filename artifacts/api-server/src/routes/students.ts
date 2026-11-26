import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { studentsTable } from "@workspace/db/schema";
import { eq, and, sql, count } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "../middlewares/auth";
import { MIN_PASSWORD_LENGTH } from "../lib/config";

const router: IRouter = Router();

// ── Validation schemas ──────────────────────────────────────────────────────

const StudentBodySchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  degree: z.string().min(1, "Degree is required"),
  major: z.string().optional().nullable(),
  yearLevel: z.string().min(1, "Year level is required"),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`).optional(),
  isActive: z.boolean().optional(),
});

const ResetPasswordSchema = z.object({
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  mustChangePassword: z.boolean().optional().default(false),
});

// ── GET /ids (all id/studentId pairs — lightweight, no pagination cap) ──
// Used by the admin import flow to check existing Student IDs without
// pulling the full student list (?limit=9999 was clamped to 100 server-side).

router.get("/ids", async (_req, res) => {
  const students = await db
    .select({
      id:        studentsTable.id,
      studentId: studentsTable.studentId,
      name:      studentsTable.name,
    })
    .from(studentsTable)
    .orderBy(sql`${studentsTable.name} ASC`);

  res.json({ students });
});

// ── GET /  (list with search/filter/pagination) ────────────────────────────

router.get("/", async (req, res) => {
  const {
    search,
    degree,
    yearLevel,
    page = "1",
    limit = "20",
  } = req.query as Record<string, string>;

  const pageNum  = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

  const conditions = [];

  // ── Filters ──────────────────────────────────────────────────────
  // Degree: fuzzy ILIKE both directions to handle mismatches between old
  // stored values (e.g. "BSIT") and new settings-driven values.
  // Year level: EXACT match only — bidirectional ILIKE made "1" match
  // "10"/"11"/"12". Stored values are plain strings ("1".."12") and the
  // admin UI sends exact dropdown values.

  if (degree) {
    conditions.push(
      sql`(${studentsTable.degree} ILIKE ${"%" + degree + "%"} OR ${degree} ILIKE CONCAT('%', ${studentsTable.degree}, '%'))`
    );
  }

  if (yearLevel) {
    conditions.push(eq(studentsTable.yearLevel, yearLevel));
  }

  if (search) {
    conditions.push(
      sql`(${studentsTable.studentId} ILIKE ${"%" + search + "%"} OR ${studentsTable.name} ILIKE ${"%" + search + "%"})`
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(studentsTable)
    .where(where);

  const students = await db
    .select({
      id:                 studentsTable.id,
      studentId:          studentsTable.studentId,
      name:               studentsTable.name,
      degree:             studentsTable.degree,
      major:              studentsTable.major,
      yearLevel:          studentsTable.yearLevel,
      mustChangePassword: studentsTable.mustChangePassword,
      isActive:           studentsTable.isActive,
      createdAt:          studentsTable.createdAt,
      updatedAt:          studentsTable.updatedAt,
    })
    .from(studentsTable)
    .where(where)
    .orderBy(sql`${studentsTable.name} ASC`)
    .limit(limitNum)
    .offset((pageNum - 1) * limitNum);

  res.json({ students, total, page: pageNum, limit: limitNum });
});

// ── POST /  (create student) ───────────────────────────────────────────────

router.post("/", async (req, res) => {
  const parsed = StudentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.studentId, parsed.data.studentId))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({
      error: "duplicate",
      message: `Student ID ${parsed.data.studentId} is already registered.`,
    });
    return;
  }

  // Default password is the student ID, so force a change on first login.
  const usingDefaultPassword = !parsed.data.password;
  const password = parsed.data.password ?? parsed.data.studentId;
  const hashedPassword = await hashPassword(password);

  const [created] = await db
    .insert(studentsTable)
    .values({
      studentId:          parsed.data.studentId,
      name:               parsed.data.name,
      degree:             parsed.data.degree,
      major:              parsed.data.major ?? null,
      yearLevel:          parsed.data.yearLevel,
      password:           hashedPassword,
      mustChangePassword: usingDefaultPassword,
      isActive:           parsed.data.isActive ?? true,
    })
    .returning({
      id:                 studentsTable.id,
      studentId:          studentsTable.studentId,
      name:               studentsTable.name,
      degree:             studentsTable.degree,
      major:              studentsTable.major,
      yearLevel:          studentsTable.yearLevel,
      mustChangePassword: studentsTable.mustChangePassword,
      isActive:           studentsTable.isActive,
      createdAt:          studentsTable.createdAt,
    });

  res.status(201).json(created);
});

// ── PUT /:id  (update student info) ───────────────────────────────────────

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid_id", message: "Invalid student ID." });
    return;
  }

  const parsed = StudentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const existingById = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, id))
    .limit(1);

  if (existingById.length === 0) {
    res.status(404).json({ error: "not_found", message: "Student not found." });
    return;
  }

  const duplicate = await db
    .select()
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.studentId, parsed.data.studentId),
        sql`${studentsTable.id} != ${id}`
      )
    )
    .limit(1);

  if (duplicate.length > 0) {
    res.status(409).json({
      error: "duplicate",
      message: `Student ID ${parsed.data.studentId} is already used by another student.`,
    });
    return;
  }

  const updatePayload: Record<string, unknown> = {
    studentId: parsed.data.studentId,
    name:      parsed.data.name,
    degree:    parsed.data.degree,
    major:     parsed.data.major ?? null,
    yearLevel: parsed.data.yearLevel,
    isActive:  parsed.data.isActive ?? true,
    updatedAt: new Date(),
  };

  if (parsed.data.password) {
    updatePayload.password             = await hashPassword(parsed.data.password);
    updatePayload.mustChangePassword   = false;
  }

  const [updated] = await db
    .update(studentsTable)
    .set(updatePayload)
    .where(eq(studentsTable.id, id))
    .returning({
      id:                 studentsTable.id,
      studentId:          studentsTable.studentId,
      name:               studentsTable.name,
      degree:             studentsTable.degree,
      major:              studentsTable.major,
      yearLevel:          studentsTable.yearLevel,
      mustChangePassword: studentsTable.mustChangePassword,
      isActive:           studentsTable.isActive,
      updatedAt:          studentsTable.updatedAt,
    });

  res.json(updated);
});

// ── POST /:id/reset-password ───────────────────────────────────────────────

router.post("/:id/reset-password", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid_id", message: "Invalid student ID." });
    return;
  }

  const parsed = ResetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, id))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "not_found", message: "Student not found." });
    return;
  }

  const hashedPassword = await hashPassword(parsed.data.newPassword);

  await db
    .update(studentsTable)
    .set({
      password:           hashedPassword,
      mustChangePassword: parsed.data.mustChangePassword,
      updatedAt:          new Date(),
    })
    .where(eq(studentsTable.id, id));

  res.json({
    success:            true,
    message:            "Password has been reset successfully.",
    mustChangePassword: parsed.data.mustChangePassword,
  });
});

// ── DELETE /:id ────────────────────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid_id", message: "Invalid student ID." });
    return;
  }

  const existing = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, id))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "not_found", message: "Student not found." });
    return;
  }

  await db.delete(studentsTable).where(eq(studentsTable.id, id));
  res.json({ success: true, message: "Student deleted." });
});

export default router;