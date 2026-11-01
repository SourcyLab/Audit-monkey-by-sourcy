import type { Calculation, Policy, Trace } from "./types";
export const money = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
export const validAmount = (n: number) =>
  Number.isFinite(n) && n >= 0 && n <= 1e12;
export function day(s: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s
    ? t
    : NaN;
}
export function days(start: string, end: string): number {
  return (day(end) - day(start)) / 86400000;
}
export function periodIssues(start: string, end: string, p: Policy): string[] {
  if (!(days(start, end) > 0))
    return ["Enter a valid exposure period (end date is exclusive)."];
  return day(start) < day(p.start) || day(end) > day(p.end)
    ? [
        "Exposure period falls outside the policy. Reconcile dates before estimating.",
      ]
    : [];
}
export function finish(
  manual: number,
  base: number,
  trace: Trace[],
  issues: string[],
  p: Policy,
): Calculation {
  if (!(days(p.start, p.end) > 0)) issues.push("Enter a valid policy period.");
  if (!p.elementsVerified)
    issues.push(
      "Confirm all premium elements, amounts, bases and calculation order have been entered from the policy.",
    );
  if (
    !validAmount(p.deposit) ||
    !validAmount(p.fixedChargeAnnual) ||
    !validAmount(p.annualDays) ||
    p.annualDays === 0
  )
    issues.push("Invalid deposit, fixed charge or annual day count.");
  let total = base;
  if (p.fixedChargeAnnual) {
    const charge =
      p.fixedChargeAnnual *
      (p.fixedChargeProrated ? days(p.start, p.end) / p.annualDays : 1);
    total += charge;
    trace.push({
      label: "Fixed charge",
      formula: p.fixedChargeProrated
        ? `${p.fixedChargeAnnual} × ${days(p.start, p.end)} / ${p.annualDays} days`
        : "Unprorated fixed charge",
      amount: money(charge),
    });
  }
  for (const s of p.steps) {
    if (!validAmount(s.value)) {
      issues.push(`Invalid ${s.label}.`);
      continue;
    }
    if (!s.verified)
      issues.push(
        `Verify ${s.label}, value and position against the policy worksheet.`,
      );
    const before = total;
    switch (s.kind) {
      case "factor":
        total *= s.value;
        break;
      case "fixed":
        total += s.value;
        break;
      case "minimum":
        total = Math.max(total, s.value);
        break;
      case "assessment":
        total += (total * s.value) / 100;
        break;
    }
    trace.push({
      label: s.label,
      formula: `${money(before)} → ${s.kind} ${s.value}${s.kind === "assessment" ? "%" : ""}`,
      amount: money(total),
    });
  }
  if (!Number.isFinite(total) || total > 1e12)
    issues.push("Premium is outside supported limits.");
  const complete = issues.length === 0;
  return {
    complete,
    issues: [...new Set(issues)],
    trace,
    manual: money(manual),
    final: complete ? money(total) : null,
    balance: complete ? money(money(total) - p.deposit) : null,
  };
}
