import fs from "node:fs";

for (const lock of ["package-lock.json", "yarn.lock"]) {
  try {
    fs.unlinkSync(lock);
  } catch {
    // file may not exist
  }
}

const agent = process.env.npm_config_user_agent ?? "";
if (!agent.includes("pnpm")) {
  console.error("Use pnpm instead (npm install -g pnpm)");
  process.exit(1);
}
