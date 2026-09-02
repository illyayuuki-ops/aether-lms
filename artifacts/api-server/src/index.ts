import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sessionsTable, adminsTable } from "@workspace/db/schema";
import { eq, lt, and } from "drizzle-orm";
import { loadSettings } from "./routes/admin";
import bcrypt from "bcrypt";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required.");
const port = Number(rawPort);

async function seedMasterAdmin() {
  try {
    const masterUsername = process.env.MASTER_ADMIN_USERNAME || "admin";
    const masterPassword = process.env.MASTER_ADMIN_PASSWORD || "admin123";

    const [existing] = await db
      .select()
      .from(adminsTable)
      .where(eq(adminsTable.username, masterUsername))
      .limit(1);

    if (!existing) {
      const hashedPassword = await bcrypt.hash(masterPassword, 10);
      await db.insert(adminsTable).values({
        username: masterUsername,
        password: hashedPassword,
        role: "super_admin",
        isActive: true,
      });
      logger.info({ username: masterUsername }, "Master admin seeded to DB.");
    } else {
      logger.info({ username: masterUsername }, "Master admin already exists.");
    }
  } catch (error) {
    logger.error({ error }, "Failed to seed master admin");
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

  app.listen(port, host, (err: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port, host }, "Server listening — sweeper active, master admin seeded.");
  });
}

start();