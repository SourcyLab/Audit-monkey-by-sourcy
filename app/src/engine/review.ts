import { calculateWC } from "./wc";
import { calculateGL } from "./gl";
import type { AuditCase } from "../schema";
import type { Finding } from "./types";
export const calculate = (c: AuditCase) =>
  c.line === "wc" ? calculateWC(c.wc, c.policy) : calculateGL(c.gl, c.policy);
export function findings(c: AuditCase): Finding[] {
  const calc = calculate(c);
  const result: Finding[] = c.observations.map((o) => ({ ...o, impact: null }));
  const scenario = (
    id: string,
    title: string,
    evidence: string,
    change: (copy: AuditCase) => void,
  ) => {
    const copy = structuredClone(c);
    change(copy);
    const baseline = calculate(copy);
    result.push({
      id,
      title,
      evidence,
      detail:
        "Standalone estimated effect of this adjustment using the entered rates and premium sequence. Compared with the same scenario before this adjustment. Effects can overlap; do not add them. Verify the record and policy authority.",
      impact:
        calc.final !== null && baseline.final !== null
          ? Math.round((baseline.final - calc.final) * 100) / 100
          : null,
    });
  };
  if (c.line === "wc")
    c.wc.forEach((r, i) => {
      if (r.overtimePremium > 0)
        scenario(
          `ot-${r.id}`,
          `${r.name}: extra overtime premium`,
          "Detailed payroll separating straight-time and premium pay",
          (copy) => {
            copy.wc[i].overtimePremium = 0;
          },
        );
      if (
        r.officer &&
        r.officerMax !== null &&
        r.gross > r.officerMax &&
        !r.exempt
      )
        scenario(
          `cap-${r.id}`,
          `${r.name}: officer limit`,
          "Officer identity, applicable NCCI limits, units and effective dates",
          (copy) => {
            copy.wc[i].officer = false;
          },
        );
      if (r.subcontractor && r.coiVerified)
        scenario(
          `sub-${r.id}`,
          `${r.name}: insured subcontractor reversal`,
          "Verified WC coverage, entity, dates worked and applicable exclusion rule",
          (copy) => {
            copy.wc[i].coiVerified = false;
          },
        );
      if (r.exempt && r.exemptionVerified)
        scenario(
          `exempt-${r.id}`,
          `${r.name}: individual exemption`,
          "DWC individual certificate and eligibility for all row dates",
          (copy) => {
            copy.wc[i].exempt = false;
          },
        );
    });
  if (c.line === "gl")
    c.gl.forEach((r, i) => {
      if (r.excluded > 0)
        scenario(
          `excluded-${r.id}`,
          `${r.name}: supported GL exclusions`,
          "Ledger reconciliation and class-specific policy authority",
          (copy) => {
            copy.gl[i].excluded = 0;
          },
        );
      if (
        r.basis === "subcost" &&
        r.insuredSubExcluded &&
        r.evidenceVerified &&
        r.insuredSubCost > 0
      )
        scenario(
          `glsub-${r.id}`,
          `${r.name}: permitted insured-sub adjustment`,
          "COIs plus GL policy authority; insurance alone does not imply exclusion",
          (copy) => {
            copy.gl[i].insuredSubExcluded = false;
          },
        );
    });
  result.push(
    ...calc.issues.map((detail, i) => ({
      id: `input-${i}`,
      title: "Verification needed",
      detail,
      evidence: "Policy, dated records and carrier confirmation",
      impact: null,
    })),
  );
  if (
    calc.final !== null &&
    c.policy.carrierFinal !== null &&
    Math.abs(c.policy.carrierFinal - calc.final) > 0.01
  )
    result.unshift({
      id: "reconciliation",
      title: "Carrier total differs from your proposed worksheet",
      detail:
        "This is one overall scenario comparison, not a proven overcharge or an additional saving to add to individual items. Verify both worksheets use identical scope and premium elements.",
      evidence:
        "Full audit worksheet, final bill and complete supporting records",
      impact: Math.round((c.policy.carrierFinal - calc.final) * 100) / 100,
    });
  return result;
}
export function packet(c: AuditCase, disclaimer: string): string {
  const r = calculate(c),
    fs = findings(c);
  return `# Audit review / re-audit request — DRAFT\n\nInsured: ${c.name}\nLine: ${c.line.toUpperCase()}\nPolicy: [enter policy number and carrier]\nPeriod: ${c.policy.start} to ${c.policy.end} (end exclusive)\nDeadline: ${c.deadline || "TODO — confirm in writing"}\nDeadline authority: ${c.deadlineSource || "TODO"}\n\n${c.fictional ? "FICTIONAL EXAMPLE — do not submit.\n\n" : ""}## Cover letter\n\nDear Premium Audit Department,\n\nPlease review the items below and the attached records. Please supply the complete audit worksheet, applicable class and basis rules, rates, experience modification worksheet with effective dates, credits, minimum premium, expense constant, Florida assessments, deposit credits and the order of calculation. Please confirm the written dispute and re-audit deadlines and whether any collection hold is available. This request does not assume an extension or suspend any payment obligation.\n\nCarrier final: ${c.policy.carrierFinal ?? "TODO"}\nProposed scenario: ${r.final ?? "TODO — incomplete"}\nDeposit: ${c.policy.deposit}\nProposed balance (negative = return): ${r.balance ?? "TODO"}\n\n## Findings and evidence requested\n\n${fs.map((f, i) => `${i + 1}. ${f.title}\n${f.detail}\nEvidence: ${f.evidence}\nEstimated overall difference: ${f.impact ?? "TODO — not quantified"}\n`).join("\n")}\n## Evidence index\n\n${c.evidence.map((e, i) => `${i + 1}. ${e.label} — ${e.status}. ${e.note || "Attach the relevant record and identify page/date; do not imply a missing item is attached."}`).join("\n")}\n\n## Proposed calculation worksheet\n\n${r.trace.map((t) => `${t.label}: ${t.formula} = ${t.amount}`).join("\n")}\n${r.issues.join("\n")}\n\n## Re-audit request\n\nPlease identify each accepted or rejected adjustment and the policy/manual authority, and issue a corrected worksheet and bill if supported. Please confirm receipt and next steps in writing.\n\n## Reviewer notes\n\n${c.notes}\n\n## Routes\n\nStart with a written carrier dispute and re-audit request. For unresolved WC manual-rule issues, confirm NCCI process eligibility and state deadlines. NCCI is not the GL route. Florida DFS Consumer Services can assist with premium concerns; contact OIR for the proper regulatory route. Confirm each deadline; a complaint does not itself extend one.\n\n${disclaimer}\n\nPrepared locally. Verify all facts before signing or sending. Nothing has been submitted.\n`;
}
