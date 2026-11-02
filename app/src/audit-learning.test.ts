import { it, expect } from "vitest";
import { provider, defaultAISettings } from "./ai";
import { applyDraft, validateDraft, type AuditDraft } from "./audit-draft";
import { matchingLessons, type Lesson } from "./corrections";
import { sampleCase } from "./cases";
const text =
  "Payroll register: gross payroll 10000; extra overtime premium 1000; other allowed excluded pay 0; rate 2 per 100. Mod 1.10 applies January 1 2025 through January 1 2026 exclusive. Expense constant 100. Final premium 298 and deposit 200.";
const fixture = (): AuditDraft => ({
  summary: "Verify extra OT premium before accepting this draft.",
  wc: [
    {
      row: {
        name: "Payroll group",
        classCode: "1234",
        duties: "Duties require staff verification",
        gross: 10000,
        overtimePremium: 1000,
        excludedPay: 0,
        officer: false,
        officerMin: null,
        officerMax: null,
        exempt: false,
        subcontractor: false,
        rate: 2,
        start: "2025-01-01",
        end: "2026-01-01",
      },
      sourceQuote:
        "gross payroll 10000; extra overtime premium 1000; other allowed excluded pay 0; rate 2 per 100",
    },
  ],
  gl: [],
  mods: [
    {
      period: { start: "2025-01-01", end: "2026-01-01", factor: 1.1 },
      sourceQuote:
        "Mod 1.10 applies January 1 2025 through January 1 2026 exclusive",
    },
  ],
  steps: [
    {
      kind: "fixed",
      label: "Expense constant",
      value: 100,
      sourceQuote: "Expense constant 100",
    },
  ],
  totals: {
    carrierFinal: 298,
    deposit: 200,
    sourceQuote: "Final premium 298 and deposit 200",
  },
  findings: [
    {
      title: "Check overtime premium",
      detail: "Confirm only extra premium is excluded.",
      sourceQuote: "extra overtime premium 1000",
      evidenceNeeded: "Payroll detail and applicable policy/manual rule",
    },
  ],
});
const lesson = (): Lesson => ({
  id: "11111111-1111-4111-8111-111111111111",
  revision: 2,
  status: "approved",
  synthetic: true,
  createdBy: "fictional@example.test",
  approvedBy: "owner@example.test",
  updatedAt: 1,
  payload: {
    title: "Separate overtime premium",
    topic: "overtime",
    line: "wc",
    state: "FL",
    originalFinding: "The earlier draft included all overtime pay.",
    correctedFinding:
      "Check payroll detail and remove only supported extra overtime premium, subject to applicable authority.",
    sourceReference: "Fictional teaching source, verified page 1",
    classCodes: ["1234"],
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
  },
});
const settings = {
  ...defaultAISettings(),
  enabled: true,
  key: "fake-test-key",
  model: "fake-test-model",
};
it("extracts a document-grounded draft and includes the approved correction pair in the next model context", async () => {
  let sent: Record<string, unknown> | null = null;
  const request: typeof fetch = async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({
      choices: [{ message: { content: JSON.stringify(fixture()) } }],
    });
  };
  const result = await provider.review(
    text,
    "wc",
    [lesson()],
    settings,
    request,
  );
  expect(result.wc[0].row.gross).toBe(10000);
  expect(JSON.stringify(sent)).toContain("Separate overtime premium");
  expect(JSON.stringify(sent)).toContain("earlier draft included all overtime");
  expect(JSON.stringify(sent)).not.toContain("fake-test-key");
});
it("does not call AI when disabled and rejects invented source quotes or verification claims", async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    return Response.json({});
  };
  await expect(
    provider.review(text, "wc", [], defaultAISettings(), request),
  ).rejects.toThrow(/AI is off/);
  expect(calls).toBe(0);
  await expect(
    provider.review(
      text,
      "wc",
      [{ ...lesson(), status: "draft" }],
      settings,
      request,
    ),
  ).rejects.toThrow(/Only approved/);
  expect(calls).toBe(0);
  const bad = fixture();
  bad.wc[0].sourceQuote = "This text is not in the document";
  expect(() => validateDraft(bad, text, "wc")).toThrow(/not found/);
  expect(() =>
    validateDraft(
      {
        ...fixture(),
        wc: [
          {
            ...fixture().wc[0],
            row: { ...fixture().wc[0].row, recordsVerified: true },
          },
        ],
      },
      text,
      "wc",
    ),
  ).toThrow();
});
it("stages proposals with verification reset and never mutates the original AI response", () => {
  const c = sampleCase(),
    draft = fixture(),
    copy = applyDraft(c, validateDraft(draft, text, "wc"));
  expect(copy.wc[0].recordsVerified).toBe(false);
  expect(copy.wc[0].coiVerified).toBe(false);
  expect(copy.wc[0].exemptionVerified).toBe(false);
  expect(copy.policy.elementsVerified).toBe(false);
  expect(copy.policy.steps[0].verified).toBe(false);
  expect(copy.workflow.reviewer).toBe("");
  copy.policy.mods[0].factor = 2;
  expect(draft.mods[0].period.factor).toBe(1.1);
  expect(c.wc.length).toBe(2);
});
it("matches only approved lessons for the correct origin, coverage, dates and class", () => {
  const c = sampleCase();
  c.wc[0].classCode = "1234";
  const good = lesson();
  expect(matchingLessons(c, [good]).length).toBe(1);
  for (const l of [
    { ...good, status: "draft" as const },
    { ...good, status: "retired" as const },
    { ...good, synthetic: false },
    { ...good, payload: { ...good.payload, line: "gl" as const } },
    { ...good, payload: { ...good.payload, classCodes: ["9999"] } },
    { ...good, payload: { ...good.payload, effectiveTo: "2025-06-01" } },
  ])
    expect(matchingLessons(c, [l])).toEqual([]);
});
it("accepts an Anthropic structured draft and refuses malformed model output without applying it", async () => {
  const good: typeof fetch = async () =>
    Response.json({
      content: [{ type: "text", text: JSON.stringify(fixture()) }],
    });
  expect(
    (
      await provider.review(
        text,
        "wc",
        [],
        { ...settings, provider: "anthropic" },
        good,
      )
    ).steps.length,
  ).toBe(1);
  const bad: typeof fetch = async () =>
    Response.json({ choices: [{ message: { content: "not JSON" } }] });
  await expect(provider.review(text, "wc", [], settings, bad)).rejects.toThrow(
    /invalid JSON/,
  );
});
