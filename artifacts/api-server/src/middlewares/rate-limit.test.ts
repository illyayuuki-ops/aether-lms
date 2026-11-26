import { describe, it, expect } from "vitest";
import { rateLimit, clientIp } from "./rate-limit";
import type { Request, Response } from "express";

function makeReq(ip = "10.0.0.5"): Request {
  return {
    headers: {},
    socket: { remoteAddress: ip },
  } as unknown as Request;
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
  };
}

describe("rateLimit", () => {
  it("allows requests up to the limit", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 3 });
    for (let i = 0; i < 3; i++) {
      let called = false;
      limiter(makeReq(), makeRes(), () => {
        called = true;
      });
      expect(called).toBe(true);
    }
  });

  it("blocks the request after the limit is exceeded", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 });
    limiter(makeReq(), makeRes(), () => {});
    limiter(makeReq(), makeRes(), () => {});

    const res = makeRes();
    let called = false;
    limiter(makeReq(), res, () => {
      called = true;
    });

    expect(called).toBe(false);
    expect(res.statusCode).toBe(429);
  });

  it("tracks separate buckets per client IP", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    limiter(makeReq("10.0.0.1"), makeRes(), () => {});

    let called = false;
    limiter(makeReq("10.0.0.2"), makeRes(), () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("sets standard rate-limit headers", () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 5 });
    const res = makeRes();
    limiter(makeReq(), res, () => {});
    expect(res.headers["X-RateLimit-Limit"]).toBe("5");
    expect(res.headers["X-RateLimit-Remaining"]).toBe("4");
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for hop and strips IPv6 prefix", () => {
    const req = {
      headers: { "x-forwarded-for": "::ffff:192.168.1.7, 10.0.0.1" },
      socket: { remoteAddress: "10.0.0.1" },
    } as unknown as Request;
    expect(clientIp(req)).toBe("192.168.1.7");
  });

  it("falls back to the socket address", () => {
    const req = {
      headers: {},
      socket: { remoteAddress: "::ffff:127.0.0.1" },
    } as unknown as Request;
    expect(clientIp(req)).toBe("127.0.0.1");
  });
});
