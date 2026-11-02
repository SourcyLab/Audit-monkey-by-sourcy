import { day } from "./engine/common";
import type { AuditCase } from "./schema";
import { calculate } from "./engine/review";
export function readiness(c: AuditCase): string[] {
  const issues: string[] = [];
  if (c.fictional)
    issues.push(
      "Replace the fictional demo with a real client case before submission.",
    );
  if (!c.name.trim() || c.name === "Untitled audit")
    issues.push("Enter the insured's name.");
  if (!c.workflow.carrier.trim() || !c.workflow.policyNumber.trim())
    issues.push("Enter the carrier and policy number.");
  if (!c.workflow.assignee.trim())
    issues.push("Assign the case to a staff member.");
  if (!c.workflow.reviewer.trim())
    issues.push("Record the reviewer who checked this draft.");
  if (!Number.isFinite(day(c.deadline)) || !c.deadlineSource.trim())
    issues.push("Confirm the dispute deadline and its written source.");
  const unresolved = c.evidence.filter(
    (x) => !["verified", "not-applicable"].includes(x.status) || !x.note.trim(),
  );
  if (unresolved.length)
    issues.push(
      unresolved.length +
        " checklist items need verification or a record reference / non-applicable reason.",
    );
  const r = calculate(c);
  if (!r.complete) issues.push(...r.issues);
  if (c.policy.carrierFinal === null)
    issues.push("Enter the carrier's final premium before deposit.");
  return issues;
}
export function deadlineLabel(
  value: string,
  today = new Date().toISOString().slice(0, 10),
): string {
  if (!value) return "No follow-up date";
  return value < today
    ? "Follow-up overdue: " + value
    : value === today
      ? "Follow up today"
      : "Follow up " + value;
}
