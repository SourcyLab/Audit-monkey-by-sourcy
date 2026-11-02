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
const contexts = [],
  errors = [],
  accessibility = [];
async function login(email) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(base);
  await page.locator("#account-email").fill(email);
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
  const session = await (await page.request.get(base + "/api/session")).json();
  return { page, context, id: session.userId, email };
}
async function axe(page, label) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  accessibility.push({
    page: label,
    violations: r.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  });
  assert.equal(r.violations.length, 0, JSON.stringify(accessibility.at(-1)));
}
const suffix = Date.now();
try {
  const owner = await login("pilot-owner-" + suffix + "@example.test"),
    member = await login("pilot-member-" + suffix + "@example.test"),
    outsider = await login("pilot-outsider-" + suffix + "@example.test");
  const p = owner.page;
  await p
    .getByRole("button", { name: "Review the audit", exact: true })
    .click();
  await p.locator('[data-path="name"]').fill("Fictional Pilot Client Alpha");
  await p.locator('[data-path="name"]').press("Tab");
  await p.getByRole("button", { name: "Client cases", exact: true }).click();
  await p.locator("#save-server-case").click();
  await p
    .locator("#case-storage-status")
    .filter({ hasText: "Case saved to backend" })
    .waitFor();
  const caseId = await p.locator("#case-select").inputValue();
  await p
    .getByText("Tenant owner settings & teammates", { exact: true })
    .click();
  await p.locator("#case-member-email").fill(member.email);
  await p.locator("#invite-case-member").click();
  await p
    .locator("#tenant-status")
    .filter({ hasText: "Tenant access updated" })
    .waitFor();
  await p
    .locator("#private-file")
    .setInputFiles({
      name: "fictional-team-file.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("FICTIONAL SHARED RECORD"),
    });
  await p.locator("#upload-authority").check();
  await p.locator("#private-upload").click();
  await p
    .locator("#privacy-status")
    .filter({ hasText: "File uploaded privately" })
    .waitFor();
  await member.page
    .getByRole("button", { name: "Client cases", exact: true })
    .click();
  await member.page.locator("#tenant-refresh").click();
  await member.page
    .locator('#tenant-select option[value="' + owner.id + '"]')
    .waitFor({ state: "attached" });
  await member.page.locator("#tenant-select").selectOption(owner.id);
  await member.page
    .getByRole("button", { name: "Load saved case", exact: true })
    .click();
  await member.page
    .locator("#status")
    .filter({ hasText: "Saved case loaded" })
    .waitFor();
  assert.equal(await member.page.locator("#case-select").inputValue(), caseId);
  assert.equal(
    await member.page.locator("#invite-case-member").isDisabled(),
    true,
  );
  const dl = member.page.waitForEvent("download");
  await member.page
    .locator("#private-files")
    .getByRole("button", { name: "Download file", exact: true })
    .click();
  assert.equal((await dl).suggestedFilename(), "fictional-team-file.txt");
  await member.page
    .getByRole("button", { name: "Review the audit", exact: true })
    .click();
  await member.page
    .locator('[data-path="workflow.internalNotes"]')
    .fill("Fictional teammate review edit");
  await member.page
    .locator('[data-path="workflow.internalNotes"]')
    .press("Tab");
  await member.page
    .getByRole("button", { name: "Client cases", exact: true })
    .click();
  await member.page.locator("#save-server-case").click();
  await member.page
    .locator("#case-storage-status")
    .filter({ hasText: "Case saved to backend" })
    .waitFor();
  await p.locator("#save-server-case").click();
  await p
    .locator("#case-storage-status")
    .filter({ hasText: "Case changed" })
    .waitFor();
  const denied = await outsider.page.request.get(
    base + "/api/cases/" + caseId,
    { headers: { "X-Tenant-ID": owner.id } },
  );
  assert.equal(denied.status(), 403);
  await p.locator("#case-member-email").fill(member.email);
  await p.locator("#revoke-case-member").click();
  await p
    .locator("#tenant-status")
    .filter({ hasText: "Tenant access updated" })
    .waitFor();
  await member.page.locator("#refresh-server-cases").click();
  await member.page
    .locator("#case-storage-status")
    .filter({ hasText: "Tenant access denied" })
    .waitFor();
  await member.page.reload();
  await member.page.locator("#case-select").waitFor();
  assert.equal(await member.page.locator("#case-select option").count(), 1);
  const admin = await login("pilot-ui-admin@example.test");
  await admin.page
    .getByRole("button", { name: "Client cases", exact: true })
    .click();
  await admin.page.locator("#sourcy-admin").waitFor();
  await admin.page.locator("#admin-list").click();
  await admin.page
    .locator("#admin-tenants")
    .filter({ hasText: owner.id })
    .waitFor();
  await admin.page.locator("#admin-tenant-id").fill(owner.id);
  await admin.page
    .locator("#admin-reference")
    .fill("FICTIONAL-INVOICE-" + suffix);
  await admin.page
    .locator("#admin-reason")
    .fill("Fictional pilot invoice verification");
  await admin.page.locator("#admin-cost-month").fill("2026-11");
  await admin.page.locator("#admin-cost-cents").fill("100");
  await admin.page.locator("#admin-cost-form").getByRole("button").click();
  await admin.page
    .locator("#admin-status")
    .filter({ hasText: "2× quote calculated" })
    .waitFor();
  assert.match(
    await admin.page.locator("#admin-result").innerText(),
    /"priceCents": 200/,
  );
  await axe(admin.page, "sourcy-admin");
  await admin.page.evaluate(() => window.scrollTo(0, 0));
  await admin.page.screenshot({
    path: "docs/screenshots/sourcy-admin-desktop.png",
    fullPage: true,
  });
  const exportWait = admin.page.waitForEvent("download");
  await admin.page.locator("#admin-training").click();
  assert.match((await exportWait).suggestedFilename(), /training-aggregate/);
  await admin.page
    .locator("#admin-result")
    .filter({ hasText: '"aggregates": []' })
    .waitFor();
  await member.page.setViewportSize({ width: 390, height: 844 });
  await member.page
    .getByRole("button", { name: "Client cases", exact: true })
    .click();
  await axe(member.page, "mobile-tenant-workspace");
  assert.equal(
    await member.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  for (const account of [owner, member, outsider, admin]) {
    const r = await account.page.request.delete(base + "/api/account", {
      headers: { Origin: base },
    });
    assert.equal(r.status(), 200);
  }
  assert.deepEqual(errors, []);
  const report = {
    date: new Date().toISOString(),
    browser: browser.version(),
    checks: [
      "real browser contexts for tenant owner, teammate, outsider and allowlisted Sourcy admin",
      "tenant switching and local workspace separation",
      "shared saved case load and edit",
      "stale save conflict visible in UI",
      "tenant document download",
      "owner-only teammate controls",
      "cross-tenant direct API denied",
      "revoked teammate denied and reload isolated",
      "admin verified-cost input and 2x quote",
      "restricted empty training export",
      "mobile tenant layout",
      "fictional account cleanup",
    ],
    runtimeErrors: errors,
    accessibility,
  };
  await writeFile(
    "docs/pilot-browser-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const c of contexts) await c.close();
  await browser.close();
}
