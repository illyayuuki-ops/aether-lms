import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sessionsTable, adminsTable } from "@workspace/db/schema";
import { eq, lt, and } from "drizzle-orm";
import { loadSettings } from "./lib/settings";
import { hashPassword } from "./middlewares/auth";
import crypto from "node:crypto";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required.");
const port = Number(rawPort);

/**
 * Ensures at least one admin account exists on a fresh database.
 *
 * Previously this silently created `admin` / `admin123`. Now:
 *  - Credentials must come from MASTER_ADMIN_USERNAME / MASTER_ADMIN_PASSWORD.
 *  - In production, missing credentials are a hard error.
 *  - In development, a random password is generated and printed once.
 */
async function seedMasterAdmin() {
  try {
    const masterUsername = process.env.MASTER_ADMIN_USERNAME?.trim();
    const masterPassword = process.env.MASTER_ADMIN_PASSWORD;
    const isProduction = process.env.NODE_ENV === "production";

    if (!masterUsername || !masterPassword) {
      if (isProduction) {
        throw new Error(
          "MASTER_ADMIN_USERNAME and MASTER_ADMIN_PASSWORD must be set in production " +
            "so the initial admin account can be created explicitly.",
        );
      }
    }

    const username = masterUsername || "admin";
    const password =
      masterPassword ?? `dev-${crypto.randomBytes(9).toString("base64url")}`;
    const generated = !masterPassword;

    const [existing] = await db
      .select({ id: adminsTable.id })
      .from(adminsTable)
      .where(eq(adminsTable.username, username))
      .limit(1);

    if (existing) {
      logger.info({ username }, "Master admin already exists.");
      return;
    }

    await db.insert(adminsTable).values({
      username,
      password: await hashPassword(password),
      role: "super_admin",
      isActive: true,
    });

    if (generated) {
      // Printed once to the console; not stored anywhere in plaintext.
      logger.warn(
        { username, password },
        "Seeded a development master admin with a RANDOM password. Save it now — it will not be shown again.",
      );
    } else {
      logger.info({ username }, "Master admin seeded from environment credentials.");
    }
  } catch (error) {
    logger.error({ error }, "Failed to seed master admin");
    // In production a broken admin bootstrap should stop the server rather than
    // leave a deployment with no way in.
    if (process.env.NODE_ENV === "production") throw error;
  }
}

async function sweepGhostSessions() {
  try {
    const settings = loadSettings();
    const inactivityMinutes = settings.inactivityLimitMinutes;
    const cutoff = new Date(Date.now() - inactivityMinutes * 60 * 1000);

    const now = new Date();

    await db
      .update(sessionsTable)
      .set({
        isActive: false,
        logoutTime: now,
        logoutReason: "inactivity",
      })
      .where(and(
        eq(sessionsTable.isActive, true),
        lt(sessionsTable.lastActivity, cutoff)
      ));

    logger.info({ inactivityMinutes }, "Ghost sweeper: closed stale sessions.");
  } catch (error) {
    logger.error({ error }, "Error during ghost session sweep");
  }
}

async function start() {
  await seedMasterAdmin();

  setInterval(sweepGhostSessions, 60_000);
  await sweepGhostSessions();

  const host = process.env.HOST || "0.0.0.0";

  const server = app.listen(port, host, () => {
    logger.info({ port, host }, "Server listening — sweeper active, master admin seeded.");
  });

  // app.listen's callback never receives an error; listen for it explicitly.
  server.on("error", (err) => {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  });
}

start().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});