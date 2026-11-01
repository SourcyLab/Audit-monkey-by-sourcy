import { spawn } from "node:child_process";
import { resolve } from "node:path";
const port = Number(process.env.AUDIT_VERIFY_PORT || 8790),
  base = "http://localhost:" + port;
const state = resolve("test-results/browser-state");
function run(file, args = [], extra = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      stdio: "inherit",
      env: { ...process.env, ...extra },
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolveRun() : reject(new Error(file + " failed: " + code)),
    );
  });
}
await run("node_modules/wrangler/bin/wrangler.js", [
  "d1",
  "migrations",
  "apply",
  "DB",
  "--local",
  "--config",
  "backend/wrangler.jsonc",
  "--persist-to",
  state,
]);
const server = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    "backend/wrangler.jsonc",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--var",
    "PUBLIC_ORIGIN:" + base,
    "--var",
    "SOURCY_ADMIN_EMAILS:pilot-ui-admin@example.test",
    "--var",
    "AUTH_SECRET:local-browser-verification-secret-not-for-production-123456",
    "--var",
    "RESEND_API_KEY:local-browser-test-only",
    "--persist-to",
    state,
    "--log-level",
    "warn",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
for (const stream of [server.stdout, server.stderr])
  stream.on(
    "data",
    (chunk) => (logs = (logs + chunk.toString()).slice(-16000)),
  );
let stopped = false;
server.once("exit", () => {
  stopped = true;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (stopped) throw new Error("Local browser server exited: " + logs);
    try {
      const r = await fetch(base + "/api/terms", {
        signal: AbortSignal.timeout(500),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup not ready */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) throw new Error("Local browser server not ready: " + logs);
  await run("scripts/browser-check.mjs", [], { AUDIT_BASE_URL: base });
  await run("scripts/pilot-browser-check.mjs", [], {
    AUDIT_PILOT_BASE_URL: base,
  });
} finally {
  server.kill("SIGTERM");
}
