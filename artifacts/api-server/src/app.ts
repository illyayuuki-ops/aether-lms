import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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

// FIX: handle sendBeacon text/plain body for logout route
app.use((req, res, next) => {
  if (req.headers["content-type"]?.includes("text/plain")) {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => {
      try { req.body = JSON.parse(data); } catch { req.body = {}; }
      next();
    });
  } else {
    next();
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Serve React frontend in production ────────────────────────────────────────
// In production (installer), Express serves the built React app directly.
// This replaces the need for a separate Vite dev server on port 5173.
if (process.env.NODE_ENV === "production") {
  // Look for the public folder next to the dist folder
  const publicDir = path.join(__dirname, "..", "public");

  if (fs.existsSync(publicDir)) {
    logger.info({ publicDir }, "Serving static frontend from public dir.");

    // Serve static assets (JS, CSS, images)
    app.use(express.static(publicDir));

    // For all non-API routes, serve index.html (React handles routing)
    app.get("/{*path}", (req, res) => {
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