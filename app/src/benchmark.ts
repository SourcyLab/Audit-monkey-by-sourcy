import { z } from "zod";
import {
  wcRowSchema,
  glRowSchema,
  policySchema,
  type AuditCase,
} from "./schema";
import { newCase } from "./cases";
import { calculate, findings } from "./engine/review";
const amount = z.number().finite().min(0).max(1e12);
const signed = z.number().finite().min(-1e12).max(1e12);
const categories = [
  "overtime",
  "officer-cap",
  "officer-exemption",
  "insured-sub",
  "gl-exclusion",
  "gl-insured-sub",
  "reconciliation",
  "verification",
] as const;
const code = z
  .string()
  .regex(
    /^(\d{3,6})?$/,
    "Use a class code or blank; no names or policy identifiers",
  );
const flags = z
  .array(z.enum(categories))
  .max(categories.length)
  .refine((x) => new Set(x).size === x.length, "Duplicate reference flags");
export const benchmarkCaseSchema = z
  .object({
    caseId: z.string().regex(/^BENCH-(WC|GL)-\d{3,6}$/),
    dataOrigin: z.enum(["synthetic-example", "redacted-client-audit"]),
    line: z.enum(["wc", "gl"]),
    policy: policySchema
      .omit({ steps: true })
      .extend({
        steps: z
          .array(
            z
              .object({
                kind: z.enum(["factor", "fixed", "minimum", "assessment"]),
                value: amount,
                verified: z.boolean(),
              })
              .strict(),
          )
          .max(40),
      })
      .strict(),
    wc: z
      .array(
        wcRowSchema
          .omit({ id: true, name: true, duties: true })
          .extend({ classCode: code })
          .strict(),
      )
      .max(500),
    gl: z
      .array(
        glRowSchema
          .omit({ id: true, name: true })
          .extend({ classCode: code })
          .strict(),
      )
      .max(500),
    reference: z
      .object({
        sourceId: z.string().regex(/^REF-\d{3,6}$/),
        source: z.enum([
          "independent-staff-recalculation",
          "carrier-corrected-worksheet",
          "synthetic-hand-calculation",
        ]),
        humanVerified: z.boolean(),
        expectedComplete: z.boolean(),
        finalPremium: amount.nullable(),
        balance: signed.nullable(),
        expectedFlags: flags.nullable(),
      })
      .strict(),
    timing: z
      .object({
        manualMinutes: z.number().finite().positive().max(1e6),
        toolMinutes: z.number().finite().positive().max(1e6),
      })
      .strict()
      .nullable()
      .default(null),
    manualReview: z
      .object({
        criticalError: z.boolean().nullable(),
        documentIntakeCorrect: z.boolean().nullable(),
        classificationReviewCorrect: z.boolean().nullable(),
        packetUsable: z.boolean().nullable(),
      })
      .strict()
      .default({
        criticalError: null,
        documentIntakeCorrect: null,
        classificationReviewCorrect: null,
        packetUsable: null,
      }),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (!c.caseId.startsWith("BENCH-" + c.line.toUpperCase() + "-"))
      ctx.addIssue({
        code: "custom",
        path: ["caseId"],
        message: "Case ID must match coverage line",
      });
    if (
      c.dataOrigin === "redacted-client-audit" &&
      (!c.reference.humanVerified ||
        c.reference.source === "synthetic-hand-calculation")
    )
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message:
          "Client audits require an independently human-verified real reference",
      });
    if (
      c.reference.expectedComplete &&
      (c.reference.finalPremium === null || c.reference.balance === null)
    )
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message: "Complete reference requires both final premium and balance",
      });
    if (
      !c.reference.expectedComplete &&
      (c.reference.finalPremium !== null || c.reference.balance !== null)
    )
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message:
          "Incomplete reference must not claim a final premium or balance",
      });
    if ((c.line === "wc" && c.gl.length) || (c.line === "gl" && c.wc.length))
      ctx.addIssue({
        code: "custom",
        message: "Use a separate benchmark case for each coverage line",
      });
  });
export const benchmarkBatchSchema = z
  .object({
    version: z.literal(1),
    cohortId: z.string().regex(/^COHORT-\d{3,6}$/),
    toleranceCents: z.number().int().min(0).max(100).default(1),
    cases: z.array(benchmarkCaseSchema).min(1).max(100),
  })
  .strict()
  .superRefine((batch, ctx) => {
    if (new Set(batch.cases.map((c) => c.caseId)).size !== batch.cases.length)
      ctx.addIssue({
        code: "custom",
        path: ["cases"],
        message: "Duplicate benchmark IDs",
      });
  });
export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;
export type BenchmarkBatch = z.infer<typeof benchmarkBatchSchema>;
export function auditForBenchmark(input: BenchmarkCase): AuditCase {
  const c = newCase(input.caseId);
  c.id = input.caseId;
  c.fictional = input.dataOrigin === "synthetic-example";
  c.line = input.line;
  c.policy = {
    ...input.policy,
    steps: input.policy.steps.map((s, i) => ({
      ...s,
      id: "step-" + i,
      label: "Premium element " + (i + 1),
    })),
  };
  c.wc = input.wc.map((r, i) => ({
    ...r,
    id: "row-" + i,
    name: "Payroll row " + (i + 1),
    duties: "Duties and allocation reviewed separately",
  }));
  c.gl = input.gl.map((r, i) => ({
    ...r,
    id: "row-" + i,
    name: "GL row " + (i + 1),
  }));
  return c;
}
function flagFor(id: string): (typeof categories)[number] | null {
  if (id.startsWith("ot-")) return "overtime";
  if (id.startsWith("cap-")) return "officer-cap";
  if (id.startsWith("exempt-")) return "officer-exemption";
  if (id.startsWith("sub-")) return "insured-sub";
  if (id.startsWith("excluded-")) return "gl-exclusion";
  if (id.startsWith("glsub-")) return "gl-insured-sub";
  if (id.startsWith("input-")) return "verification";
  if (id === "reconciliation") return "reconciliation";
  return null;
}
const cents = (n: number) => Math.round(n * 100);
export function benchmarkCase(input: BenchmarkCase, toleranceCents = 1) {
  const c = auditForBenchmark(input),
    result = calculate(c),
    actualFlags = [
      ...new Set(
        findings(c)
          .map((f) => flagFor(f.id))
          .filter((f): f is (typeof categories)[number] => f !== null),
      ),
    ].sort();
  const completenessMatches =
    result.complete === input.reference.expectedComplete;
  const finalErrorCents =
    result.final !== null && input.reference.finalPremium !== null
      ? cents(result.final) - cents(input.reference.finalPremium)
      : null;
  const balanceErrorCents =
    result.balance !== null && input.reference.balance !== null
      ? cents(result.balance) - cents(input.reference.balance)
      : null;
  const numericMatch = input.reference.expectedComplete
    ? finalErrorCents !== null &&
      balanceErrorCents !== null &&
      Math.abs(finalErrorCents) <= toleranceCents &&
      Math.abs(balanceErrorCents) <= toleranceCents
    : null;
  const expected = input.reference.expectedFlags,
    missed =
      expected === null
        ? null
        : expected.filter((f) => !actualFlags.includes(f)),
    extra =
      expected === null
        ? null
        : actualFlags.filter((f) => !expected.includes(f));
  const flagsMatch =
    expected === null ? null : !missed!.length && !extra!.length;
  return {
    caseId: input.caseId,
    dataOrigin: input.dataOrigin,
    line: input.line,
    sourceId: input.reference.sourceId,
    referenceVerified: input.reference.humanVerified,
    referenceSource: input.reference.source,
    complete: result.complete,
    expectedComplete: input.reference.expectedComplete,
    completenessMatches,
    finalPremium: result.final,
    expectedFinalPremium: input.reference.finalPremium,
    finalErrorCents,
    balance: result.balance,
    expectedBalance: input.reference.balance,
    balanceErrorCents,
    numericMatch,
    actualFlags,
    missedFlags: missed,
    extraFlags: extra,
    flagsMatch,
    verificationIssues: result.issues,
    manualReview: input.manualReview,
    minutesSaved: input.timing
      ? input.timing.manualMinutes - input.timing.toolMinutes
      : null,
    manualMinutes: input.timing?.manualMinutes ?? null,
    toolMinutes: input.timing?.toolMinutes ?? null,
    requiresReview:
      !completenessMatches ||
      numericMatch === false ||
      flagsMatch !== true ||
      input.manualReview.criticalError !== false ||
      input.manualReview.documentIntakeCorrect !== true ||
      input.manualReview.classificationReviewCorrect !== true ||
      input.manualReview.packetUsable !== true,
  };
}
export function benchmarkBatch(raw: unknown) {
  const input = benchmarkBatchSchema.parse(raw),
    results = input.cases.map((c) => benchmarkCase(c, input.toleranceCents));
  const summarize = (dataOrigin: BenchmarkCase["dataOrigin"]) => {
    const rows = results.filter((r) => r.dataOrigin === dataOrigin),
      numeric = rows.filter((r) => r.numericMatch !== null),
      flagged = rows.filter((r) => r.flagsMatch !== null),
      timed = rows.filter((r) => r.manualMinutes !== null),
      reviewed = rows.filter((r) => r.manualReview.criticalError !== null);
    const errors = numeric
      .filter((r) => r.finalErrorCents !== null)
      .map((r) => Math.abs(r.finalErrorCents!));
    const truePositives = rows
        .filter((r) => r.flagsMatch !== null)
        .reduce((n, r) => n + r.actualFlags.length - r.extraFlags!.length, 0),
      falsePositives = rows.reduce(
        (n, r) => n + (r.extraFlags?.length ?? 0),
        0,
      ),
      falseNegatives = rows.reduce(
        (n, r) => n + (r.missedFlags?.length ?? 0),
        0,
      );
    return {
      cases: rows.length,
      requiresReview: rows.filter((r) => r.requiresReview).length,
      completenessMatches: rows.filter((r) => r.completenessMatches).length,
      numericComparisons: numeric.length,
      finalComparisonsWithAmounts: errors.length,
      withheldDespiteCompleteReference: rows.filter(
        (r) => r.expectedComplete && !r.complete,
      ).length,
      unexpectedFinalOutputs: rows.filter(
        (r) => !r.expectedComplete && r.complete,
      ).length,
      numericMatches: numeric.filter((r) => r.numericMatch).length,
      meanAbsoluteFinalErrorCents: errors.length
        ? errors.reduce((a, b) => a + b, 0) / errors.length
        : null,
      maxAbsoluteFinalErrorCents: errors.length ? Math.max(...errors) : null,
      flagComparisons: flagged.length,
      truePositives,
      falsePositives,
      falseNegatives,
      categoryPrecision:
        truePositives + falsePositives
          ? truePositives / (truePositives + falsePositives)
          : null,
      categoryRecall:
        truePositives + falseNegatives
          ? truePositives / (truePositives + falseNegatives)
          : null,
      timedCases: timed.length,
      totalMinutesSaved: timed.length
        ? timed.reduce((n, r) => n + r.minutesSaved!, 0)
        : null,
      humanSafetyReviewed: reviewed.length,
      criticalErrors: reviewed.filter((r) => r.manualReview.criticalError)
        .length,
      unassessedHumanSafety: rows.length - reviewed.length,
    };
  };
  return {
    schema: "audit-monkey-benchmark-v1",
    cohortId: input.cohortId,
    toleranceCents: input.toleranceCents,
    realClients: summarize("redacted-client-audit"),
    synthetic: summarize("synthetic-example"),
    results,
    limits: [
      "Offline structured-input benchmark; not a test of automatic PDF interpretation or automatic class selection.",
      "Findings are compared by candidate-adjustment category, not by legally correct classification or individual line.",
      "Reference results must be checked independently; software output is not its own reference.",
      "Synthetic examples are excluded from real-client metrics. Unassessed review fields are not treated as passed.",
      "Keep this cohort held out of training/tuning until evaluation is complete. No upload, AI request, training or sale occurs.",
      "Per-case results contain confidential financial figures; store privately. A green arithmetic score does not approve real-client launch.",
    ],
  };
}
export function benchmarkHTML(report: ReturnType<typeof benchmarkBatch>) {
  const esc = (value: unknown) =>
    String(value ?? "Not assessed").replace(
      /[&<>"']/g,
      (c) => "&#" + c.charCodeAt(0) + ";",
    );
  const summaryHTML = (
    summary: ReturnType<typeof benchmarkBatch>["realClients"],
  ) => {
    const number = (n: number | null) => (n === null ? "Not assessed" : esc(n));
    const percent = (n: number | null) =>
      n === null ? "Not assessed" : (n * 100).toFixed(1) + "%";
    return (
      '<dl class="summary"><div><dt>Cases evaluated</dt><dd>' +
      summary.cases +
      "</dd></div><div><dt>Premium & balance matches</dt><dd>" +
      summary.numericMatches +
      " / " +
      summary.numericComparisons +
      "</dd></div><div><dt>Need follow-up or review</dt><dd>" +
      summary.requiresReview +
      "</dd></div><div><dt>Worst final-premium error</dt><dd>" +
      number(summary.maxAbsoluteFinalErrorCents) +
      " cents</dd></div><div><dt>Expected results withheld</dt><dd>" +
      summary.withheldDespiteCompleteReference +
      "</dd></div><div><dt>Unexpected final outputs</dt><dd>" +
      summary.unexpectedFinalOutputs +
      "</dd></div><div><dt>Category precision / recall</dt><dd>" +
      percent(summary.categoryPrecision) +
      " / " +
      percent(summary.categoryRecall) +
      "</dd></div><div><dt>Missed / extra categories</dt><dd>" +
      summary.falseNegatives +
      " / " +
      summary.falsePositives +
      "</dd></div><div><dt>Critical-error review completed</dt><dd>" +
      summary.humanSafetyReviewed +
      " / " +
      summary.cases +
      "</dd></div><div><dt>Critical errors reported</dt><dd>" +
      summary.criticalErrors +
      "</dd></div><div><dt>Measured staff time saved</dt><dd>" +
      number(summary.totalMinutesSaved) +
      (summary.totalMinutesSaved === null ? "" : " minutes") +
      "</dd></div><div><dt>Cases with measured time</dt><dd>" +
      summary.timedCases +
      "</dd></div></dl>"
    );
  };
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Private audit benchmark</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#17291e;margin:32px auto;padding:20px;max-width:1100px}table{border-collapse:collapse;width:100%}th,td{padding:10px;border:1px solid #b4c1ba;text-align:left}.table{overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}.warning{background:#fff1d5;padding:16px}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.summary div{border:1px solid #b4c1ba;border-radius:8px;padding:14px}.summary dt{font-size:13px}.summary dd{margin:4px 0 0;font-size:22px;font-weight:600}th,td{overflow-wrap:anywhere}@media print{body{margin:0;padding:0;font-size:10pt}tr{break-inside:avoid}}</style></head><body><small>The Audit Monkey · by Sourcy · CONFIDENTIAL</small><h1>Audit benchmark ' +
    esc(report.cohortId) +
    '</h1><p class="warning">Real-client arithmetic comparison, not launch approval. Every result still requires staff review. No records were uploaded or sent to AI.</p><h2>Real-client cohort</h2>' +
    summaryHTML(report.realClients) +
    "<h2>Synthetic controls (excluded above)</h2>" +
    summaryHTML(report.synthetic) +
    '<div class="table"><table><caption>Case comparisons · tolerance ' +
    report.toleranceCents +
    " cents</caption><thead><tr><th>Case</th><th>Origin</th><th>Completeness matches</th><th>Final error (cents)</th><th>Balance error (cents)</th><th>Flags match</th><th>Critical error found (manual)</th><th>Review needed</th></tr></thead><tbody>" +
    report.results
      .map(
        (r) =>
          "<tr><td>" +
          esc(r.caseId) +
          "</td><td>" +
          esc(r.dataOrigin) +
          "</td><td>" +
          esc(r.completenessMatches) +
          "</td><td>" +
          esc(r.finalErrorCents) +
          "</td><td>" +
          esc(r.balanceErrorCents) +
          "</td><td>" +
          esc(r.flagsMatch) +
          "</td><td>" +
          esc(r.manualReview.criticalError) +
          "</td><td>" +
          esc(r.requiresReview) +
          "</td></tr>",
      )
      .join("") +
    "</tbody></table></div><h2>Review notes and limits</h2><ul>" +
    report.limits.map((l) => "<li>" + esc(l) + "</li>").join("") +
    "</ul><p>Detailed verification issues and missed/extra flags are in the private JSON results. No automatic carrier submission or advice. Verify with the carrier, NCCI and a licensed professional.</p></body></html>"
  );
}
