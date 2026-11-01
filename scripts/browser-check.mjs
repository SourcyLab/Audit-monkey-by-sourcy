import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.AUDIT_BROWSER_PATH
    ? { executablePath: process.env.AUDIT_BROWSER_PATH }
    : {}),
});
await mkdir("docs/screenshots", { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [],
  external = [],
  accessibility = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("request", (req) => {
  if (
    new URL(req.url()).origin !== new URL(base).origin &&
    !req.url().startsWith("blob:") &&
    !req.url().startsWith("data:")
  )
    external.push(req.url());
});
page.on("dialog", (dialog) => dialog.accept());
async function axe(label) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  accessibility.push({
    page: label,
    violations: results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  });
  assert.equal(
    results.violations.length,
    0,
    JSON.stringify(accessibility.at(-1)),
  );
}
try {
  await page.goto(base);
  await page.getByRole("dialog").waitFor();
  await axe("first-run");
  await page
    .getByRole("button", { name: "I understand · open workspace →" })
    .click();
  assert.equal(
    await page
      .locator(".layout")
      .evaluate((el) => getComputedStyle(el).display),
    "grid",
    "App stylesheet did not load",
  );
  await page.getByRole("heading", { name: "Know what you owe." }).waitFor();
  await axe("overview");
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("audit-monkey-workspace-v1"),
    ),
    null,
  );
  await page.screenshot({
    path: "docs/screenshots/overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Prepare my audit" }).click();
  await axe("prepare");
  assert.equal(await page.locator(".check-card").count(), 18);
  const letterWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Carrier request letter", exact: true })
    .click();
  assert.match((await letterWait).suggestedFilename(), /carrier-request/);
  await page
    .getByRole("button", { name: "Review the audit", exact: true })
    .click();
  await axe("review");
  const pdfObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pdfText =
    "BT /F1 12 Tf 50 700 Td (FICTIONAL AUDIT WORKSHEET - payroll 180000) Tj ET";
  pdfObjects.push(
    `<< /Length ${pdfText.length} >>\nstream\n${pdfText}\nendstream`,
  );
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, obj] of pdfObjects.entries()) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await page
    .locator("#pdf-upload")
    .setInputFiles({
      name: "fictional-worksheet.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdf),
    });
  await page
    .getByRole("status")
    .filter({ hasText: "PDF text is ready" })
    .waitFor();
  await page
    .getByText("Extracted worksheet text · review before using", {
      exact: true,
    })
    .click();
  assert.match(
    await page.locator("pre").innerText(),
    /FICTIONAL AUDIT WORKSHEET/,
  );
  await page.getByRole("heading", { name: "Follow the money" }).waitFor();
  assert.match(await page.locator("main").innerText(), /6,206.00/);
  await page.screenshot({
    path: "docs/screenshots/review-desktop.png",
    fullPage: true,
  });
  await page.locator('[data-path="wc.0.overtimePremium"]').fill("0");
  await page.locator('[data-path="wc.0.overtimePremium"]').press("Tab");
  assert.equal(
    await page
      .locator('[data-path="wc.0.excludedPay"]')
      .evaluate((el) => el === document.activeElement),
    true,
    "Tab focus was lost when recalculating",
  );
  assert.match(await page.locator("main").innerText(), /6,404.00/);
  await page
    .getByRole("button", { name: "General liability", exact: true })
    .click();
  await axe("gl-review");
  assert.match(await page.locator("main").innerText(), /3,600.00/);
  await page
    .getByRole("button", { name: "Dispute packet", exact: true })
    .click();
  await axe("packet");
  const packetWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download draft · Markdown ↓" })
    .click();
  assert.match((await packetWait).suggestedFilename(), /audit-dispute-draft/);
  await page.getByRole("button", { name: "Client cases", exact: true }).click();
  await axe("cases");
  const exportWait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export workspace JSON", exact: true })
    .click();
  const backup = await exportWait;
  const stream = await backup.createReadStream();
  const parts = [];
  for await (const part of stream) parts.push(part);
  const exported = JSON.parse(Buffer.concat(parts).toString());
  assert.equal(exported.version, 1);
  assert.equal(exported.cases.length, 1);
  await page
    .locator("#json-import")
    .setInputFiles({
      name: "fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported)),
    });
  await page
    .getByRole("status")
    .filter({ hasText: "Workspace imported" })
    .waitFor();
  await page
    .locator("#json-import")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":99}'),
    });
  await page
    .getByRole("status")
    .filter({ hasText: "Import rejected" })
    .waitFor();
  await page
    .getByRole("button", { name: "+ New case", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Turn the worksheet into answers." })
    .waitFor();
  assert.match(await page.locator("main").innerText(), /estimate is withheld/);
  await page
    .getByRole("button", { name: "Sources & guides", exact: true })
    .click();
  await axe("sources");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.locator("#case-select").selectOption(exported.cases[0].id);
  await page.setViewportSize({ width: 390, height: 844 });
  await axe("mobile-overview");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Mobile horizontal overflow",
  );
  await page.screenshot({
    path: "docs/screenshots/overview-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Review the audit", exact: true })
    .click();
  await axe("mobile-review");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Mobile review horizontal overflow",
  );
  await page.screenshot({
    path: "docs/screenshots/review-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, [], "Browser runtime errors");
  assert.deepEqual(external, [], "Unexpected external network requests");
  const report = {
    date: new Date().toISOString(),
    browser: browser.version(),
    checks: [
      "first-run",
      "local PDF extraction",
      "WC calculation edit",
      "Tab focus retained",
      "GL basis",
      "18-item checklist",
      "request download",
      "packet download",
      "JSON export/import",
      "invalid import",
      "new case incomplete",
      "mobile overflow",
    ],
    externalRequests: external,
    runtimeErrors: errors,
    accessibility,
  };
  await writeFile(
    "docs/browser-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
