import { it, expect } from "vitest";
import { newCase, sampleCase } from "./cases";
import { caseSchema } from "./schema";
import { readiness, deadlineLabel } from "./workflow";
import { reportHTML } from "./report";
import { packet } from "./engine/review";
it("migrates original case JSON without losing payroll and never treats it as staff approved", () => {
  const c = sampleCase();
  const old: Record<string, unknown> = { ...c };
  delete old.workflow;
  const loaded = caseSchema.parse(old);
  expect(loaded.wc).toEqual(c.wc);
  expect(loaded.workflow.stage).toBe("intake");
  expect(readiness(loaded).length).toBeGreaterThan(0);
});
it("requires evidence references, policy identity, calculation and review before submission readiness", () => {
  const c = sampleCase();
  c.fictional = false;
  c.workflow.carrier = "Fictional carrier";
  c.workflow.policyNumber = "TEST-1";
  c.workflow.assignee = "Reviewer A";
  c.workflow.reviewer = "Reviewer B";
  c.deadline = "2026-12-01";
  c.deadlineSource = "Fictional written carrier confirmation";
  c.evidence.forEach((e) => {
    e.status = "verified";
    e.note = "Fixture page 1";
  });
  expect(readiness(c)).toEqual([]);
  c.deadline = "2026-02-30";
  expect(readiness(c).join(" ")).toMatch(/deadline/);
  c.deadline = "2026-12-01";
  c.evidence[0].note = "";
  expect(readiness(c).join(" ")).toMatch(/record reference/);
  c.line = "gl";
  expect(readiness(c).length).toBeGreaterThan(0);
  expect(readiness(newCase()).join(" ")).toMatch(/carrier|Carrier/);
});
it("produces an escaped printable draft with policy identity and excludes private staff notes", () => {
  const c = sampleCase();
  c.name = "<script>alert(1)</script>";
  c.workflow.policyNumber = "POLICY-TEST";
  c.workflow.internalNotes = "PRIVATE INTERNAL ONLY";
  const report = reportHTML(c, "Test disclaimer");
  expect(report).not.toContain("<script>");
  expect(report).toContain("&#60;script&#62;");
  expect(report).toContain("POLICY-TEST");
  expect(report).toContain("FICTIONAL EXAMPLE");
  expect(report).not.toContain("PRIVATE INTERNAL ONLY");
  expect(packet(c, "Test disclaimer")).not.toContain("PRIVATE INTERNAL ONLY");
});
it("identifies follow-up due dates without inventing carrier deadlines", () => {
  expect(deadlineLabel("2026-11-01", "2026-11-02")).toContain("overdue");
  expect(deadlineLabel("2026-11-02", "2026-11-02")).toBe("Follow up today");
  expect(deadlineLabel("")).toBe("No follow-up date");
});
