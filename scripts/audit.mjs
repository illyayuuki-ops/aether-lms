#!/usr/bin/env node
/**
 * Aether LMS — anti-pattern audit
 * ---------------------------------------------------------------
 * Counts known "we must not do this again" patterns so regressions
 * are visible in CI / pre-commit instead of being re-discovered later.
 *
 * Usage:
 *   node scripts/audit.mjs            # report only
 *   node scripts/audit.mjs --strict   # exit 1 if any rule got worse
 *   node scripts/audit.mjs --update   # rewrite docs/audit-baseline.json
 *
 * Every rule maps to an entry in docs/issue-tracker.md (see `ref`).
 * No dependencies — plain Node, reads the source tree directly.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const BASELINE_FILE = join(ROOT, "docs/audit-baseline.json");

const SCAN_DIRS = ["artifacts/api-server/src", "artifacts/library-system/src", "artifacts/kiosk-electron/src", "lib"];
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".mjs"]);
// Non-source files that still carry configuration we care about.
const EXTRA_FILES = ["package.json", "artifacts/kiosk-electron/config.default.json"];
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "electron-extracted", "release", "build"]);

/** Each rule: id, ref (tracker entry), why, and a matcher. */
const RULES = [
  {
    id: "hardcoded-jwt-fallback",
    ref: "SEC-05",
    why: "JWT secret falls back to a public string — tokens are forgeable if JWT_SECRET is unset.",
    test: (line) => line.includes("library-jwt-secret-change-me"),
  },
  {
    id: "default-master-admin",
    ref: "SEC-05",
    why: "Master admin is seeded with a default password when MASTER_ADMIN_PASSWORD is unset.",
    test: (line) => line.includes("admin123"),
  },
  {
    id: "default-setup-code",
    ref: "SEC-05",
    why: "First-run setup code falls back to a public constant.",
    test: (line) => line.includes("setup-aether-2024"),
  },
  {
    id: "client-supplied-role",
    ref: "SEC-01",
    why: "Authorization decisions must come from the verified JWT, never from a request header.",
    test: (line) => /x-admin-role|x-protect-super-admins/.test(line),
  },
  {
    id: "plaintext-password-compare",
    ref: "SEC-04",
    why: "Legacy plaintext password comparison must not grow; migrate to bcrypt only.",
    test: (line) => /plain\s*===\s*stored/.test(line),
  },
  {
    id: "raw-secret-code-compare",
    ref: "SEC-02",
    why: "Recovery codes must be hashed and compared with a constant-time check.",
    test: (line) => /secretCode\s*!==\s*secretCode/.test(line),
  },
  {
    id: "silent-catch",
    ref: "REL-01",
    why: "Swallowed errors make failures invisible (settings lost after restart, deletes that did nothing).",
    test: (line) => /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(line) || /catch\s*\{\s*\/\*/.test(line),
  },
  {
    id: "remote-cdn-import",
    ref: "PURP-09",
    why: "Runtime imports from the public internet break offline library LANs.",
    test: (line) => line.includes("cdn.sheetjs.com"),
  },
  {
    id: "wildcard-cors",
    ref: "SEC-07",
    why: "Blanket cors() exposes the LAN API to any origin.",
    test: (line) => /app\.use\(\s*cors\(\s*\)\s*\)/.test(line),
  },
  {
    id: "hardcoded-db-credential",
    ref: "OPS-03",
    why: "Credentials belong in .env, not in package.json scripts.",
    test: (line) => line.includes("postgres:030306"),
  },
  {
    id: "recovery-pin-in-config",
    ref: "SEC-03",
    why: "The kiosk escape PIN ships in a file every student PC can read.",
    test: (line) => line.includes("emergencyPin"),
  },
  {
    id: "any-cast",
    ref: "OPS-06",
    why: "`as any` hides schema drift — most blowups trace back to these.",
    test: (line) => /\bas any\b/.test(line),
  },
  {
    id: "todo-marker",
    ref: "OPS-08",
    why: "Unfinished work should live in the tracker, not in code comments.",
    test: (line) => /\b(TODO|FIXME|HACK|XXX)\b/.test(line),
  },
];

function walk(dir, files = []) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return files;
  for (const entry of readdirSync(abs)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(abs, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(relative(ROOT, full), files);
    else if (SCAN_EXT.has(extname(entry))) files.push(full);
  }
  return files;
}

const files = [...SCAN_DIRS.flatMap((d) => walk(d))];
for (const extra of EXTRA_FILES) {
  const abs = join(ROOT, extra);
  if (existsSync(abs)) files.push(abs);
}
const results = new Map();

for (const rule of RULES) results.set(rule.id, []);
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
    for (const rule of RULES) {
      if (rule.test(line)) {
        results.get(rule.id).push(`${relative(ROOT, file)}:${i + 1}`);
      }
    }
  });
}

const strict = process.argv.includes("--strict");
const update = process.argv.includes("--update");

const baseline = existsSync(BASELINE_FILE)
  ? JSON.parse(readFileSync(BASELINE_FILE, "utf8"))
  : {};

const current = {};
let regressions = 0;
let improvements = 0;

console.log(`\nAether LMS audit — ${files.length} files scanned\n`);
console.log("RULE                       COUNT  BASELINE  DELTA  TRACKER");
console.log("─".repeat(66));

for (const rule of RULES) {
  const hits = results.get(rule.id);
  current[rule.id] = hits.length;
  const base = baseline[rule.id] ?? hits.length;
  const delta = hits.length - base;
  if (delta > 0) regressions++;
  if (delta < 0) improvements++;
  const flag = delta > 0 ? "▲" : delta < 0 ? "▼" : " ";
  console.log(
    `${rule.id.padEnd(26)} ${String(hits.length).padStart(5)}  ${String(base).padStart(8)}  ${flag}${String(delta).padStart(4)}  ${rule.ref}`,
  );
  if (delta > 0) {
    for (const loc of hits.slice(0, 6)) console.log(`${" ".repeat(27)}  ↳ ${loc}`);
    if (hits.length > 6) console.log(`${" ".repeat(27)}  ↳ …and ${hits.length - 6} more`);
  }
}

console.log("─".repeat(66));
console.log(
  regressions === 0
    ? improvements > 0
      ? `✅ No regressions. ${improvements} rule(s) improved — run --update to lock in the new baseline.`
      : "✅ No regressions."
    : `❌ ${regressions} rule(s) got worse. See docs/issue-tracker.md for why each one matters.`,
);

if (update) {
  writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2) + "\n");
  console.log(`\nBaseline written to ${relative(ROOT, BASELINE_FILE)}`);
  process.exit(0);
}

if (strict && regressions > 0) process.exit(1);
