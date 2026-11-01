export type Line = "wc" | "gl";
export interface WCRow {
  id: string;
  name: string;
  classCode: string;
  duties: string;
  gross: number;
  overtimePremium: number;
  excludedPay: number;
  officer: boolean;
  officerMin: number | null;
  officerMax: number | null;
  exempt: boolean;
  exemptionVerified: boolean;
  subcontractor: boolean;
  coiVerified: boolean;
  recordsVerified: boolean;
  rate: number | null;
  start: string;
  end: string;
}
export type GLBasis = "payroll" | "sales" | "subcost" | "units";
export interface GLRow {
  id: string;
  name: string;
  classCode: string;
  basis: GLBasis;
  exposure: number;
  excluded: number;
  insuredSubCost: number;
  insuredSubExcluded: boolean;
  evidenceVerified: boolean;
  rate: number | null;
  per: number;
  start: string;
  end: string;
}
export interface ModPeriod {
  start: string;
  end: string;
  factor: number;
}
export interface PremiumStep {
  id: string;
  label: string;
  kind: "factor" | "fixed" | "minimum" | "assessment";
  value: number;
  verified: boolean;
}
export interface Policy {
  elementsVerified: boolean;
  start: string;
  end: string;
  deposit: number;
  carrierFinal: number | null;
  steps: PremiumStep[];
  mods: ModPeriod[];
  // Actual audited exposure is never prorated. This is only for a separately verified fixed charge.
  fixedChargeAnnual: number;
  fixedChargeProrated: boolean;
  annualDays: number;
}
export interface Trace {
  label: string;
  formula: string;
  amount: number;
}
export interface Calculation {
  complete: boolean;
  issues: string[];
  trace: Trace[];
  manual: number;
  final: number | null;
  balance: number | null;
}
export interface StateModule {
  code: string;
  name: string;
  verify: string[];
  sources: { label: string; url: string }[];
}
export interface Finding {
  id: string;
  title: string;
  detail: string;
  evidence: string;
  impact: number | null;
}
