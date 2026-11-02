import { mkdir, realpath, writeFile, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { resolve, relative, isAbsolute, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import {
  benchmarkBatch,
  benchmarkHTML,
  type BenchmarkBatch,
} from "../app/src/benchmark";
const repo = await realpath(fileURLToPath(new URL("../", import.meta.url)));
export async function outsideRepository(path: string) {
  const absolute = resolve(path);
  let ancestor = absolute;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor)
      throw new Error("Choose an existing private parent folder");
    ancestor = parent;
  }
  const actual = resolve(
    await realpath(ancestor),
    relative(ancestor, absolute),
  );
  for (const location of [absolute, actual]) {
    const rel = relative(repo, location);
    if (
      !rel ||
      (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep))
    )
      throw new Error(
        "Benchmark inputs and outputs must be outside the public repository",
      );
  }
  return actual;
}
function example(): BenchmarkBatch {
  const policy = {
    elementsVerified: true,
    start: "2025-01-01",
    end: "2026-01-01",
    deposit: 200,
    carrierFinal: null,
    steps: [{ kind: "fixed" as const, value: 100, verified: true }],
    mods: [{ start: "2025-01-01", end: "2026-01-01", factor: 1.1 }],
    fixedChargeAnnual: 0,
    fixedChargeProrated: false,
    annualDays: 365,
  };
  const row = {
    classCode: "1234",
    gross: 10000,
    overtimePremium: 1000,
    excludedPay: 0,
    officer: false,
    officerMin: null,
    officerMax: null,
    exempt: false,
    exemptionVerified: false,
    subcontractor: false,
    coiVerified: false,
    recordsVerified: true,
    rate: 2,
    start: policy.start,
    end: policy.end,
  };
  const manualReview = {
    criticalError: null,
    documentIntakeCorrect: null,
    classificationReviewCorrect: null,
    packetUsable: null,
  };
  return {
    version: 1,
    cohortId: "COHORT-001",
    toleranceCents: 1,
    cases: [
      {
        caseId: "BENCH-WC-001",
        dataOrigin: "synthetic-example",
        line: "wc",
        policy,
        wc: [row],
        gl: [],
        reference: {
          sourceId: "REF-001",
          source: "synthetic-hand-calculation",
          humanVerified: false,
          expectedComplete: true,
          finalPremium: 298,
          balance: 98,
          expectedFlags: ["overtime"],
        },
        timing: null,
        manualReview,
      },
      {
        caseId: "BENCH-GL-001",
        dataOrigin: "synthetic-example",
        line: "gl",
        policy: { ...policy, deposit: 400, steps: [], mods: [] },
        wc: [],
        gl: [
          {
            classCode: "12345",
            basis: "sales",
            exposure: 100000,
            excluded: 20000,
            insuredSubCost: 0,
            insuredSubExcluded: false,
            evidenceVerified: true,
            rate: 4,
            per: 1000,
            start: policy.start,
            end: policy.end,
          },
        ],
        reference: {
          sourceId: "REF-002",
          source: "synthetic-hand-calculation",
          humanVerified: false,
          expectedComplete: true,
          finalPremium: 320,
          balance: -80,
          expectedFlags: ["gl-exclusion"],
        },
        timing: null,
        manualReview,
      },
    ],
  };
}
export async function main(args: string[]) {
  if (args.length === 2 && args[0] === "--init") {
    const target = await outsideRepository(args[1]);
    await writeFile(target, JSON.stringify(example(), null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log(
      "Created a synthetic example in your private folder. Replace it with redacted figures and independent references before real-client benchmarking.",
    );
    return;
  }
  if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--out")
    throw new Error(
      "Usage: npm run benchmark -- --init <private-file.json> OR --input <private-file.json> --out <private-output-folder>",
    );
  const input = await outsideRepository(args[1]),
    out = await outsideRepository(args[3]);
  if (!(await stat(input)).isFile())
    throw new Error("Input must be a regular JSON file");
  const parts: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of createReadStream(input)) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 10 * 1024 * 1024)
      throw new Error("Use a benchmark JSON file smaller than 10 MB");
    parts.push(buffer);
  }
  const content = Buffer.concat(parts);
  let raw: unknown;
  try {
    raw = JSON.parse(content.toString("utf8"));
  } catch {
    throw new Error("Input is not valid JSON. No input content was logged.");
  }
  const report = benchmarkBatch(raw);
  let revision = "unavailable",
    workingTreeClean = false;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    workingTreeClean = !execFileSync("git", ["status", "--porcelain"], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* no git checkout is supported */
  }
  const metadata = {
    createdAt: new Date().toISOString(),
    engineGitRevision: revision,
    workingTreeClean,
    inputSHA256: createHash("sha256").update(content).digest("hex"),
  };
  await mkdir(out, { recursive: true, mode: 0o700 });
  const filename = "benchmark-" + Date.now() + "-" + randomUUID().slice(0, 8);
  await writeFile(
    join(out, filename + ".json"),
    JSON.stringify({ ...metadata, ...report }, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(join(out, filename + ".html"), benchmarkHTML(report), {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    "Wrote private JSON and printable HTML reports. Real cases: " +
      report.realClients.cases +
      "; synthetic controls: " +
      report.synthetic.cases +
      "; real cases requiring review: " +
      report.realClients.requiresReview +
      ". No upload, AI, training or sale was performed.",
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void main(process.argv.slice(2)).catch((error) => {
    if (error instanceof z.ZodError)
      console.error(
        "Benchmark validation failed: " +
          error.issues
            .map(
              (e) =>
                e.path.join(".") +
                ": " +
                (e.code === "custom" ? e.message : e.code),
            )
            .join("; "),
      );
    else
      console.error(
        error instanceof Error && !("code" in error)
          ? error.message
          : "Private file operation failed. Check paths and access; no input content was logged.",
      );
    process.exitCode = 1;
  });
