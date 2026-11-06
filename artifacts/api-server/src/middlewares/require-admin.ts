import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { jwtSecret } from "../lib/env";

/**
 * Shared admin guard.
 *
 * The same 20-line function was copy-pasted into routes/admin.ts and
 * routes/kiosk.ts; reports would have made a third copy. It reads the role from
 * the VERIFIED token payload only — never from a request header (see SEC-01).
 */

declare module "express" {
  interface Request {
    adminId?: number;
    adminRole?: string;
  }
}


export interface AdminTokenPayload {
  adminId: number;
  role: string;
}

/** Verify a bearer token and return its payload, or null. */
export function verifyAdminToken(authorization: string | undefined): AdminTokenPayload | null {
  if (!authorization || !authorization.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(authorization.slice(7), jwtSecret()) as AdminTokenPayload;
    if (typeof payload?.adminId !== "number" || typeof payload?.role !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const payload = verifyAdminToken(req.headers.authorization);
  if (!payload) {
    res.status(401).json({
      error: "unauthorized",
      message: "Admin access required. Please log in again.",
    });
    return;
  }
  req.adminId = payload.adminId;
  req.adminRole = payload.role;
  next();
}
