#!/usr/bin/env node
/**
 * Run the API against a throwaway in-memory database, for previews and demos.
 *
 *   pnpm --dir scripts preview           # http://localhost:3000
 *   PORT=4000 pnpm --dir scripts preview
 *
 * Nothing here touches a real database: preview-preload.mjs creates a pg-mem
 * instance, applies the schema and seeds ~150 days of plausible sessions, and
 * pg-shim.mjs makes that instance look like the `pg` package that drizzle
 * expects. Both are loaded with --import before any application code runs.
 *
 * Login with admin / admin123 (or whatever MASTER_ADMIN_PASSWORD is set to).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const entry = resolve(repoRoot, "artifacts/api-server/dist/index.mjs");

if (!existsSync(entry)) {
  console.error(
    "API bundle not found. Build it first:\n  pnpm --dir artifacts/api-server run build",
  );
  process.exit(1);
}

const env = {
  ...process.env,
  PREVIEW_ROOT: repoRoot,
  // Never a real cluster — the shim intercepts `pg` before it is imported.
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://preview/preview",
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: process.env.PORT ?? "3000",
  JWT_SECRET: process.env.JWT_SECRET ?? "preview-secret",
  MASTER_ADMIN_PASSWORD: process.env.MASTER_ADMIN_PASSWORD ?? "admin123",
};

const child = spawn(
  process.execPath,
  [
    "--import",
    resolve(here, "preview-preload.mjs"),
    "--import",
    resolve(here, "preview-loaders-register.mjs"),
    entry,
  ],
  { cwd: repoRoot, env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
