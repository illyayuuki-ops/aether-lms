import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

/**
 * Liveness + readiness in one endpoint.
 *
 * This used to return `{status:"ok"}` unconditionally, which meant the
 * startup probe (and the kiosk's "can I reach the server?" check) reported
 * healthy even when Postgres was unreachable or DATABASE_URL was wrong.
 */
router.get("/healthz", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", database: "up" });
  } catch {
    res.status(503).json({ status: "degraded", database: "down" });
  }
});

export default router;
