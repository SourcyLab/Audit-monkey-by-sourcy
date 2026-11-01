import { spawn } from "node:child_process";
import { resolve } from "node:path";
const child = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "deploy",
    "--dry-run",
    "--outdir",
    resolve("backend/build"),
    "--config",
    resolve("backend/wrangler.jsonc"),
  ],
  { stdio: "inherit" },
);
child.on("exit", (code) => (process.exitCode = code ?? 1));
