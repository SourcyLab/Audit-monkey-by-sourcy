import { it, expect } from "vitest";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  mkdir,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { outsideRepository } from "../scripts/benchmark";
const exec = promisify(execFile);
it("runs an actual offline subprocess into private files and refuses in-repository output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "audit-monkey-benchmark-")),
    input = join(dir, "cohort.json"),
    out = join(dir, "results");
  const run = (...args: string[]) =>
    exec(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/benchmark.ts", ...args],
      { timeout: 30000 },
    );
  try {
    await run("--init", input);
    const example = JSON.parse(await readFile(input, "utf8"));
    expect(
      example.cases.every(
        (c: { dataOrigin: string }) => c.dataOrigin === "synthetic-example",
      ),
    ).toBe(true);
    const r = await run("--input", input, "--out", out);
    expect(r.stdout).toContain("Real cases: 0");
    expect(r.stdout).not.toContain("298");
    const files = await readdir(out),
      report = JSON.parse(
        await readFile(
          join(
            out,
            files.find((f) => f.endsWith(".json"))!,
          ),
          "utf8",
        ),
      );
    expect(report.synthetic.numericMatches).toBe(2);
    expect(report.realClients.cases).toBe(0);
    expect(report.inputSHA256).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      run(
        "--input",
        input,
        "--out",
        resolve("test-results/disallowed-client-records"),
      ),
    ).rejects.toThrow();
    await expect(run("--init", input)).rejects.toThrow();
  } finally {
    expect(dirname(resolve(dir))).toBe(resolve(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  }
});
it("rejects paths and directory junctions resolving back into the repository", async () => {
  await expect(outsideRepository(resolve("app"))).rejects.toThrow(/outside/);
  const dir = await mkdtemp(join(tmpdir(), "audit-monkey-benchmark-"));
  try {
    await mkdir(join(dir, "safe"));
    await symlink(
      resolve("app"),
      join(dir, "repo-link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      outsideRepository(join(dir, "repo-link", "new-output")),
    ).rejects.toThrow(/outside/);
    expect(await outsideRepository(join(dir, "safe", "new-output"))).toContain(
      "safe",
    );
  } finally {
    expect(dirname(resolve(dir))).toBe(resolve(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  }
});
