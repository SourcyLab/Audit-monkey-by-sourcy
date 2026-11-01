import { adminPanel, mountAdmin } from "./admin-ui";
import { initTenant, tenantPanel, mountTenant, tenantId } from "./tenant-ui";
import { importExposureCSV, exposureTemplate } from "./csv";
import { readiness, deadlineLabel } from "./workflow";
import { reportHTML } from "./report";
import { storagePanel, mountCaseStorage } from "./case-storage";
import { accountGate, mountAccount } from "./account-ui";
import { mountAI } from "./ai-ui";
import { brand, disclaimer } from "./brand";
import { newCase, sampleCase } from "./cases";
import { checklist, observationOptions } from "./checklist";
import { calculate, findings, packet } from "./engine/review";
import { wcExposure } from "./engine/wc";
import { glExposure } from "./engine/gl";
import type { WCRow, GLRow, PremiumStep } from "./engine/types";
import { workspaceSchema, type AuditCase, type Workspace } from "./schema";
import { florida } from "./states/fl";

let signedInUser = "";
let storageKey = "audit-monkey-workspace-v1";
let workspace: Workspace = { version: 1, cases: [sampleCase()] };
let persist = false,
  firstRun = true,
  page = "overview",
  activeId = workspace.cases[0].id,
  message = "";
function loadWorkspaceForAccount(userId: string) {
  storageKey = "audit-monkey-workspace-v1:" + userId + ":" + tenantId();
  workspace = { version: 1, cases: [sampleCase()] };
  activeId = workspace.cases[0].id;
  persist = false;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      workspace = workspaceSchema.parse(JSON.parse(raw));
      persist = true;
      activeId = workspace.cases[0]?.id ?? "";
    }
    firstRun = false; // Authenticated users already accepted the current terms/disclaimer.
  } catch {
    message =
      "Saved workspace could not be read. Import a valid backup or start a new case.";
  }
  if (!workspace.cases.length) {
    workspace.cases = [newCase()];
    activeId = workspace.cases[0].id;
  }
}
const root = document.querySelector<HTMLDivElement>("#app")!;
const e = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
const usd = (v: number | null) =>
  v === null
    ? "Not yet verified"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(v);
const current = () => workspace.cases.find((c) => c.id === activeId)!;
const verified = (c: AuditCase) =>
  c.evidence.filter(
    (x) => x.status === "verified" || x.status === "not-applicable",
  ).length;
function save() {
  if (persist) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(workspace));
    } catch {
      message =
        "Browser storage is unavailable or full. Export a JSON backup now.";
    }
  }
}
function field(
  label: string,
  path: string,
  value: unknown,
  type = "text",
  hint = "",
) {
  return `<label class="field">${e(label)}<input data-path="${e(path)}" type="${type}" value="${e(value)}" ${type === "number" ? 'min="0" max="1000000000000" step="any"' : ""}>${hint ? `<span class="inline-note">${e(hint)}</span>` : ""}</label>`;
}
function check(label: string, path: string, value: boolean) {
  return `<label class="check"><input type="checkbox" data-path="${e(path)}" ${value ? "checked" : ""}>${e(label)}</label>`;
}
function select(label: string, path: string, value: string, options: string[]) {
  return `<label class="field">${e(label)}<select data-path="${e(path)}">${options.map((x) => `<option ${x === value ? "selected" : ""} value="${e(x)}">${e(x.replaceAll("-", " "))}</option>`).join("")}</select></label>`;
}
const heading = (eyebrow: string, title: string, desc: string) =>
  `<div class="page-title"><div><div class="eyebrow">${e(eyebrow)}</div><h1>${e(title)}</h1><p>${e(desc)}</p></div></div>`;
function overview(c: AuditCase) {
  const r = calculate(c),
    n = verified(c);
  return `
  <section class="hero"><div><div class="eyebrow">A fair audit starts with good records</div><h1>Know what you owe.<br>Question what you don’t.</h1><p class="intro">Put your workers’ comp or general liability audit in order. Find missing records, follow the math and build a clear case for a correction.</p><div class="hero-actions"><button class="btn primary" data-page="prepare">Prepare my audit <span aria-hidden="true">↗</span></button><button class="btn" data-page="review">Review a final audit</button></div></div><aside class="hero-note"><div class="eyebrow">Your workspace, your records</div><div class="large">Private by design.</div><p>Calculations run in this browser. Account details, cases you explicitly save and files you explicitly upload go to Sourcy Inc. Optional AI sends only selected text.</p><hr><div class="row"><span class="small">Florida first · WC & GL</span><span class="badge green">EXPLICIT SHARING</span></div></aside></section>
  <div class="grid four"><div class="card stat"><span class="eyebrow">Documents verified</span><div class="value">${n}<span class="muted"> / ${c.evidence.length}</span></div><p>${c.evidence.length - n} items still need a decision</p></div><div class="card stat"><span class="eyebrow">Carrier final</span><div class="value">${c.policy.carrierFinal === null ? "—" : usd(c.policy.carrierFinal)}</div><p>Before deposit credit</p></div><div class="card stat"><span class="eyebrow">Proposed final</span><div class="value">${r.final === null ? "—" : usd(r.final)}</div><p>${r.complete ? "Scenario, subject to record review" : "Complete verified inputs to estimate"}</p></div><div class="card stat"><span class="eyebrow">Cases in workspace</span><div class="value">${workspace.cases.length.toString().padStart(2, "0")}</div><p>Switch clients without mixing records</p></div></div>
  <div class="section-heading"><h2>A clearer path through your audit</h2><span class="small muted">From the first request to the final answer</span></div><div class="grid"><article class="card pathcard"><div class="number">01 / PREPARE</div><h3>Get your records ready.</h3><p>A practical checklist, who to ask and why each record matters.</p><button data-page="prepare">Open checklist</button><span class="arrow" aria-hidden="true">↗</span></article><article class="card pathcard"><div class="number">02 / REVIEW</div><h3>Make the numbers add up.</h3><p>Check exposure, rates, adjustments and the balance line by line.</p><button data-page="review">Review the worksheet</button><span class="arrow" aria-hidden="true">↗</span></article><article class="card pathcard"><div class="number">03 / RESPOND</div><h3>Put your findings to work.</h3><p>Build an evidence index and a focused re-audit request.</p><button data-page="packet">Build a dispute packet</button><span class="arrow" aria-hidden="true">↗</span></article></div>
  <div class="grid two"><section class="card"><div class="row"><h3>Next up for ${e(c.name)}</h3><span class="badge">${c.line.toUpperCase()}</span></div><ol class="next-list">${
    c.evidence
      .filter((x) => !["verified", "not-applicable"].includes(x.status))
      .slice(0, 3)
      .map(
        (x, i) =>
          `<li><div><span class="index">${i + 1}</span>${e(x.label)}</div><span class="badge amber">${e(x.status)}</span></li>`,
      )
      .join("") ||
    "<li>Every checklist item has a decision. Verify your calculation next.</li>"
  }</ol><button class="btn subtle" data-page="prepare">See the full checklist →</button></section><section class="card"><div class="eyebrow">A note from the audit desk</div><h3 class="note-heading">A certificate is a starting point.<br>The full policy tells the story.</h3><p class="muted small">Bring the declarations, class schedules and every endorsement. The rating basis, exclusions and dates can change the result.</p><button class="btn subtle" data-page="sources">Read the sources & verification notes →</button></section></div>`;
}
function prepare(c: AuditCase) {
  return `${staffEditor(c)}${heading("01 / Prepare", "Better records. Fewer surprises.", "Work through the complete checklist. “Received” means you have it; “verified” means you checked the entity, dates and relevance. Mark non-applicable items with a reason.")}<div class="card"><div class="row"><strong>${verified(c)} of ${c.evidence.length} items resolved</strong><span class="badge">${Math.round((verified(c) / c.evidence.length) * 100)}%</span></div><progress value="${verified(c)}" max="${c.evidence.length}" aria-label="Evidence checklist progress"></progress><p class="inline-note">Savings depend on the policy and accepted evidence. No document guarantees a reduction.</p><div class="spread"><button class="btn" data-action="letter-carrier">Carrier request letter</button><button class="btn" data-action="letter-accountant">Accountant request letter</button><button class="btn" data-action="letter-sub">Subcontractor COI request</button></div></div><div class="grid two">${checklist
    .map(([id, label, owner, how, benefit]) => {
      const index = c.evidence.findIndex((x) => x.id === id);
      if (index < 0) return "";
      const item = c.evidence[index];
      return `<article class="card check-card"><div class="owner">Ask: ${e(owner)}</div><h3>${e(label)}</h3><p>${e(how)}</p><label class="file-label">Collect local records (filenames only; originals stay on your device)<input type="file" multiple data-evidence-file="${index}"></label>${select("Status", `evidence.${index}.status`, item.status, ["missing", "requested", "received", "verified", "not-applicable"])}<label class="field">Record reference / dates / reason<textarea data-path="evidence.${index}.note">${e(item.note)}</textarea></label><p class="benefit"><strong>Why it matters:</strong> ${e(benefit)}</p></article>`;
    })
    .join("")}</div>`;
}
function staffEditor(c: AuditCase) {
  return `<section class="card"><h2>Client & staff tracking</h2><div class="fields four">${field("Insured / client name", "name", c.name)}${field("Carrier", "workflow.carrier", c.workflow.carrier)}${field("Policy number", "workflow.policyNumber", c.workflow.policyNumber)}${field("Internal case reference", "workflow.reference", c.workflow.reference)}${field("Assigned staff", "workflow.assignee", c.workflow.assignee)}${field("Reviewed by", "workflow.reviewer", c.workflow.reviewer)}${select("Work stage", "workflow.stage", c.workflow.stage, ["intake", "preparing", "reviewing", "ready", "submitted", "closed"])}${field("Next follow-up", "workflow.followUp", c.workflow.followUp, "date")}${field("Next action", "workflow.nextAction", c.workflow.nextAction)}</div><p class="inline-note">Use a separate case for each WC or GL policy. Review stages are staff tracking, not an automated approval. Save to the backend from Client cases after editing.</p><div class="fields">${select("Primary review category", "workflow.reviewCategory", c.workflow.reviewCategory, ["unclassified", "overtime", "officer", "subcontractor", "classification", "mod", "gl-basis", "other"])}${select("Carrier outcome", "workflow.outcome", c.workflow.outcome, ["pending", "accepted", "partly-accepted", "rejected", "no-change"])}${field("Written outcome source / page (private)", "workflow.outcomeSource", c.workflow.outcomeSource)}</div>${check("I verified this outcome against the written carrier response", "workflow.outcomeVerified", c.workflow.outcomeVerified)}<p class="inline-note">Saving records a structured learning event. Only human-verified outcomes with the applicable permissions can enter training or sale exports; no model retrains itself.</p><label class="field">Internal staff notes (excluded from the downloaded carrier draft)<textarea data-path="workflow.internalNotes">${e(c.workflow.internalNotes)}</textarea></label></section>`;
}
function policyEditor(c: AuditCase) {
  const p = c.policy;
  return `<section class="card"><h2>Policy & reconciliation</h2><div class="fields">${field("Policy start", "policy.start", p.start, "date")}${field("Policy end · exclusive", "policy.end", p.end, "date")}${field("Deposit / premium already paid ($)", "policy.deposit", p.deposit, "number")}${field("Carrier final before deposit ($)", "policy.carrierFinal", p.carrierFinal, "number", "Leave blank if unknown.")}${field("Confirmed dispute deadline", "deadline", c.deadline, "date")}${field("Deadline source / written confirmation", "deadlineSource", c.deadlineSource)}</div><p class="inline-note">Enter your own verified rates, values and calculation order. Zero is a deliberate value; blank means unknown. No carrier rates are supplied.</p></section>`;
}
function wcEditor(c: AuditCase) {
  return `<div class="section-heading"><h2>WC exposure by class & period</h2><button class="btn" data-action="add-wc">+ Add row</button></div><p class="inline-note">Use one row per employee/class/period when officer limits apply. Enter period-specific officer minimum and maximum dollars after verifying units and duration. Do not apply one person’s cap separately to multiple class rows.</p>${c.wc.map((r, i) => `<article class="card"><div class="row"><h3>${e(r.name || "New payroll row")} <span class="badge">${e(r.classCode || "Class TODO")}</span></h3><button class="btn subtle danger" data-remove="wc.${i}" aria-label="Remove ${e(r.name || "payroll row")}">Remove</button></div><div class="fields four">${field("Employee / group / sub", `wc.${i}.name`, r.name)}${field("Verified class code", `wc.${i}.classCode`, r.classCode)}${field("Gross payroll / chargeable sub exposure ($)", `wc.${i}.gross`, r.gross, "number")}${field("Rate per $100", `wc.${i}.rate`, r.rate, "number")}${field("Extra OT premium only ($)", `wc.${i}.overtimePremium`, r.overtimePremium, "number")}${field("Other allowed excluded pay ($)", `wc.${i}.excludedPay`, r.excludedPay, "number")}${field("Exposure start", `wc.${i}.start`, r.start, "date")}${field("Exposure end · exclusive", `wc.${i}.end`, r.end, "date")}</div><label class="field">Actual duties / basis for allocation<input data-path="wc.${i}.duties" value="${e(r.duties)}"></label><div class="grid two"><div>${check("Officer / owner subject to verified payroll limits", `wc.${i}.officer`, r.officer)}${r.officer ? `<div class="fields">${field("Period minimum ($)", `wc.${i}.officerMin`, r.officerMin, "number")}${field("Period maximum ($)", `wc.${i}.officerMax`, r.officerMax, "number")}</div>` : ""}${check("Claiming individual exemption", `wc.${i}.exempt`, r.exempt)}${check("Exemption eligibility and all row dates verified", `wc.${i}.exemptionVerified`, r.exemptionVerified)}</div><div>${check("This row is subcontractor exposure", `wc.${i}.subcontractor`, r.subcontractor)}${check("WC coverage, entity and all dates worked verified; exclusion accepted under applicable rule", `wc.${i}.coiVerified`, r.coiVerified)}${check("Duties, class, rate, exclusions and split records verified", `wc.${i}.recordsVerified`, r.recordsVerified)}</div></div><p class="inline-note">Proposed chargeable exposure: <strong>${usd(wcExposure(r))}</strong>. An unverified COI does not exclude the row.</p></article>`).join("") || '<div class="card empty">Add payroll or subcontractor exposure to start.</div>'}<section class="card"><div class="row"><h3>Experience mod periods</h3><button class="btn" data-action="add-mod">+ Add mod period</button></div><p class="inline-note">Enter every verified factor and its effective period. If a change falls inside a row, split actual payroll into separate rows; the app will not guess the allocation.</p>${c.policy.mods.map((m, i) => `<div class="fields four">${field("Effective from", `policy.mods.${i}.start`, m.start, "date")}${field("Effective to · exclusive", `policy.mods.${i}.end`, m.end, "date")}${field("Verified mod factor", `policy.mods.${i}.factor`, m.factor, "number")}<button class="btn subtle danger" data-remove="policy.mods.${i}">Remove period</button></div>`).join("")}</section>`;
}
function glEditor(c: AuditCase) {
  return `<div class="section-heading"><h2>GL classes & rating bases</h2><button class="btn" data-action="add-gl">+ Add row</button></div><p class="inline-note">A WC exclusion is not automatically a GL exclusion. Use a separate row if insured subcontractors are rated at a different rate.</p>${c.gl.map((r, i) => `<article class="card"><div class="row"><h3>${e(r.name || "New GL row")}</h3><button class="btn subtle danger" data-remove="gl.${i}">Remove</button></div><div class="fields four">${field("Operations / class description", `gl.${i}.name`, r.name)}${field("Class code", `gl.${i}.classCode`, r.classCode)}${select("Policy rating basis", `gl.${i}.basis`, r.basis, ["payroll", "sales", "subcost", "units"])}${field("Gross exposure", `gl.${i}.exposure`, r.exposure, "number")}${field("Allowed exclusions", `gl.${i}.excluded`, r.excluded, "number")}${field("Verified rate", `gl.${i}.rate`, r.rate, "number")}${field("Rate denominator (e.g. 1000)", `gl.${i}.per`, r.per, "number")}${field("Insured sub cost within gross", `gl.${i}.insuredSubCost`, r.insuredSubCost, "number")}${field("Exposure start", `gl.${i}.start`, r.start, "date")}${field("Exposure end · exclusive", `gl.${i}.end`, r.end, "date")}</div>${check("Policy permits removing this insured sub cost (subcost basis only)", `gl.${i}.insuredSubExcluded`, r.insuredSubExcluded)}${check("Class, basis, denominator, exclusions, COI dates and policy authority verified", `gl.${i}.evidenceVerified`, r.evidenceVerified)}<p class="inline-note">Proposed chargeable exposure: <strong>${e(glExposure(r))}</strong></p></article>`).join("") || '<div class="card empty">Add a GL class and its policy rating basis.</div>'}`;
}
function stepsEditor(c: AuditCase) {
  return `<section class="card"><h2>Premium elements · in worksheet order</h2><p class="inline-note">WC experience mods apply per row above. Then an optional fixed charge below is applied, followed by these steps in order. Use factors for credits (0.90 means a 10% credit), a minimum step for the premium floor, fixed steps for expense constants and assessment steps for a percent of the running subtotal. These are calculation instructions, not Florida rules. If your policy uses a different assessment base, calculate that base separately and enter the supported assessment as a fixed amount.</p><details><summary>Fixed charge with policy-term proration</summary><div class="fields">${field("Annual fixed charge ($)", "policy.fixedChargeAnnual", c.policy.fixedChargeAnnual, "number")}${field("Verified annual day denominator", "policy.annualDays", c.policy.annualDays, "number")}</div>${check("Prorate this fixed charge by policy days / annual day denominator", "policy.fixedChargeProrated", c.policy.fixedChargeProrated)}<p class="inline-note">Exposure already reflects actual policy-period amounts and is never prorated again. Verify cancellation / short-rate and minimum rules separately.</p></details>${c.policy.steps.map((s, i) => `<div class="card flat"><div class="fields four">${field("Element label", `policy.steps.${i}.label`, s.label)}${select("Operation", `policy.steps.${i}.kind`, s.kind, ["factor", "fixed", "minimum", "assessment"])}${field("Value (assessment in %)", `policy.steps.${i}.value`, s.value, "number")}<div class="spread"><button class="btn subtle" data-move="${i}" aria-label="Move ${e(s.label)} earlier">↑ Earlier</button><button class="btn subtle danger" data-remove="policy.steps.${i}">Remove</button></div></div>${check("Value, base and sequence verified with the full policy / worksheet", `policy.steps.${i}.verified`, s.verified)}</div>`).join("")}<button class="btn" data-action="add-step">+ Add credit, minimum, expense or assessment</button></section>`;
}
function findingHTML(c: AuditCase) {
  return `${findings(c)
    .map(
      (f) =>
        `<article class="finding"><h3>${e(f.title)}</h3><p>${e(f.detail)}</p><p><strong>Support:</strong> ${e(f.evidence)}</p>${f.impact !== null ? `<div class="impact">${usd(f.impact)} overall difference</div><p>Positive = lower proposed final; negative = higher proposed final. Do not add this to other estimates.</p>` : ""}</article>`,
    )
    .join("")}`;
}
function results(c: AuditCase) {
  const r = calculate(c);
  return `<section class="card"><div class="row"><h2>Follow the money</h2><span class="badge ${r.complete ? "green" : "amber"}">${r.complete ? "SCENARIO COMPLETE" : "VERIFICATION NEEDED"}</span></div>${r.issues.length ? `<div class="notice warning"><strong>The estimate is withheld until these are resolved.</strong><ul>${r.issues.map((x) => `<li>${e(x)}</li>`).join("")}</ul></div>` : ""}<div class="table-wrap" tabindex="0" role="region" aria-label="Premium calculation worksheet"><table><caption class="sr-only">Proposed premium calculation</caption><thead><tr><th>Line / element</th><th>Calculation</th><th>Amount</th></tr></thead><tbody>${r.trace.map((t) => `<tr><td>${e(t.label)}</td><td><code>${e(t.formula)}</code></td><td>${usd(t.amount)}</td></tr>`).join("")}<tr><td>Final premium</td><td>After verified elements</td><td>${usd(r.final)}</td></tr><tr><td>Deposit credit</td><td>Premium already paid</td><td>− ${usd(c.policy.deposit)}</td></tr><tr class="total"><td>${r.balance !== null && r.balance < 0 ? "Estimated return premium" : "Estimated balance due"}</td><td></td><td>${r.balance === null ? "—" : usd(Math.abs(r.balance))}</td></tr></tbody></table></div><p class="inline-note">Each exposure line shows its charge. Adjustment rows show the running premium subtotal. Precision is retained until final cents; compare your carrier’s rounding method. Estimates are not guaranteed refunds.</p></section>`;
}
function review(c: AuditCase) {
  return `${heading("02 / Review", "Turn the worksheet into answers.", "Read a PDF locally or enter the audit manually. Compare every line against the full policy and your records.")}<section class="card"><h3>Read the audit worksheet</h3><p class="inline-note">PDF.js extracts text in this browser. It does not infer classifications or populate amounts. Review the text and transcribe verified figures below. Scanned PDFs need OCR performed separately; this app does not send them for OCR.</p><label class="file-label">Choose a local PDF (up to 25 MB / 200 pages)<input id="pdf-upload" type="file" accept="application/pdf,.pdf"></label>${c.worksheetText ? `<details><summary>Extracted worksheet text · review before using</summary><pre tabindex="0">${e(c.worksheetText)}</pre><button class="btn" data-action="clear-pdf">Remove extracted text</button></details>` : ""}</section>${staffEditor(c)}${policyEditor(c)}<div class="tabs" aria-label="Coverage line"><button class="btn ${c.line === "wc" ? "active" : ""}" data-line="wc">Workers’ compensation</button><button class="btn ${c.line === "gl" ? "active" : ""}" data-line="gl">General liability</button></div><section class="card"><h2>Import exposure rows</h2><p>Download the template for this coverage line, replace its example, and import up to 500 rows. Use plain numbers with no currency symbols or thousands separators. Import replaces the rows for this line after confirmation and clears verification; it does not assign classes or verify exclusions.</p><button class="btn" data-action="csv-template">Download ${c.line.toUpperCase()} CSV template</button><label class="file-label">Import template CSV (up to 1 MB)<input id="exposure-csv" type="file" accept="text/csv,.csv"></label></section>${c.line === "wc" ? wcEditor(c) : glEditor(c)}${stepsEditor(c)}${check("I have entered every premium element in the verified policy / worksheet order", "policy.elementsVerified", c.policy.elementsVerified)}<div id="calculation-result">${results(c)}</div><section class="card"><h2>What needs a closer look?</h2><p class="inline-note">Add an evidence-backed review item. These checks identify questions; they do not decide the legally correct classification or exclusion.</p><div class="spread">${observationOptions.map(([id, title]) => `<button class="btn" data-observation="${id}">+ ${e(title)}</button>`).join("")}</div><div id="finding-list">${findingHTML(c)}</div>${c.observations.map((o, i) => `<details><summary>Edit / remove: ${e(o.title)}</summary><label class="field">Finding detail<textarea data-path="observations.${i}.detail">${e(o.detail)}</textarea></label>${field("Evidence needed", `observations.${i}.evidence`, o.evidence)}<button class="btn subtle danger" data-remove="observations.${i}">Remove finding</button></details>`).join("")}<label class="field">Case notes / reconciliation assumptions<textarea data-path="notes">${e(c.notes)}</textarea></label></section>`;
}
function packetView(c: AuditCase) {
  const checks = readiness(c);
  return `${heading("03 / Respond", "A clear request. A stronger record.", "Build a draft you can review with a licensed professional. Nothing is sent from this app. Confirm the deadline before you wait for more records.")}<section class="card"><h2>Pre-submission checks</h2>${checks.length ? `<ul>${checks.map((x) => `<li>${e(x)}</li>`).join("")}</ul>` : "<p>Checks recorded. The reviewer must still approve the actual letter and attachments.</p>"}</section><div class="grid two"><section class="card"><h2>Dispute & re-audit packet</h2><p class="muted">Includes a cover letter, findings, evidence index, proposed worksheet and requests for the carrier’s calculation and re-audit.</p><button class="btn primary" data-action="download-packet">Download draft · Markdown ↓</button><button class="btn" data-action="download-report">Download printable report · HTML ↓</button><p class="inline-note">Attach the actual supporting records yourself. Missing checklist items are identified as missing.</p></section><section class="card"><h2>Keep an eye on the deadline.</h2><div class="deadline"><strong>${c.deadline ? e(c.deadline) : "TODO · get the deadline in writing"}</strong><p class="small">${e(c.deadlineSource || "Confirm the carrier’s dispute and re-audit time limits and the applicable state / NCCI process.")}</p></div><p class="inline-note">A complaint or re-audit request does not automatically extend a deadline, suspend collection or replace payment of undisputed premium.</p></section></div><section class="card"><h2>Choose the right route</h2><ol><li><strong>Carrier, in writing.</strong> Identify each questioned line, amount and supporting record. Request the applicable rule and a written response.</li><li><strong>Re-audit.</strong> Ask whether omitted COIs, exemption forms, overtime detail or payroll splits can be considered. Obtain the deadline and submission requirements.</li><li><strong>NCCI · WC manual-rule disputes.</strong> After efforts with the carrier, confirm eligibility, any payment prerequisites, state process and filing limits directly with NCCI. This is not a GL dispute route.</li><li><strong>Florida DFS / OIR.</strong> Consumer Services can help with premium concerns. Ask OIR about the proper regulatory route when needed; do not assume either office decides every contract dispute.</li></ol><button class="btn" data-page="sources">Open official routes & sources</button></section><section class="card"><h2>Preview your draft</h2><pre tabindex="0">${e(packet(c, disclaimer))}</pre></section>`;
}
function sources() {
  return `${heading("Reference desk", "Know the rule. Verify the version.", "Florida WC rules and GL rating bases are separate. Your policy, effective filings and actual operations control; this tool does not replace a licensed professional.")}<section class="card"><h2>${florida.name}</h2><ul>${florida.verify.map((x) => `<li>${e(x)}</li>`).join("")}</ul><ul class="source-list">${florida.sources.map((s) => `<li><a href="${e(s.url)}" target="_blank" rel="noreferrer">${e(s.label)} ↗</a></li>`).join("")}</ul><p class="inline-note">Source links checked November 1, 2026 where publicly accessible. NCCI and ISO manuals can require licensed access; this project does not redistribute their proprietary rules or tables. Verify current values and policy-effective editions.</p></section><section class="card"><h2>What this engine can tell you</h2><p>It calculates the scenario you enter and identifies missing verification. It does not select a class, determine coverage or promise a saving. Insured-sub cost may still be chargeable under GL. Officer limits must be entered for the correct person and period.</p><p>Use the repository’s <code>/guides</code>, <code>/guides/templates</code> and <code>/prompts</code> for printable checklists and request drafts. The optional MCP server in <code>/mcp</code> exposes the same calculations to compatible AI clients; connecting an AI client may send information to that provider.</p></section>`;
}
function caseView() {
  return `${heading("Case workspace", "Every client, in its own case.", "Save cases explicitly to the backend for recovery and staff sharing, or keep them in this browser and export JSON backups. Backend save does not upload original documents.")}<div class="card"><div class="spread"><button class="btn primary" data-action="new-case">+ New case</button><button class="btn" data-action="sample">Add fictional demo</button><button class="btn" data-action="export">Export workspace JSON</button></div><label class="file-label">Import workspace JSON (replaces the workspace after confirmation)<input id="json-import" type="file" accept="application/json,.json"></label>${check("Remember cases on this browser (unencrypted local storage)", "persist", persist)}<p class="inline-note">On a shared computer, leave this off. Turning it off removes the saved workspace from this app’s browser storage. Exported files and provider conversations remain under your control.</p></div>${tenantPanel()}${storagePanel()}${workspace.cases.map((c) => `<article class="card"><div class="row"><div><div class="case-name">${e(c.name)}</div><p class="small">${e(c.workflow.stage)} · Assigned: ${e(c.workflow.assignee || "Unassigned")} · ${e(deadlineLabel(c.workflow.followUp))}</p><p class="small">${e(c.workflow.nextAction)}</p><span class="inline-note">${e(c.policy.start)} → ${e(c.policy.end)} · ${c.line.toUpperCase()} · ${verified(c)}/${c.evidence.length} resolved</span></div><div class="spread">${c.fictional ? '<span class="badge amber">FICTIONAL DEMO</span>' : ""}<button class="btn" data-case="${e(c.id)}">Open case →</button><button class="btn subtle danger" data-delete-case="${e(c.id)}">Delete</button></div></div></article>`).join("")}`;
}
function render() {
  const c = current();
  root.innerHTML = `<div class="layout"><aside class="rail"><div><a class="brandmark" href="#" data-page="overview"><img src="${brand.logo}" alt="The Audit Monkey"><span>The Audit<br>Monkey</span></a><a class="credit" href="${brand.credit}" target="_blank" rel="noreferrer">by Sourcy ↗</a></div><div><div class="rail-caption">Audit workspace</div><nav class="nav" aria-label="Main navigation">${[
    ["overview", "◫", "Overview"],
    ["prepare", "☑", "Prepare"],
    ["review", "≋", "Review the audit"],
    ["packet", "↗", "Dispute packet"],
    ["cases", "▦", "Client cases"],
    ["sources", "⊙", "Sources & guides"],
  ]
    .map(
      ([id, icon, label]) =>
        `<button data-page="${id}" ${page === id ? 'aria-current="page"' : ""}><span class="symbol" aria-hidden="true">${icon}</span>${label}</button>`,
    )
    .join(
      "",
    )}</nav></div><div class="rail-bottom"><p><span class="privacy-dot"></span>Local audit calculations</p><p class="muted">Free for personal &<br>noncommercial use.</p><a href="${brand.help}" target="_blank" rel="noreferrer">Get paid help ↗</a></div></aside><div><header class="topbar"><div class="breadcrumbs">Workspace <span aria-hidden="true"> / </span><strong>${e(page === "overview" ? "Overview" : page === "cases" ? "Client cases" : c.name)}</strong></div><div class="tools"><span class="save-indicator">${persist ? "Saved in this browser" : "Browser session · save or export to keep"}</span><button class="btn" data-action="export">Export JSON ↓</button><button class="btn dark" data-action="new-case">+ New case</button></div></header><main id="main" class="content" tabindex="-1"><div class="casebar"><div class="spread"><label class="sr-only" for="case-select">Active client case</label><select id="case-select">${workspace.cases.map((x) => `<option value="${e(x.id)}" ${x.id === activeId ? "selected" : ""}>${e(x.name)}</option>`).join("")}</select><span class="badge">FLORIDA</span>${c.fictional ? '<span class="badge amber">FICTIONAL DEMO · MADE-UP RATES</span>' : ""}</div><span class="small muted">${e(c.policy.start)} — ${e(c.policy.end)}</span></div><div id="status" role="status" class="status">${e(message)}</div>${page === "overview" ? overview(c) : page === "prepare" ? prepare(c) : page === "review" ? review(c) : page === "packet" ? packetView(c) : page === "cases" ? caseView() + adminPanel() + '<div id="account-controls"></div>' : sources() + '<div id="ai-settings"></div>'}<footer class="footer"><p>${e(disclaimer)} Free for personal and noncommercial use; commercial use needs permission. No affiliation with NCCI, ISO or AI providers is implied.</p><a href="${brand.help}" target="_blank" rel="noreferrer">Get paid help ↗</a></footer></main></div></div>${firstRun ? `<dialog id="first-run" aria-labelledby="notice-title"><img src="${brand.icon}" alt="The Audit Monkey"><div class="eyebrow">Before you begin</div><h2 id="notice-title">A clearer audit starts here.</h2><p>${e(disclaimer)}</p><p>Your files are processed locally. Cases stay in memory unless you enable browser storage. Export backups yourself. The demo uses fictional figures.</p><p>Code: PolyForm Noncommercial 1.0.0. Guides, prompts and templates: CC BY-NC 4.0. Commercial use needs permission.</p><button class="btn primary" data-action="accept">I understand · open workspace →</button></dialog>` : ""}`;
  bind();
  mountAI(root);
  mountAccount(root);
  mountAdmin(root);
  mountTenant(root, () => {
    loadWorkspaceForAccount(signedInUser);
    message =
      "Tenant switched. Local workspace is isolated by tenant; load saved cases below.";
    render();
  });
  mountCaseStorage(root, current, (next) => {
    const index = workspace.cases.findIndex((c) => c.id === next.id);
    if (index < 0) workspace.cases.push(next);
    else workspace.cases[index] = next;
    activeId = next.id;
    save();
    message = "Saved case loaded. Review the revision before editing.";
    render();
  });
  root
    .querySelectorAll<HTMLInputElement>("[data-evidence-file]")
    .forEach((input) => {
      input.onchange = () => {
        const item = current().evidence[Number(input.dataset.evidenceFile)];
        const files = Array.from(input.files ?? []);
        item.note = files
          .map((f) => f.name + " (" + f.size + " bytes)")
          .join("; ");
        if (files.length) item.status = "received";
        save();
        render();
      };
    });
  if (firstRun) root.querySelector<HTMLDialogElement>("dialog")?.showModal();
}
function download(name: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function setPath(path: string, value: unknown) {
  if (path === "persist") {
    persist = Boolean(value);
    try {
      if (!persist) localStorage.removeItem(storageKey);
    } catch {
      /* status handled on save */
    }
    save();
    return;
  }
  current().workflow.updatedAt = new Date().toISOString();
  const parts = path.split(".");
  let obj: Record<string, unknown> = current() as unknown as Record<
    string,
    unknown
  >;
  for (const part of parts.slice(0, -1))
    obj = obj[part] as Record<string, unknown>;
  obj[parts.at(-1)!] = value;
  save();
}
function requestLetter(kind: string) {
  const c = current(),
    needs =
      kind === "carrier"
        ? "Please provide the full policy (declarations, schedules and endorsements), complete audit instructions, audit worksheet, final bill, rate and mod worksheets with effective dates, and the written dispute and re-audit deadlines. Please explain the premium calculation and each questioned classification or exposure."
        : kind === "sub"
          ? "Please provide certificates for the correct entity and line of insurance covering every date worked, issuer contact information, dates of work, contracts and payment detail. If a Florida individual exemption is relevant, please provide the certificate and verification for those dates. Do not change or backdate coverage documents."
          : "Please provide the policy-period P&L, general ledger, detailed payroll with duties and class splits, extra overtime premium detail, four quarterly 941s, 940, Florida RT-6 reports, W-2/W-3 and 1099s. Please reconcile calendar-year reports and partial quarters to the policy period, and identify supported pay or sales exclusions.";
  download(
    `${kind}-request.md`,
    `# Records request — draft\n\nFor: ${c.name}\nPolicy period: ${c.policy.start} to ${c.policy.end}\nPolicy number: [TODO]\n\nDear [recipient],\n\n${needs}\n\nPlease confirm availability and a secure delivery method. Do not reply with sensitive records through an unapproved channel.\n\nThank you,\n[name / role / contact]\n\n${disclaimer}\n`,
  );
}
function bind() {
  root.querySelectorAll<HTMLElement>("[data-page]").forEach(
    (el) =>
      (el.onclick = (ev) => {
        ev.preventDefault();
        page = el.dataset.page!;
        message = "";
        render();
        document.querySelector<HTMLElement>("#main")?.focus();
        window.scrollTo(0, 0);
      }),
  );
  root.querySelector<HTMLSelectElement>("#case-select")!.onchange = (ev) => {
    activeId = (ev.target as HTMLSelectElement).value;
    render();
  };
  root
    .querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("[data-path]")
    .forEach(
      (el) =>
        (el.onchange = () => {
          if (!el.checkValidity()) {
            el.reportValidity();
            return;
          }
          const val =
            el instanceof HTMLInputElement && el.type === "checkbox"
              ? el.checked
              : el instanceof HTMLInputElement && el.type === "number"
                ? el.value === ""
                  ? null
                  : Number(el.value)
                : el.value;
          if (el.dataset.path === "workflow.stage" && val === "ready") {
            const issues = readiness(current());
            if (issues.length) {
              el.value = current().workflow.stage;
              message = "Not ready: " + issues.join(" ");
              root.querySelector<HTMLElement>("#status")!.textContent = message;
              return;
            }
          }
          setPath(el.dataset.path!, val);
          const path = el.dataset.path!;
          if (path === "persist" || /wc\.\d+\.officer$/.test(path)) {
            const y = window.scrollY;
            render();
            root
              .querySelector<HTMLElement>('[data-path="' + path + '"]')
              ?.focus();
            window.scrollTo(0, y);
          } else {
            const calc = root.querySelector("#calculation-result");
            if (calc) calc.innerHTML = results(current());
            const list = root.querySelector("#finding-list");
            if (list) list.innerHTML = findingHTML(current());
            const progress = root.querySelector("progress");
            if (progress) {
              progress.value = verified(current());
              const count = root.querySelector(".card .row strong");
              if (count)
                count.textContent =
                  verified(current()) +
                  " of " +
                  current().evidence.length +
                  " items resolved";
              const badge = root.querySelector(".card .row .badge");
              if (badge)
                badge.textContent =
                  Math.round(
                    (verified(current()) / current().evidence.length) * 100,
                  ) + "%";
            }
            const option = root.querySelector<HTMLOptionElement>(
              "#case-select option:checked",
            );
            if (option) option.textContent = current().name;
          }
        }),
    );
  root.querySelectorAll<HTMLElement>("[data-line]").forEach(
    (el) =>
      (el.onclick = () => {
        current().line = el.dataset.line as "wc" | "gl";
        save();
        render();
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-remove]").forEach(
    (el) =>
      (el.onclick = () => {
        if (!confirm("Remove this row?")) return;
        const parts = el.dataset.remove!.split(".");
        let arr: unknown = current();
        for (const k of parts.slice(0, -1))
          arr = (arr as Record<string, unknown>)[k];
        (arr as unknown[]).splice(Number(parts.at(-1)), 1);
        save();
        render();
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-move]").forEach(
    (el) =>
      (el.onclick = () => {
        const i = Number(el.dataset.move),
          s = current().policy.steps;
        if (i > 0) [s[i - 1], s[i]] = [s[i], s[i - 1]];
        save();
        render();
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-observation]").forEach(
    (el) =>
      (el.onclick = () => {
        const o = observationOptions.find(
          (x) => x[0] === el.dataset.observation,
        )!;
        current().observations.push({
          id: crypto.randomUUID(),
          title: o[1],
          detail: o[2],
          evidence: o[3],
        });
        save();
        render();
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-case]").forEach(
    (el) =>
      (el.onclick = () => {
        activeId = el.dataset.case!;
        page = "overview";
        render();
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-delete-case]").forEach(
    (el) =>
      (el.onclick = () => {
        if (
          !confirm(
            "Delete this case from this workspace? Export a backup first if needed.",
          )
        )
          return;
        workspace.cases = workspace.cases.filter(
          (x) => x.id !== el.dataset.deleteCase,
        );
        if (!workspace.cases.length) workspace.cases.push(newCase());
        if (!workspace.cases.some((x) => x.id === activeId))
          activeId = workspace.cases[0].id;
        save();
        render();
      }),
  );
  root
    .querySelectorAll<HTMLElement>("[data-action]")
    .forEach((el) => (el.onclick = () => action(el.dataset.action!)));
  const csv = root.querySelector<HTMLInputElement>("#exposure-csv");
  if (csv)
    csv.onchange = async () => {
      const file = csv.files?.[0];
      if (!file) return;
      try {
        if (file.size > 1024 * 1024)
          throw new Error("Use a CSV smaller than 1 MB");
        const target = current(),
          next = importExposureCSV(await file.text(), target);
        if (
          !confirm(
            "Replace the exposure rows for this line? Export a backup first. Imported rows require fresh verification.",
          )
        )
          return;
        const index = workspace.cases.findIndex((c) => c.id === target.id);
        workspace.cases[index] = next;
        save();
        message =
          "CSV imported. Verify every row, rate, date, exclusion and premium element before using the estimate.";
      } catch (err) {
        message = err instanceof Error ? err.message : "CSV import failed";
      }
      render();
    };
  const pdf = root.querySelector<HTMLInputElement>("#pdf-upload");
  if (pdf)
    pdf.onchange = async () => {
      const file = pdf.files?.[0];
      if (!file) return;
      const target = current();
      try {
        message = "Reading PDF locally…";
        pdf.disabled = true;
        document.querySelector("#status")!.textContent = message;
        const { readPDF } = await import("./pdf");
        const text = await readPDF(file);
        target.worksheetText = text;
        message = text.replace(/--- Page \d+ ---/g, "").trim()
          ? "PDF text is ready. Verify it and enter amounts manually."
          : "No text was found. This may be a scan; use manual entry or separate local OCR.";
        save();
      } catch (err) {
        message = `PDF could not be read: ${err instanceof Error ? err.message : "Unknown error"}. You can still enter the worksheet manually.`;
      }
      render();
    };
  const imp = root.querySelector<HTMLInputElement>("#json-import");
  if (imp)
    imp.onchange = async () => {
      const file = imp.files?.[0];
      if (!file) return;
      try {
        if (file.size > 5 * 1024 * 1024)
          throw new Error("Use a JSON file smaller than 5 MB.");
        const next = workspaceSchema.parse(JSON.parse(await file.text()));
        if (new Set(next.cases.map((x) => x.id)).size !== next.cases.length)
          throw new Error("Duplicate case identifiers.");
        if (
          !confirm(
            `Replace this workspace with ${next.cases.length} imported cases? Export a backup first if needed.`,
          )
        )
          return;
        workspace = next;
        if (!workspace.cases.length) workspace.cases.push(newCase());
        activeId = workspace.cases[0].id;
        save();
        message = "Workspace imported. Review all figures and evidence.";
      } catch {
        message =
          "Import rejected. Use a valid version 1 Audit Monkey workspace JSON, up to 5 MB, with unique case IDs.";
      }
      render();
    };
}
function action(id: string) {
  const c = current();
  if (id.startsWith("letter-")) {
    requestLetter(id.slice(7));
    return;
  }
  switch (id) {
    case "accept":
      firstRun = false;
      try {
        localStorage.setItem("audit-monkey-notice", "accepted");
      } catch {
        /* notice will repeat if storage unavailable */
      }
      break;
    case "new-case": {
      const next = newCase();
      workspace.cases.push(next);
      activeId = next.id;
      page = "review";
      break;
    }
    case "sample": {
      const next = sampleCase();
      workspace.cases.push(next);
      activeId = next.id;
      page = "overview";
      break;
    }
    case "export":
      download(
        "audit-monkey-workspace.json",
        JSON.stringify(workspace, null, 2),
        "application/json",
      );
      message =
        "JSON exported. Store it securely; it may contain sensitive case information.";
      break;
    case "csv-template":
      download(
        c.line + "-exposure-template.csv",
        exposureTemplate(c),
        "text/csv",
      );
      break;
    case "download-report":
      download(
        "audit-findings-draft.html",
        reportHTML(c, disclaimer),
        "text/html",
      );
      break;
    case "download-packet":
      download("audit-dispute-draft.md", packet(c, disclaimer));
      break;
    case "clear-pdf":
      c.worksheetText = "";
      break;
    case "add-wc": {
      const row: WCRow = {
        id: crypto.randomUUID(),
        name: "",
        classCode: "",
        duties: "",
        gross: 0,
        overtimePremium: 0,
        excludedPay: 0,
        officer: false,
        officerMin: null,
        officerMax: null,
        exempt: false,
        exemptionVerified: false,
        subcontractor: false,
        coiVerified: false,
        recordsVerified: false,
        rate: null,
        start: c.policy.start,
        end: c.policy.end,
      };
      c.wc.push(row);
      break;
    }
    case "add-gl": {
      const row: GLRow = {
        id: crypto.randomUUID(),
        name: "",
        classCode: "",
        basis: "sales",
        exposure: 0,
        excluded: 0,
        insuredSubCost: 0,
        insuredSubExcluded: false,
        evidenceVerified: false,
        rate: null,
        per: 1000,
        start: c.policy.start,
        end: c.policy.end,
      };
      c.gl.push(row);
      break;
    }
    case "add-mod":
      c.policy.mods.push({
        start: c.policy.start,
        end: c.policy.end,
        factor: 1,
      });
      break;
    case "add-step": {
      const step: PremiumStep = {
        id: crypto.randomUUID(),
        label: "Verify premium element",
        kind: "fixed",
        value: 0,
        verified: false,
      };
      c.policy.steps.push(step);
      break;
    }
  }
  save();
  render();
}
void accountGate(root).then(async (userId) => {
  signedInUser = userId;
  await initTenant(userId);
  loadWorkspaceForAccount(userId);
  firstRun = false;
  render();
});
