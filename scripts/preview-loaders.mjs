/**
 * Module resolution hooks for the preview environment.
 *
 * 1. `pg`  → a shim that exports a pg-mem backed Pool (so the real API code runs
 *            unchanged against an in-memory database).
 * 2. `@workspace/*` → the TypeScript source, so we can run the API from source
 *            with tsx instead of a bundled build (`pg` would otherwise be
 *            inlined into dist/index.mjs and could not be swapped).
 *
 * Preview only. Production uses DATABASE_URL and the bundled build.
 */
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(process.env.PREVIEW_ROOT || process.cwd());
const shimUrl = pathToFileURL(path.join(root, "scripts", "pg-shim.mjs")).href;

const WORKSPACE = {
  "@workspace/db/schema": "lib/db/src/schema/index.ts",
  "@workspace/db/src/schema": "lib/db/src/schema/index.ts",
  "@workspace/db": "lib/db/src/index.ts",
  "@workspace/api-zod": "lib/api-zod/src/index.ts",
  "@workspace/api-client-react": "lib/api-client-react/src/index.ts",
  "@workspace/reporting": "lib/reporting/src/index.ts",
};

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "pg") {
    return { url: shimUrl, shortCircuit: true };
  }
  // Handle subpath imports such as "@workspace/db/schema" first, then bare ones.
  const target = WORKSPACE[specifier];
  if (target) {
    const file = path.join(root, target);
    if (existsSync(file)) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  // Workspace packages import each other extensionlessly ("./sessions"), which
  // tsx handles but plain Node does not. Resolve those to the .ts source.
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.includes("/lib/")) {
    if (!/\.[cm]?[jt]sx?$/.test(specifier)) {
      const base = path.resolve(path.dirname(new URL(context.parentURL).pathname), specifier);
      for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
        if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
