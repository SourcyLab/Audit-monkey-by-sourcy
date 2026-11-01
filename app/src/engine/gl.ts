import { finish, periodIssues, validAmount, money } from "./common";
import type { GLRow, Policy, Trace, Calculation } from "./types";
export function glExposure(r: GLRow): number {
  return (
    r.exposure -
    r.excluded -
    (r.basis === "subcost" && r.insuredSubExcluded && r.evidenceVerified
      ? r.insuredSubCost
      : 0)
  );
}
export function calculateGL(rows: GLRow[], p: Policy): Calculation {
  const issues: string[] = [],
    trace: Trace[] = [];
  let manual = 0;
  if (!rows.length)
    issues.push("Add at least one general liability exposure row.");
  for (const r of rows) {
    issues.push(
      ...periodIssues(r.start, r.end, p).map((x) => `${r.name}: ${x}`),
    );
    if (
      ![r.exposure, r.excluded, r.insuredSubCost, r.per].every(validAmount) ||
      r.per === 0 ||
      glExposure(r) < 0
    )
      issues.push(
        `${r.name}: check exposure, exclusions and rate denominator.`,
      );
    if (!r.classCode || !r.evidenceVerified)
      issues.push(
        `${r.name}: verify the class, basis, exclusions and supporting records against the GL policy. A COI alone does not remove all GL sub cost.`,
      );
    if (r.rate === null || !validAmount(r.rate))
      issues.push(`${r.name}: enter your verified GL rate.`);
    const amount = (glExposure(r) / r.per) * (r.rate ?? 0);
    manual += amount;
    trace.push({
      label: `${r.name} · ${r.classCode || "class TODO"} · ${r.basis}`,
      formula: `${money(glExposure(r))} / ${r.per} × ${r.rate ?? "TODO"}`,
      amount: money(amount),
    });
  }
  return finish(manual, manual, trace, issues, p);
}
