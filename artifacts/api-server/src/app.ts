import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { clientIp } from "./middlewares/rate-limit";

const app: Express = express();

/** Max accepted JSON body size. These are all small admin/kiosk payloads. */
const JSON_BODY_LIMIT = "64kb";

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

/**
 * `navigator.sendBeacon` (used for logout on page unload) always sends a
 * `text/plain` content type, which `express.json()` ignores. Parse only those
 * bodies, only for the logout route, and cap the size so this shim cannot be
 * used to buffer unbounded data. Every other request falls straight through
 * to `express.json()`.
 */
const BEACON_MAX_BYTES = 16 * 1024;
app.use((req, res, next) => {
  if (req.method !== "POST" || req.path !== "/api/sessions/logout") {
    next();
    return;
  }
  if (!req.headers["content-type"]?.includes("text/plain")) {
    next();
    return;
  }

  let data = "";
  let aborted = false;

  req.on("data", (chunk: Buffer) => {
    if (aborted) return;
    data += chunk.toString("utf8");
    if (data.length > BEACON_MAX_BYTES) {
      aborted = true;
      res.status(413).json({ error: "payload_too_large", message: "Beacon payload too large." });
      req.destroy();
    }
  });

  req.on("end", () => {
    if (aborted) return;
    try {
      req.body = JSON.parse(data);
    } catch {
      req.body = {};
    }
    next();
  });
});

/**
 * CORS. In development the Vite dev server proxies `/api`, so same-origin is
 * enough. Set CORS_ORIGINS (comma separated) to allow additional origins; when
 * unset we mirror the request origin so the kiosk/admin SPA works regardless
 * of host, but never with credentials.
 */
const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

// Log the client IP once for diagnostics without leaking it into every route.
app.use((req, _res, next) => {
  if (process.env.LOG_LEVEL === "debug") {
    logger.debug({ ip: clientIp(req), path: req.path }, "request");
  }
  next();
});

app.use("/api", router);

// ── Serve React frontend in production ────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const publicDir = path.join(__dirname, "..", "public");

  if (fs.existsSync(publicDir)) {
    logger.info({ publicDir }, "Serving static frontend from public dir.");

    app.use(express.static(publicDir));

    // SPA fallback for client-side routes.
    app.get("/{*path}", (_req, res) => {
      const indexPath = path.join(publicDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Frontend not found. Please reinstall Aether LMS.");
      }
    });
  } else {
    logger.warn("Public dir not found — frontend will not be served.");
  }
}

export default app;
