import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync("backend/.dev.vars"))
  writeFileSync(
    "backend/.dev.vars",
    'AUTH_SECRET="' +
      randomBytes(32).toString("hex") +
      '"\nRESEND_API_KEY="local-development-only-not-a-key"\n',
  );
const run = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["node_modules/wrangler/bin/wrangler.js", ...args],
      { stdio: "inherit" },
    );
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Local backend command failed")),
    );
  });
await run([
  "d1",
  "migrations",
  "apply",
  "DB",
  "--local",
  "--config",
  "backend/wrangler.jsonc",
]);
await run([
  "dev",
  "--config",
  "backend/wrangler.jsonc",
  "--local",
  "--ip",
  "127.0.0.1",
  "--port",
  "8787",
]);
