import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { adminsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "../middlewares/auth";
import { MIN_PASSWORD_LENGTH } from "../lib/config";

/**
 * Admin account management.
 *
 * Every route here is already mounted behind `requireAdmin` by the parent
 * router in admin.ts. Authorization for the *role* is enforced by
 * `requireSuperAdmin`, which reads the role from the verified JWT — the old
 * implementation trusted a client-supplied `x-admin-role` header, letting any
 * librarian escalate to super_admin.
 */

const router: IRouter = Router();

const PASSWORD_RULE = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);

const CreateAdminSchema = z.object({
  username:   z.string().min(3, "Username must be at least 3 characters"),
  password:   PASSWORD_RULE,
  secretCode: z.string().min(6, "Secret code must be at least 6 characters").optional(),
  role:       z.enum(["librarian", "super_admin"]).optional().default("librarian"),
  isActive:   z.boolean().optional().default(true),
});

const UpdateAdminSchema = z.object({
  username:   z.string().min(3).optional(),
  password:   PASSWORD_RULE.optional(),
  secretCode: z.string().min(6).optional(),
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

/**
 * Super Admins can only be removed if the caller explicitly opts in. This is
 * a deliberate guardrail, not a security control (role checks happen above).
 */
function isSuperAdminProtected(req: import("express").Request): boolean {
  if (typeof (req.body as any)?.protectSuperAdmins === "boolean") {
    return (req.body as any).protectSuperAdmins;
  }
  return (req.headers["x-protect-super-admins"] as string) === "true";
}

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
  if (req.adminRole !== "super_admin") {
    res.status(403).json({ error: "forbidden", message: "Only Super Admins can create admin accounts." });
    return;
  }

  const parsed = CreateAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", message: parsed.error.errors[0]?.message ?? parsed.error.message });
    return;
  }

  const existing = await db
    .select({ id: adminsTable.id })
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
      username: parsed.data.username,
      password: await hashPassword(parsed.data.password),
      role: parsed.data.role,
      isActive: parsed.data.isActive,
      ...(parsed.data.secretCode
        ? { secretCode: await hashPassword(parsed.data.secretCode) }
        : {}),
    })
    .returning(adminReturnFields);

  res.status(201).json(created);
});

// PUT /:id — update admin (super_admin only)
router.put("/:id", async (req, res) => {
  if (req.adminRole !== "super_admin") {
    res.status(403).json({ error: "forbidden", message: "Only Super Admins can edit admin accounts." });
    return;
  }

  const id = parseInt(req.params.id, 10);
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
    .select({ id: adminsTable.id, role: adminsTable.role })
    .from(adminsTable)
    .where(eq(adminsTable.id, id))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: "not_found", message: "Admin not found." });
    return;
  }

  // Guardrail: never let a caller demote the last remaining super_admin.
  if (existing[0].role === "super_admin" && parsed.data.role && parsed.data.role !== "super_admin") {
    const [{ count: superCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminsTable)
      .where(eq(adminsTable.role, "super_admin"));
    if (Number(superCount) <= 1) {
      res.status(409).json({ error: "last_super_admin", message: "Cannot demote the last Super Admin." });
      return;
    }
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.username   !== undefined) updateData.username   = parsed.data.username;
  if (parsed.data.password   !== undefined) updateData.password   = await hashPassword(parsed.data.password);
  if (parsed.data.role       !== undefined) updateData.role       = parsed.data.role;
  if (parsed.data.isActive   !== undefined) updateData.isActive   = parsed.data.isActive;
  if (parsed.data.secretCode !== undefined) updateData.secretCode = await hashPassword(parsed.data.secretCode);

  const [updated] = await db
    .update(adminsTable)
    .set(updateData)
    .where(eq(adminsTable.id, id))
    .returning(adminReturnFields);

  res.json(updated);
});

// DELETE /:id — delete admin (super_admin only)
router.delete("/:id", async (req, res) => {
  if (req.adminRole !== "super_admin") {
    res.status(403).json({ error: "forbidden", message: "Only Super Admins can delete admin accounts." });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid_id", message: "Invalid admin ID." });
    return;
  }

  const [target] = await db
    .select({ id: adminsTable.id, role: adminsTable.role, username: adminsTable.username })
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

  // Never allow deleting the last super_admin (would lock everyone out).
  if (target.role === "super_admin") {
    const [{ count: superCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adminsTable)
      .where(eq(adminsTable.role, "super_admin"));
    if (Number(superCount) <= 1) {
      res.status(409).json({ error: "last_super_admin", message: "Cannot delete the last Super Admin." });
      return;
    }
  }

  await db.delete(adminsTable).where(eq(adminsTable.id, id));
  res.json({ success: true, message: "Admin account deleted." });
});

export default router;
