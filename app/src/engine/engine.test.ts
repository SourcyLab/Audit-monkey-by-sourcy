import { describe, it, expect } from "vitest";
import { calculateWC, wcExposure } from "./wc";
import { calculateGL } from "./gl";
import { days } from "./common";
import { calculate, findings, packet } from "./review";
import { sampleCase, newCase } from "../cases";
import { workspaceSchema } from "../schema";
const fixture = () => {
  const c = sampleCase();
  c.policy.steps = [];
  c.policy.deposit = 0;
  c.policy.mods[0].factor = 1;
  return c;
};
describe("workers’ compensation math (all amounts fictional)", () => {
  it("allocates payroll by class and rate per $100", () => {
    const c = fixture();
    c.wc[0].overtimePremium = 0;
    expect(calculateWC(c.wc, c.policy).final).toBe(5640);
  });
  it("removes only the premium portion of overtime", () => {
    const c = fixture();
    const r = calculateWC(c.wc, c.policy);
    expect(r.manual).toBe(5460);
    expect(wcExposure(c.wc[0])).toBe(174000);
  });
  it("applies verified officer maximum and minimum for the entered period", () => {
    const c = fixture(),
      r = c.wc[0];
    r.officer = true;
    r.officerMin = 20000;
    r.officerMax = 80000;
    expect(wcExposure(r)).toBe(80000);
    r.gross = 10000;
    r.overtimePremium = 0;
    expect(wcExposure(r)).toBe(20000);
  });
  it("withholds final when officer limits are missing", () => {
    const c = fixture();
    c.wc[0].officer = true;
    expect(calculateWC(c.wc, c.policy).final).toBeNull();
  });
  it("reverses uninsured-sub charge only after explicit verification", () => {
    const c = fixture(),
      r = c.wc[0];
    r.subcontractor = true;
    expect(calculateWC([r], c.policy).final).toBe(5220);
    r.coiVerified = true;
    expect(calculateWC([r], c.policy).final).toBe(0);
  });
  it("does not treat unverified exemption as zero exposure", () => {
    const c = fixture(),
      r = c.wc[0];
    r.exempt = true;
    expect(calculateWC([r], c.policy).final).toBeNull();
    r.exemptionVerified = true;
    expect(calculateWC([r], c.policy).final).toBe(0);
  });
  it("applies dated experience mod to the correct rows", () => {
    const c = fixture();
    c.policy.mods[0].factor = 1.2;
    expect(calculateWC(c.wc, c.policy).final).toBe(6552);
  });
  it("requires actual exposure split at a mod change instead of guessing payroll", () => {
    const c = fixture();
    c.policy.mods = [
      { start: "2025-01-01", end: "2025-07-01", factor: 1 },
      { start: "2025-07-01", end: "2026-01-01", factor: 1.2 },
    ];
    expect(calculateWC(c.wc, c.policy).final).toBeNull();
    const row = c.wc[0];
    row.overtimePremium = 0;
    row.gross = 60000;
    row.end = "2025-07-01";
    c.wc = [
      row,
      {
        ...row,
        id: "second",
        start: "2025-07-01",
        end: "2026-01-01",
        gross: 120000,
      },
    ];
    expect(calculateWC(c.wc, c.policy).final).toBe(6120);
  });
  it("rejects ambiguous overlapping mod schedules", () => {
    const c = fixture();
    c.policy.mods.push({ ...c.policy.mods[0] });
    expect(calculateWC(c.wc, c.policy).final).toBeNull();
  });
  it("detects partial overlapping mod periods hidden inside a row", () => {
    const c = fixture();
    c.policy.mods.push({ start: "2025-07-01", end: "2026-01-01", factor: 1.2 });
    expect(calculateWC(c.wc, c.policy).final).toBeNull();
  });
  it("withholds duplicate officer limits across overlapping class rows", () => {
    const c = fixture();
    c.wc[0].officer = true;
    c.wc[0].officerMin = 20000;
    c.wc[0].officerMax = 80000;
    c.wc.push({
      ...c.wc[0],
      id: "same-officer-second-class",
      classCode: "DEMO-C",
    });
    expect(calculateWC(c.wc, c.policy).final).toBeNull();
  });
  it("withholds unknown rates and unsupported allocation", () => {
    const c = fixture();
    c.wc[0].rate = null;
    expect(calculateWC(c.wc, c.policy).final).toBeNull();
    c.wc[0].rate = 3;
    c.wc[0].recordsVerified = false;
    expect(calculateWC(c.wc, c.policy).final).toBeNull();
  });
  it("rejects exclusions greater than payroll and out-of-period rows", () => {
    const c = fixture();
    c.wc[0].overtimePremium = 200000;
    expect(calculateWC(c.wc, c.policy).final).toBeNull();
    c.wc[0].overtimePremium = 0;
    c.wc[0].start = "2024-12-01";
    expect(calculateWC(c.wc, c.policy).final).toBeNull();
  });
});
describe("general liability bases", () => {
  it.each(["sales", "payroll", "units"] as const)(
    "calculates %s basis with its explicit denominator",
    (basis) => {
      const c = fixture(),
        r = c.gl[0];
      r.basis = basis;
      r.exposure = 10000;
      r.excluded = 1000;
      r.rate = 2;
      r.per = basis === "units" ? 1 : 1000;
      expect(calculateGL([r], c.policy).final).toBe(
        basis === "units" ? 18000 : 18,
      );
    },
  );
  it("retains insured sub cost unless policy authority is explicitly verified", () => {
    const c = fixture(),
      r = c.gl[0];
    r.basis = "subcost";
    r.exposure = 100000;
    r.excluded = 0;
    r.insuredSubCost = 40000;
    r.rate = 10;
    expect(calculateGL([r], c.policy).final).toBe(1000);
    r.insuredSubExcluded = true;
    expect(calculateGL([r], c.policy).final).toBe(600);
    r.evidenceVerified = false;
    expect(calculateGL([r], c.policy).final).toBeNull();
  });
  it("does not remove insured-sub amount from a sales basis", () => {
    const c = fixture(),
      r = c.gl[0];
    r.insuredSubCost = 40000;
    r.insuredSubExcluded = true;
    expect(calculateGL([r], c.policy).final).toBe(3400);
  });
  it("rejects impossible exposure and zero denominator", () => {
    const c = fixture(),
      r = c.gl[0];
    r.per = 0;
    expect(calculateGL([r], c.policy).final).toBeNull();
    r.per = 1000;
    r.excluded = 1000000;
    expect(calculateGL([r], c.policy).final).toBeNull();
  });
});
describe("premium sequence, dates and balances", () => {
  it("orders credit, minimum, expense constant and assessment", () => {
    const c = fixture();
    c.policy.steps = [
      {
        id: "credit",
        label: "Credit",
        kind: "factor",
        value: 0.9,
        verified: true,
      },
      {
        id: "min",
        label: "Minimum",
        kind: "minimum",
        value: 5000,
        verified: true,
      },
      {
        id: "expense",
        label: "Expense",
        kind: "fixed",
        value: 200,
        verified: true,
      },
      {
        id: "assess",
        label: "Assessment",
        kind: "assessment",
        value: 2,
        verified: true,
      },
    ];
    expect(calculateWC(c.wc, c.policy).final).toBe(5304);
  });
  it("prorates only the selected annual fixed charge and never actual exposure", () => {
    const c = fixture();
    c.policy.start = "2025-07-01";
    c.wc.forEach((r) => (r.start = "2025-07-01"));
    c.policy.fixedChargeAnnual = 365;
    c.policy.fixedChargeProrated = true;
    expect(calculateWC(c.wc, c.policy).final).toBe(5644);
    expect(days(c.policy.start, c.policy.end)).toBe(184);
  });
  it("returns positive balance due or negative return after deposit", () => {
    const c = fixture();
    c.policy.deposit = 5000;
    expect(calculateWC(c.wc, c.policy).balance).toBe(460);
    c.policy.deposit = 6000;
    expect(calculateWC(c.wc, c.policy).balance).toBe(-540);
  });
  it("rejects invalid calendar dates and zero or reversed duration", () => {
    expect(days("2025-02-30", "2025-03-05")).toBeNaN();
    const c = fixture();
    c.policy.end = c.policy.start;
    expect(calculateWC(c.wc, c.policy).final).toBeNull();
  });
  it("withholds an unverified premium sequence", () => {
    const c = fixture();
    c.policy.elementsVerified = false;
    expect(calculate(c).final).toBeNull();
  });
  it("rounds final cents, not every intermediate operation", () => {
    const c = fixture();
    c.wc = [{ ...c.wc[0], gross: 101, overtimePremium: 0, rate: 1.005 }];
    expect(calculateWC(c.wc, c.policy).final).toBe(1.02);
  });
  it("quantifies OT independently, keeps total scenario comparison separate", () => {
    const c = fixture(),
      f = findings(c);
    expect(f.find((x) => x.id.startsWith("ot-"))?.impact).toBe(180);
    expect(f.find((x) => x.id === "reconciliation")?.impact).toBe(2160);
  });
  it("shows minimum premium can erase an exposure saving", () => {
    const c = fixture();
    c.policy.steps = [
      {
        id: "m",
        label: "Minimum",
        kind: "minimum",
        value: 9000,
        verified: true,
      },
    ];
    expect(findings(c).find((x) => x.id.startsWith("ot-"))?.impact).toBe(0);
  });
  it("rejects malformed imports, huge values and negative amounts", () => {
    const c = fixture();
    expect(workspaceSchema.safeParse({ version: 1, cases: [c] }).success).toBe(
      true,
    );
    c.policy.deposit = -1;
    expect(workspaceSchema.safeParse({ version: 1, cases: [c] }).success).toBe(
      false,
    );
    c.policy.deposit = Infinity;
    expect(workspaceSchema.safeParse({ version: 1, cases: [c] }).success).toBe(
      false,
    );
  });
  it("starts real cases with unknown values and produces clearly incomplete drafts", () => {
    const c = newCase();
    expect(c.fictional).toBe(false);
    expect(c.policy.carrierFinal).toBeNull();
    expect(calculate(c).final).toBeNull();
    expect(packet(c, "DISCLAIMER")).toContain("TODO — incomplete");
    expect(packet(c, "DISCLAIMER")).toContain("Nothing has been submitted.");
  });
  it("distinguishes standalone impacts and avoids claiming records are attached", () => {
    const draft = packet(fixture(), "DISCLAIMER");
    expect(draft).toContain("Overall carrier-versus-proposed difference: 2160");
    expect(draft).toContain("Standalone adjustment effect (not additive): 180");
    expect(draft).not.toContain("Estimated overall difference:");
    expect(draft).toContain("Only records explicitly marked as attached");
    expect(draft).not.toContain("the attached records");
  });
});
