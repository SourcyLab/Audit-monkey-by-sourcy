import { it, expect } from "vitest";
import {
  benchmarkBatch,
  benchmarkBatchSchema,
  benchmarkHTML,
  type BenchmarkCase,
} from "./benchmark";
// All fixtures, including those exercising the real-cohort label, are synthetic test inputs.
const wc = (): BenchmarkCase => ({
  caseId: "BENCH-WC-001",
  dataOrigin: "synthetic-example",
  line: "wc",
  policy: {
    elementsVerified: true,
    start: "2025-01-01",
    end: "2026-01-01",
    deposit: 200,
    carrierFinal: null,
    steps: [{ kind: "fixed", value: 100, verified: true }],
    mods: [{ start: "2025-01-01", end: "2026-01-01", factor: 1.1 }],
    fixedChargeAnnual: 0,
    fixedChargeProrated: false,
    annualDays: 365,
  },
  wc: [
    {
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
      start: "2025-01-01",
      end: "2026-01-01",
    },
  ],
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
  manualReview: {
    criticalError: null,
    documentIntakeCorrect: null,
    classificationReviewCorrect: null,
    packetUsable: null,
  },
});
const batch = (cases: BenchmarkCase[], toleranceCents = 1) => ({
  version: 1,
  cohortId: "COHORT-001",
  toleranceCents,
  cases,
});
it("compares final premium and balance to an independent hand calculation, while keeping synthetic controls separate", () => {
  const c = wc(),
    result = benchmarkBatch(batch([c]));
  expect(result.synthetic.numericMatches).toBe(1);
  expect(result.realClients.cases).toBe(0);
  expect(result.results[0]).toMatchObject({
    finalPremium: 298,
    balance: 98,
    numericMatch: true,
    flagsMatch: true,
  });
  expect(result.synthetic.unassessedHumanSafety).toBe(1);
  expect(result.results[0].requiresReview).toBe(true);
});
it("scores GL sales and a return premium and supports a real-cohort reference only after independent verification", () => {
  const c = wc();
  c.caseId = "BENCH-GL-001";
  c.line = "gl";
  c.wc = [];
  c.gl = [
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
      start: c.policy.start,
      end: c.policy.end,
    },
  ];
  c.policy.steps = [];
  c.policy.mods = [];
  c.policy.deposit = 400;
  c.reference.finalPremium = 320;
  c.reference.balance = -80;
  c.reference.expectedFlags = ["gl-exclusion"];
  c.dataOrigin = "redacted-client-audit";
  expect(() => benchmarkBatch(batch([c]))).toThrow(
    /independently human-verified/,
  );
  c.reference.humanVerified = true;
  c.reference.source = "independent-staff-recalculation";
  c.manualReview = {
    criticalError: false,
    documentIntakeCorrect: true,
    classificationReviewCorrect: true,
    packetUsable: true,
  };
  const r = benchmarkBatch(batch([c, wc()]));
  expect(r.realClients.numericMatches).toBe(1);
  expect(r.synthetic.numericMatches).toBe(1);
  expect(r.results[0]).toMatchObject({ balance: -80, requiresReview: false });
});
it("flags dollar mismatches and missed/extra categories without averaging withheld outputs as zero error", () => {
  const c = wc();
  c.reference.finalPremium = 300;
  c.reference.balance = 100;
  c.reference.expectedFlags = ["insured-sub"];
  const r = benchmarkBatch(batch([c]));
  expect(r.results[0]).toMatchObject({
    finalErrorCents: -200,
    balanceErrorCents: -200,
    numericMatch: false,
    missedFlags: ["insured-sub"],
    extraFlags: ["overtime"],
  });
  expect(r.synthetic.categoryPrecision).toBe(0);
  expect(r.synthetic.categoryRecall).toBe(0);
  c.wc[0].rate = null;
  const missing = benchmarkBatch(batch([c]));
  expect(missing.synthetic.numericMatches).toBe(0);
  expect(missing.synthetic.withheldDespiteCompleteReference).toBe(1);
  expect(missing.synthetic.meanAbsoluteFinalErrorCents).toBeNull();
  expect(missing.synthetic.finalComparisonsWithAmounts).toBe(0);
});
it("respects declared cent tolerance and never treats unknown flags or time as measured", () => {
  const c = wc();
  c.reference.finalPremium = 298.01;
  c.reference.balance = 98.01;
  c.reference.expectedFlags = null;
  expect(benchmarkBatch(batch([c])).results[0].numericMatch).toBe(true);
  expect(benchmarkBatch(batch([c], 0)).results[0].numericMatch).toBe(false);
  const r = benchmarkBatch(batch([c]));
  expect(r.results[0].flagsMatch).toBeNull();
  expect(r.synthetic.categoryPrecision).toBeNull();
  expect(r.synthetic.totalMinutesSaved).toBeNull();
  c.timing = { manualMinutes: 10, toolMinutes: 15 };
  expect(benchmarkBatch(batch([c])).synthetic.totalMinutesSaved).toBe(-5);
});
it("distinguishes expected abstention from an unexpected final and keeps critical manual errors visible", () => {
  const c = wc();
  c.reference.expectedComplete = false;
  c.reference.finalPremium = null;
  c.reference.balance = null;
  expect(benchmarkBatch(batch([c])).synthetic.unexpectedFinalOutputs).toBe(1);
  c.wc[0].rate = null;
  c.reference.expectedFlags = ["overtime", "verification"];
  const r = benchmarkBatch(batch([c]));
  expect(r.results[0]).toMatchObject({
    completenessMatches: true,
    numericMatch: null,
    flagsMatch: true,
  });
  c.manualReview = {
    criticalError: true,
    documentIntakeCorrect: true,
    classificationReviewCorrect: true,
    packetUsable: true,
  };
  expect(benchmarkBatch(batch([c])).synthetic.criticalErrors).toBe(1);
});
it("rejects identities, narrative text, duplicate IDs, invalid reference states and mixed coverage rows", () => {
  const c = wc();
  expect(() =>
    benchmarkBatch(
      batch([{ ...c, clientName: "PRIVATE NAME" } as BenchmarkCase]),
    ),
  ).toThrow();
  expect(() => benchmarkBatch(batch([c, { ...c }]))).toThrow(/Duplicate/);
  expect(() =>
    benchmarkBatchSchema.parse(batch([{ ...c, caseId: "policy-secret-123" }])),
  ).toThrow();
  expect(() =>
    benchmarkBatch(
      batch([{ ...c, wc: [{ ...c.wc[0], classCode: "CustomerName" }] }]),
    ),
  ).toThrow();
  c.reference.finalPremium = null;
  expect(() => benchmarkBatch(batch([c]))).toThrow(/requires both/);
});
it("renders a self-contained private HTML report with no active content or external resources", () => {
  const html = benchmarkHTML(benchmarkBatch(batch([wc()])));
  expect(html).toContain("CONFIDENTIAL");
  expect(html).toContain("Content-Security-Policy");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("https://");
  expect(html).toContain("Not assessed");
});
