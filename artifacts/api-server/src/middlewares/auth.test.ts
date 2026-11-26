import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import {
  isBcryptHash,
  verifyPassword,
  hashPassword,
  safeEqual,
  signAdminToken,
  requireAdmin,
} from "./auth";
import type { Request, Response } from "express";

describe("isBcryptHash", () => {
  it("recognises bcrypt prefixes", () => {
    expect(isBcryptHash("$2a$10$abcdefghijklmnopqrstuv")).toBe(true);
    expect(isBcryptHash("$2b$10$abcdefghijklmnopqrstuv")).toBe(true);
    expect(isBcryptHash("$2y$10$abcdefghijklmnopqrstuv")).toBe(true);
  });

  it("rejects plaintext and malformed strings", () => {
    expect(isBcryptHash("24-12913")).toBe(false);
    expect(isBcryptHash("")).toBe(false);
    expect(isBcryptHash("$3a$10$whatever")).toBe(false);
  });
});

describe("verifyPassword", () => {
  it("verifies a correct bcrypt password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect bcrypt password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("still accepts legacy plaintext rows (migration path)", async () => {
    expect(await verifyPassword("24-12913", "24-12913")).toBe(true);
    expect(await verifyPassword("nope", "24-12913")).toBe(false);
  });

  it("returns false for empty stored values", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  it("never throws on a corrupt bcrypt value", async () => {
    expect(await verifyPassword("x", "$2a$10$not-a-real-hash")).toBe(false);
  });
});

describe("safeEqual", () => {
  it("returns true for equal strings", () => {
    expect(safeEqual("setup-code-123", "setup-code-123")).toBe(true);
  });

  it("returns false for different or missing values", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual(undefined, "abc")).toBe(false);
    expect(safeEqual("", "")).toBe(false);
  });
});

// ─── requireAdmin: role must come from the token, never a header ─────────────

function makeReq(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe("requireAdmin", () => {
  it("rejects a missing Authorization header", () => {
    const res = makeRes();
    let called = false;
    requireAdmin(makeReq({}), res, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("accepts a valid token and takes the role from the payload", () => {
    const token = signAdminToken({ adminId: 7, role: "librarian" }, "1h");
    const req = makeReq({ authorization: `Bearer ${token}`, "x-admin-role": "super_admin" });
    const res = makeRes();
    let called = false;

    requireAdmin(req, res, () => {
      called = true;
    });

    expect(called).toBe(true);
    // The spoofed header must be ignored.
    expect(req.adminRole).toBe("librarian");
    expect(req.adminId).toBe(7);
  });

  it("rejects a token signed with a different secret", () => {
    const forged = jwt.sign({ adminId: 1, role: "super_admin" }, "attacker-secret", {
      expiresIn: "1h",
    });

    const res = makeRes();
    let called = false;
    requireAdmin(makeReq({ authorization: `Bearer ${forged}` }), res, () => {
      called = true;
    });
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
