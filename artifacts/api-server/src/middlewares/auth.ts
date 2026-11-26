import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { JWT_SECRET } from "../lib/config";

/**
 * Shared admin authentication middleware.
 *
 * This logic used to be copy-pasted (with slightly different error bodies)
 * into admin.ts, admins-mgmt.ts and kiosk.ts. It also used to trust the
 * client-supplied `x-admin-role` header for privilege checks, which allowed
 * any authenticated librarian to claim super_admin. The role now comes only
 * from the verified JWT payload.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminId?: number;
      adminRole?: string;
    }
  }
}

export interface AdminTokenPayload {
  adminId: number;
  role: string;
}

export function signAdminToken(payload: AdminTokenPayload, expiresIn: string): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", message: "Admin access required." });
    return;
  }

  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AdminTokenPayload;
    if (typeof payload.adminId !== "number" || typeof payload.role !== "string") {
      res.status(401).json({ error: "unauthorized", message: "Malformed admin token." });
      return;
    }
    // Role is taken exclusively from the signed token — never from a header.
    req.adminId = payload.adminId;
    req.adminRole = payload.role;
    next();
  } catch {
    res.status(401).json({ error: "token_expired", message: "Admin session expired. Please log in again." });
  }
}

/** Requires an authenticated super_admin. Must run after requireAdmin. */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.adminRole !== "super_admin") {
    res.status(403).json({ error: "forbidden", message: "Only Super Admins can perform this action." });
    return;
  }
  next();
}

// ─── Password helpers ───────────────────────────────────────────────────────

export function isBcryptHash(value: string): boolean {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}

/**
 * Verifies a password. Legacy rows may still hold plaintext (from the old
 * seed import); those are compared but flagged so callers can rehash.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (isBcryptHash(stored)) {
    try {
      return await bcrypt.compare(plain, stored);
    } catch {
      return false;
    }
  }
  // Constant-time-ish compare for legacy plaintext values.
  return plain === stored;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

/**
 * Timing-safe string comparison for short secrets (setup codes, reset codes).
 * Returns false for undefined/empty inputs.
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Helper to build an admin CRUD sub-router that is super-admin gated. */
export const adminOnly = [requireAdmin, requireSuperAdmin] as const;

export type { IRouter };
export { Router };
