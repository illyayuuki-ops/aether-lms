import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { adminsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || "library-jwt-secret-change-me";
const JWT_EXPIRY = "8h";

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const CreateAdminSchema = z.object({
  username:   z.string().min(3, "Username must be at least 3 characters"),
  password:   z.string().min(4, "Password must be at least 4 characters"),
  secretCode: z.string().min(1, "Secret code is required").optional(),
  role:       z.enum(["librarian", "super_admin"]).optional().default("librarian"),
  isActive:   z.boolean().optional().default(true),
});

const UpdateAdminSchema = z.object({
  username:   z.string().min(3).optional(),
  password:   z.string().min(4).optional(),
  secretCode: z.string().min(1).optional(),
  role:       z.enum(["librarian", "super_admin"]).optional(),
  isActive:   z.boolean().optional(),
});

const adminReturnFields = {
  id:          adminsTable.id,
  username:    adminsTable.username,
  role:        adminsTable.role,
  isActive:    adminsTable.isActive,
  lastLoginAt: adminsTable.lastLoginAt,
  createdAt:   adminsTable.createdAt,
};

// ─── Helper: get caller role from DB ─────────────────────────────────────────
// Instead of trusting a header (which the API client can't send),
// we look up the role using the username stored in the x-caller-username header.
// This is set by use-auth.ts from localStorage on every request.
// Falls back to x-admin-role header for direct API calls.

async function getCallerRole(req: Request): Promise<string> {
  return (req as any).adminRole || "librarian";
}

function isSuperAdminProtected(req: Request): boolean {
  if (typeof (req.body as any)?.protectSuperAdmins === "boolean") {
    return (req.body as any).protectSuperAdmins;
  }
  return (req.headers["x-protect-super-admins"] as string) === "true";
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET / — list all admins
router.get("/", async (_req, res) => {
  const admins = await db
    .select(adminReturnFields)
    .from(adminsTable)
    .orderBy(sql`${adminsTable.createdAt} ASC`);
  res.json({ admins });
});

// POST / — create admin (super_admin only)
router.post("/", async (req, res) => {
  const callerRole = await getCallerRole(req);
  if (callerRole !== "super_admin") {
    res.status(403).json({ error: "forbidden", message: "Only Super Admins can create admin accounts." });
    return;
  }

  const parsed = CreateAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.errors[0]?.message ?? parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.username, parsed.data.username))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "duplicate", message: `Username "${parsed.data.username}" is already taken.` });
    return;
  }

  const [created] = await db
    .insert(adminsTable)
    .values({
      username:   parsed.data.username,
      password:   await bcrypt.hash(parsed.data.password, 10),
      role:       parsed.data.role,
      isActive:   parsed.data.isActive,
      ...(parsed.data.secretCode ? { secretCode: parsed.data.secretCode } as any : {}),
    } as any)
    .returning(adminReturnFields);

  res.status(201).json(created);
});

// PUT /:id — update admin (super_admin only)
router.put("/:id", async (req, res) => {
  const callerRole = await getCallerRole(req);
  if (callerRole !== "super_admin") {
    res.status(403).json({ error: "forbidden", message: "Only Super Admins can edit admin accounts." });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid_id", message: "Invalid admin ID." });
    return;
  }

  const parsed = UpdateAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.errors[0]?.message ?? parsed.error.message });
    return;
  }

  const existing = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.id, id))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "not_found", message: "Admin not found." });
    return;
  }

  const updateData: any = {};
  if (parsed.data.username   !== undefined) updateData.username   = parsed.data.username;
  if (parsed.data.password   !== undefined) updateData.password   = await bcrypt.hash(parsed.data.password, 10);
  if (parsed.data.role       !== undefined) updateData.role       = parsed.data.role;
  if (parsed.data.isActive   !== undefined) updateData.isActive   = parsed.data.isActive;
  if ((parsed.data as any).secretCode !== undefined) updateData.secretCode = (parsed.data as any).secretCode;

  const [updated] = await db
    .update(adminsTable)
    .set(updateData)
    .where(eq(adminsTable.id, id))
    .returning(adminReturnFields);

  res.json(updated);
});

// DELETE /:id — delete admin (super_admin only)
router.delete("/:id", async (req, res) => {
  const callerRole = await getCallerRole(req);
  if (callerRole !== "super_admin") {
    res.status(403).json({ error: "forbidden", message: "Only Super Admins can delete admin accounts." });
    return;
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid_id", message: "Invalid admin ID." });
    return;
  }

  const [target] = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.id, id))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "not_found", message: "Admin not found." });
    return;
  }

  if (isSuperAdminProtected(req) && target.role === "super_admin") {
    res.status(403).json({
      error: "protected",
      message: "Super Admin protection is ON. Disable it first to delete a Super Admin.",
    });
    return;
  }

  await db.delete(adminsTable).where(eq(adminsTable.id, id));
  res.json({ success: true, message: "Admin account deleted." });
});

export default router;