import { day, days, finish, periodIssues, validAmount, money } from "./common";
import type { Calculation, Policy, WCRow, Trace } from "./types";
export function wcExposure(r: WCRow): number {
  if ((r.exempt && r.exemptionVerified) || (r.subcontractor && r.coiVerified))
    return 0;
  const net = r.gross - r.overtimePremium - r.excludedPay;
  return r.officer && r.officerMin !== null && r.officerMax !== null
    ? Math.min(r.officerMax, Math.max(r.officerMin, net))
    : net;
}
export function calculateWC(rows: WCRow[], p: Policy): Calculation {
  const issues: string[] = [],
    trace: Trace[] = [];
  let manual = 0,
    modified = 0;
  if (!rows.length) issues.push("Add at least one workers’ comp exposure row.");
  for (const r of rows) {
    const prefix = r.name || r.id;
    issues.push(
      ...periodIssues(r.start, r.end, p).map((x) => `${prefix}: ${x}`),
    );
    if (
      ![r.gross, r.overtimePremium, r.excludedPay].every(validAmount) ||
      r.overtimePremium + r.excludedPay > r.gross
    )
      issues.push(`${prefix}: exclusions must not exceed gross payroll.`);
    if (!r.classCode || !r.duties || !r.recordsVerified)
      issues.push(`${prefix}: verify class, duties and payroll split records.`);
    if (r.rate === null || !validAmount(r.rate))
      issues.push(`${prefix}: enter your verified rate per $100.`);
    if (
      r.officer &&
      (!validAmount(r.officerMin ?? -1) ||
        !validAmount(r.officerMax ?? -1) ||
        (r.officerMin ?? 0) > (r.officerMax ?? 0)) &&
      !(r.exempt && r.exemptionVerified)
    )
      issues.push(
        `${prefix}: verify applicable officer minimum and maximum for this exact period.`,
      );
    if (r.exempt && !r.exemptionVerified)
      issues.push(
        `${prefix}: exemption dates and eligibility need verification.`,
      );
    const mods = p.mods.filter(
      (m) => day(m.start) <= day(r.start) && day(m.end) >= day(r.end),
    );
    const intersectingMods = p.mods.filter(
      (m) => day(m.start) < day(r.end) && day(m.end) > day(r.start),
    );
    if (
      mods.length !== 1 ||
      intersectingMods.length !== 1 ||
      !validAmount(mods[0]?.factor ?? -1) ||
      mods[0]?.factor === 0
    )
      issues.push(
        `${prefix}: one verified mod period must cover this row. Split actual payroll at a mod effective date; do not spread payroll by days.`,
      );
    if (
      r.officer &&
      rows.some(
        (other) =>
          other !== r &&
          other.officer &&
          other.name === r.name &&
          day(other.start) < day(r.end) &&
          day(other.end) > day(r.start),
      )
    )
      issues.push(
        `${prefix}: overlapping officer rows may apply the same person’s limits more than once. Reconcile one person-level limit before entering a supported allocation.`,
      );
    const exposure = wcExposure(r),
      premium = (exposure / 100) * (r.rate ?? 0),
      factor = mods[0]?.factor ?? 1;
    manual += premium;
    modified += premium * factor;
    trace.push({
      label: `${prefix} · ${r.classCode || "class TODO"}`,
      formula: `${money(exposure)} / 100 × ${r.rate ?? "TODO"} × mod ${mods.length === 1 ? factor : "TODO"}`,
      amount: money(premium * factor),
    });
  }
  for (const m of p.mods)
    if (!(days(m.start, m.end) > 0)) issues.push("Invalid mod period.");
  return finish(manual, modified, trace, issues, p);
}
