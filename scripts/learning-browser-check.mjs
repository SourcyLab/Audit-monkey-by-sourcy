import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.AUDIT_PILOT_BASE_URL ?? "http://localhost:8788";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.AUDIT_BROWSER_PATH
    ? { executablePath: process.env.AUDIT_BROWSER_PATH }
    : {}),
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  }),
  page = await context.newPage();
const errors = [],
  requests = [],
  seenLessons = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
page.on("request", (r) => {
  if (
    new URL(r.url()).origin !== new URL(base).origin &&
    !r.url().startsWith("blob:") &&
    !r.url().startsWith("data:")
  )
    requests.push(r.url());
});
const source =
  "FICTIONAL TEACHING AUDIT. Payroll register: gross payroll 10000; extra overtime premium 1000; other allowed excluded pay 0; rate 2 per 100. Mod 1.10 applies January 1 2025 through January 1 2026 exclusive. Expense constant 100. Final premium 298 and deposit 200.";
const draft = (taught) => ({
  summary: taught
    ? "Synthetic mock used the approved overtime correction."
    : "Synthetic mock missed the supported overtime adjustment.",
  wc: [
    {
      row: {
        name: "Fictional payroll group",
        classCode: "1234",
        duties: "Fictional duties require staff verification",
        gross: 10000,
        overtimePremium: taught ? 1000 : 0,
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
      label: "Fictional expense constant",
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
      title: "Check the extra overtime premium",
      detail: "Verify payroll and policy authority before excluding pay.",
      sourceQuote: "extra overtime premium 1000",
      evidenceNeeded: "Payroll detail and applicable policy/manual rule",
    },
  ],
});
await page.route(base + "/__mock-audit-model", async (route) => {
  const body = route.request().postDataJSON(),
    prompt = JSON.parse(body.messages[1].content);
  seenLessons.push(prompt.rememberedCorrections);
  await route.fulfill({
    json: {
      choices: [
        {
          message: {
            content: JSON.stringify(
              draft(prompt.rememberedCorrections.length > 0),
            ),
          },
        },
      ],
    },
  });
});
try {
  await page.goto(base);
  await page
    .locator("#account-email")
    .fill("learning-browser-" + Date.now() + "@example.test");
  await page.locator("#account-phone").fill("+12025550123");
  await page.locator("#account-terms-accepted").check();
  await page
    .getByRole("button", { name: "Send sign-in code", exact: true })
    .click();
  await page
    .locator("#account-status")
    .filter({ hasText: "LOCAL DEVELOPMENT ONLY" })
    .waitFor();
  const code = (await page.locator("#account-status").innerText()).match(
    /code: (\d{8})/,
  )?.[1];
  assert.ok(code);
  await page.locator("#account-code").fill(code);
  await page
    .getByRole("button", { name: "Verify and open workspace", exact: true })
    .click();
  await page.locator("#case-select").waitFor();
  await page
    .getByRole("button", { name: "Sources & guides", exact: true })
    .click();
  await page.locator("#ai-enabled").check();
  await page.locator("#ai-endpoint").fill(base + "/__mock-audit-model");
  await page.locator("#ai-model").fill("synthetic-browser-model");
  await page.locator("#ai-key").fill("fake-browser-key-not-a-secret");
  await page.locator("#ai-key").press("Tab");
  await page
    .getByRole("button", { name: "Review the audit", exact: true })
    .click();
  await page.locator("#learning-text").fill(source);
  await page.locator("#learning-sharing").check();
  await page.locator("#learning-review").click();
  await page
    .locator("#learning-status")
    .filter({ hasText: "Draft ready" })
    .waitFor();
  assert.equal(seenLessons.length, 1);
  assert.equal(seenLessons[0].length, 0);
  await page.locator("#learning-apply").click();
  assert.equal(
    await page.locator('[data-path="wc.0.recordsVerified"]').isChecked(),
    false,
  );
  await page.locator('[data-path="wc.0.overtimePremium"]').fill("1000");
  await page.locator('[data-path="wc.0.overtimePremium"]').press("Tab");
  await page.locator('[data-path="wc.0.recordsVerified"]').check();
  await page.locator('[data-path="policy.steps.0.verified"]').check();
  await page.locator('[data-path="policy.elementsVerified"]').check();
  await page
    .locator('[data-path="workflow.reviewer"]')
    .fill("Fictional staff reviewer");
  await page.locator('[data-path="workflow.reviewer"]').press("Tab");
  await page.getByRole("button", { name: "Client cases", exact: true }).click();
  await page.locator("#save-server-case").click();
  await page
    .locator("#case-storage-status")
    .filter({ hasText: "Case saved to backend" })
    .waitFor();
  const caseId = await page.locator("#case-select").inputValue();
  await page
    .getByRole("button", { name: "Review the audit", exact: true })
    .click();
  await page.locator("#learning-record").click();
  await page
    .locator("#learning-status")
    .filter({ hasText: "immutable comparison snapshot" })
    .waitFor();
  const runs = await (
    await page.request.get(base + "/api/audit-runs?caseId=" + caseId)
  ).json();
  assert.equal(runs.length, 1);
  const snapshot = await (
    await page.request.get(base + "/api/audit-runs/" + runs[0].id)
  ).json();
  assert.equal(snapshot.payload.draft.wc[0].row.overtimePremium, 0);
  assert.equal(snapshot.payload.correctedWorksheet.wc[0].overtimePremium, 1000);
  assert.equal(JSON.stringify(snapshot).includes("fake-browser-key"), false);
  await page
    .getByText("Record a checked correction for future audits", { exact: true })
    .click();
  await page
    .locator("#correction-title")
    .fill("Use only the extra overtime premium");
  await page
    .locator("#correction-corrected")
    .fill(
      "Check the payroll register and remove only documented extra overtime premium when supported by the applicable policy/manual authority. Do not exclude all overtime pay.",
    );
  await page
    .locator("#correction-source")
    .fill(
      "Fictional teaching source reviewed by staff, page 1; not a real NCCI rule citation.",
    );
  await page.locator("#correction-form").getByRole("button").click();
  await page
    .locator("#learning-status")
    .filter({ hasText: "Correction saved as a draft" })
    .waitFor();
  const article = page
    .locator("#correction-queue > article")
    .filter({ hasText: "Use only the extra overtime premium" });
  await article.waitFor();
  await page.locator("#learning-match").click();
  await page
    .locator("#learning-status")
    .filter({ hasText: "approved corrections loaded" })
    .waitFor();
  assert.equal(await page.locator("#learning-matches article").count(), 0);
  await article.locator(".lesson-source-checked").check();
  await article.locator(".lesson-reuse").check();
  await article.locator(".lesson-approve").click();
  await page
    .locator("#learning-status")
    .filter({ hasText: "Correction approve recorded" })
    .waitFor();
  await page.locator("#learning-match").click();
  await page
    .locator("#learning-status")
    .filter({ hasText: "approved corrections loaded" })
    .waitFor();
  await page.locator("#learning-record").click();
  await page
    .locator("#learning-status")
    .filter({ hasText: "immutable comparison snapshot" })
    .waitFor();
  const originalRuns = await (
    await page.request.get(base + "/api/audit-runs?caseId=" + caseId)
  ).json();
  for (const run of originalRuns) {
    const original = await (
      await page.request.get(base + "/api/audit-runs/" + run.id)
    ).json();
    assert.equal(
      original.payload.lessons.length,
      0,
      "Refreshing current memory changed historical model context",
    );
  }
  await page.getByRole("button", { name: "Client cases", exact: true }).click();
  await page
    .getByRole("button", { name: "Add fictional demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review the audit", exact: true })
    .click();
  await page.locator("#learning-text").fill(source);
  await page.locator("#learning-sharing").check();
  await page.locator("#learning-review").click();
  await page
    .locator("#learning-status")
    .filter({ hasText: "Draft ready" })
    .waitFor();
  assert.equal(seenLessons.length, 2);
  assert.equal(seenLessons[1].length, 1);
  assert.match(seenLessons[1][0].correction, /only documented extra overtime/);
  const nextDraft = JSON.parse(
    await page.locator("#learning-draft-json").inputValue(),
  );
  assert.equal(nextDraft.wc[0].row.overtimePremium, 1000);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.equal(axe.violations.length, 0, JSON.stringify(axe.violations));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/checked-learning-loop.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const removed = await page.request.delete(base + "/api/account", {
    headers: { Origin: base },
  });
  assert.equal(removed.status(), 200);
  const report = {
    date: new Date().toISOString(),
    checks: [
      "source-quoted structured draft with synthetic mocked model",
      "all verification cleared on import",
      "staff correction recorded against original immutable draft",
      "unapproved lesson excluded from retrieval",
      "source-checked owner approval",
      "next synthetic audit receives the approved correction in its model context",
      "model key absent from saved review snapshot",
      "source-case/account cleanup",
    ],
    modelCalls: seenLessons.length,
    rememberedLessonsPerCall: seenLessons.map((l) => l.length),
    runtimeErrors: errors,
    externalRequests: requests,
    axeViolations: axe.violations.length,
    limits:
      "Synthetic mock verifies wiring only; no real provider call, real-client learning or performance improvement is established.",
  };
  await writeFile(
    "docs/learning-browser-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
