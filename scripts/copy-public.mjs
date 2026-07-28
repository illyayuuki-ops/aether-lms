import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "artifacts/library-system/dist/public");
const dest = path.join(root, "artifacts/api-server/public");

if (!fs.existsSync(src)) {
  console.error("Frontend build not found. Run: pnpm run build:web");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`Copied ${src} → ${dest}`);
