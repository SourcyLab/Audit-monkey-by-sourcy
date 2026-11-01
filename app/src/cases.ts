import type { AuditCase } from "./schema";
import { checklist } from "./checklist";
export function newCase(name = "Untitled audit"): AuditCase {
  return {
    id: crypto.randomUUID(),
    name,
    fictional: false,
    line: "wc",
    policy: {
      elementsVerified: false,
      start: "2025-01-01",
      end: "2026-01-01",
      deposit: 0,
      carrierFinal: null,
      steps: [],
      mods: [],
      fixedChargeAnnual: 0,
      fixedChargeProrated: false,
      annualDays: 365,
    },
    wc: [],
    gl: [],
    evidence: checklist.map(([id, label]) => ({
      id,
      label,
      status: "missing",
      note: "",
    })),
    observations: [],
    notes: "",
    deadline: "",
    deadlineSource: "",
    worksheetText: "",
  };
}
export function sampleCase(): AuditCase {
  const c = newCase("Palmetto Workshop");
  c.fictional = true;
  c.policy.deposit = 4500;
  c.policy.carrierFinal = 7620;
  c.policy.elementsVerified = true;
  c.policy.mods = [{ start: c.policy.start, end: c.policy.end, factor: 1.1 }];
  c.policy.steps = [
    {
      id: "expense",
      label: "Example expense constant",
      kind: "fixed",
      value: 200,
      verified: true,
    },
  ];
  c.wc = [
    {
      id: "demo-field",
      name: "Workshop team",
      classCode: "DEMO-A",
      duties:
        "Fictional workshop operations; demo class, not an NCCI assignment",
      gross: 180000,
      overtimePremium: 6000,
      excludedPay: 0,
      officer: false,
      officerMin: null,
      officerMax: null,
      exempt: false,
      exemptionVerified: false,
      subcontractor: false,
      coiVerified: false,
      recordsVerified: true,
      rate: 3,
      start: c.policy.start,
      end: c.policy.end,
    },
    {
      id: "demo-office",
      name: "Office team",
      classCode: "DEMO-B",
      duties: "Fictional dedicated office work; demo class",
      gross: 60000,
      overtimePremium: 0,
      excludedPay: 0,
      officer: false,
      officerMin: null,
      officerMax: null,
      exempt: false,
      exemptionVerified: false,
      subcontractor: false,
      coiVerified: false,
      recordsVerified: true,
      rate: 0.4,
      start: c.policy.start,
      end: c.policy.end,
    },
  ];
  c.gl = [
    {
      id: "demo-gl",
      name: "Workshop sales",
      classCode: "DEMO-GL",
      basis: "sales",
      exposure: 900000,
      excluded: 50000,
      insuredSubCost: 0,
      insuredSubExcluded: false,
      evidenceVerified: true,
      rate: 4,
      per: 1000,
      start: c.policy.start,
      end: c.policy.end,
    },
  ];
  c.evidence.forEach((e, i) => {
    e.status =
      i < 5
        ? "verified"
        : i < 10
          ? "received"
          : i === 12
            ? "requested"
            : "missing";
  });
  c.observations = [
    {
      id: "ot",
      title: "Overtime premium needs a closer look",
      detail:
        "The fictional carrier calculation includes $6,000 of extra overtime premium. The proposed worksheet removes only that premium portion, subject to records and the applicable rule.",
      evidence: "Payroll register with separate overtime premium",
    },
  ];
  c.notes =
    "FICTIONAL DEMO. All dollar values, rates, classes and factors are made up for testing. They are not carrier rates or Florida values.";
  return c;
}
