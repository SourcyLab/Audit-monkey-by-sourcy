import { currentAISettings } from "./ai-ui";
import { provider } from "./ai";
import { applyDraft, validateDraft, type AuditDraft } from "./audit-draft";
import {
  correctionSchema,
  correctionTopics,
  lessonSchema,
  lessonContext,
  type Lesson,
} from "./corrections";
import { caseSchema, type AuditCase } from "./schema";
import { tenantHeaders, tenantId } from "./tenant-ui";
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
type State = {
  text: string;
  reviewText: string;
  draft: AuditDraft | null;
  lessons: Lesson[];
  usedLessons: Lesson[];
  inputHash: string;
  model: string;
  provider: "openai-compatible" | "anthropic";
  runId: string | null;
  status: string;
};
const states = new Map<string, State>();
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers: { "Content-Type": "application/json", ...tenantHeaders() },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || "Review memory request failed");
  return value;
}
const sha = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export function mountAuditLearning(
  root: HTMLElement,
  current: () => AuditCase,
  changed: (next: AuditCase, message: string) => void,
  openSettings: () => void,
) {
  const slot = root.querySelector<HTMLElement>("#audit-learning");
  if (!slot) return;
  const c = current(),
    tenant = tenantId(),
    key = tenant + ":" + c.id;
  const state = states.get(key) || {
    text: "",
    reviewText: "",
    draft: null,
    lessons: [],
    usedLessons: [],
    inputHash: "",
    model: "",
    provider: "openai-compatible",
    runId: null,
    status: "",
  };
  states.set(key, state);
  const active = () =>
    root.contains(slot) && tenantId() === tenant && current().id === c.id;
  const status = (text: string) => {
    state.status = text;
    if (active()) slot.querySelector("#learning-status")!.textContent = text;
  };
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      status(error instanceof Error ? error.message : "Audit review failed");
    }
  };
  slot.innerHTML =
    '<section class="card"><h2>Feed, check & improve</h2><p>Read a PDF above or paste a redacted audit excerpt below. Optional AI drafts questions and exposure rows with document quotes. You check and correct the worksheet. An explicitly approved correction can help later reviews in this tenant. This uses remembered corrections; it does not retrain the underlying model or alter premium math.</p><div class="spread"><button class="btn" id="learning-use-pdf">Use extracted PDF text</button><button class="btn" id="learning-settings">AI settings</button><button class="btn" id="learning-match">Show applicable approved corrections</button></div><label class="field">Selected audit text to review (redact before sending; max 60,000 characters)<textarea id="learning-text" maxlength="60000"></textarea></label><label class="check"><input id="learning-sharing" type="checkbox">I am authorized to send the selected text and applicable redacted tenant corrections to my configured AI provider.</label><div class="spread"><button class="btn primary" id="learning-review">Draft audit review with approved corrections</button><button class="btn" id="learning-clear">Clear selected text and draft</button></div><p id="learning-status" role="status"></p><div id="learning-matches"></div><div id="learning-draft"></div><details><summary>Record a checked correction for future audits</summary><p>First save your corrected worksheet in Client cases. Corrections start as drafts. Only the tenant owner can approve reuse after checking the cited source and removing client identifiers. Source cases and review snapshots remain private to this tenant.</p><form id="correction-form"><div class="fields"><label class="field">Correction title<input id="correction-title" minlength="4" maxlength="160" required></label><label class="field">Topic<select id="correction-topic">' +
    correctionTopics.map((t) => "<option>" + esc(t) + "</option>").join("") +
    '</select></label><label class="field">Applicable class codes (comma-separated; blank means any class)<input id="correction-codes"></label><label class="field">Source effective from<input id="correction-from" type="date" required></label><label class="field">Source effective to (exclusive)<input id="correction-to" type="date" required></label></div><label class="field">Original finding / what it missed<textarea id="correction-original" maxlength="4000" required></textarea></label><label class="field">Corrected finding and applicability (redacted, reusable, no carrier rates to generalize)<textarea id="correction-corrected" minlength="8" maxlength="4000" required></textarea></label><label class="field">Supporting policy/manual/carrier source, edition/date and page<textarea id="correction-source" minlength="8" maxlength="2000" required></textarea></label><button class="btn" type="submit">Submit correction draft</button></form></details></section><section class="card"><h2>Correction review queue</h2><p>Approved corrections are scoped to Florida, coverage, dates, class codes and synthetic/client origin. Editing an approved correction removes it from reuse until it is approved again. Rejected and retired lessons are never retrieved.</p><button class="btn" id="corrections-refresh">Refresh queue</button><button class="btn" id="corrections-more" hidden>More corrections</button><div id="correction-queue"></div><details><summary>Saved before/after review snapshots</summary><button class="btn" id="learning-history">Load this saved case’s review history</button><div id="learning-runs"></div><pre id="learning-snapshot" tabindex="0"></pre></details></section>';
  const input = (id: string) => slot.querySelector<HTMLInputElement>("#" + id)!;
  input("learning-text").value = state.text;
  input("correction-from").value = c.policy.start;
  input("correction-to").value = c.policy.end;
  input("correction-original").value = state.draft?.summary || "";
  input("learning-text").oninput = () => {
    state.text = input("learning-text").value;
  };
  slot.querySelector("#learning-status")!.textContent = state.status;
  const displayMatches = () => {
    slot.querySelector("#learning-matches")!.innerHTML =
      "<h3>Remembered corrections for this scope</h3>" +
      (state.lessons.length
        ? state.lessons
            .map(
              (l) =>
                '<article class="card flat"><strong>' +
                esc(l.payload.title) +
                "</strong><p>" +
                esc(l.payload.correctedFinding) +
                '</p><details><summary>Inspect the remembered error/correction sent to the provider</summary><pre tabindex="0">' +
                esc(JSON.stringify(lessonContext([l])[0], null, 2)) +
                '</pre></details><p class="inline-note">' +
                esc(l.payload.sourceReference) +
                " · " +
                esc(l.payload.effectiveFrom) +
                " to " +
                esc(l.payload.effectiveTo) +
                " · revision " +
                l.revision +
                "</p></article>",
            )
            .join("")
        : "<p>No applicable approved corrections loaded. New audits still use the existing guides and engine.</p>");
  };
  const match = async () => {
    const now = current(),
      codes = [
        ...new Set(
          (now.line === "wc" ? now.wc : now.gl)
            .map((r) => r.classCode)
            .filter((code) => /^\d{3,6}$/.test(code)),
        ),
      ],
      topics: string[] = [];
    if (now.wc.some((r) => r.overtimePremium > 0)) topics.push("overtime");
    if (now.wc.some((r) => r.officer || r.exempt)) topics.push("officer");
    if (now.wc.some((r) => r.subcontractor)) topics.push("subcontractor");
    if (now.policy.mods.length > 1) topics.push("mod");
    if (now.line === "gl") topics.push("gl-basis");
    const result = await api("corrections/match", "POST", {
      line: now.line,
      start: now.policy.start,
      end: now.policy.end,
      classCodes: codes,
      synthetic: now.fictional,
      topics,
    });
    if (!active()) return;
    state.lessons = result.lessons.map((l: unknown) => lessonSchema.parse(l));
    displayMatches();
  };
  const savedCase = async () => {
    const result = await api("cases/" + c.id);
    if (
      JSON.stringify(caseSchema.parse(result.auditCase)) !==
      JSON.stringify(caseSchema.parse(current()))
    )
      throw new Error(
        "Save the current worksheet in Client cases before recording its review or correction.",
      );
    return result;
  };
  const displayDraft = () => {
    const panel = slot.querySelector("#learning-draft")!;
    if (!state.draft) {
      panel.replaceChildren();
      return;
    }
    const draft = state.draft;
    const rows = draft.wc.length
      ? draft.wc.map(({ row, sourceQuote }) => ({
          name: row.name,
          code: row.classCode,
          exposure: row.gross,
          adjustment:
            "Extra OT: " +
            row.overtimePremium +
            "; other exclusions: " +
            row.excludedPay,
          rate: row.rate,
          per: 100,
          start: row.start,
          end: row.end,
          sourceQuote,
        }))
      : draft.gl.map(({ row, sourceQuote }) => ({
          name: row.name,
          code: row.classCode,
          exposure: row.exposure,
          adjustment:
            "Exclusions: " +
            row.excluded +
            "; insured sub cost (not automatically excluded): " +
            row.insuredSubCost,
          rate: row.rate,
          per: row.per,
          start: row.start,
          end: row.end,
          sourceQuote,
        }));
    panel.innerHTML =
      "<h3>Unverified review draft</h3><p>" +
      esc(draft.summary) +
      "</p><p>Check every figure and question against your records. Staging fills the regular worksheet below, where you can make corrections; it does not verify anything.</p>" +
      (rows.length
        ? '<div class="table-wrap" tabindex="0" role="region" aria-label="Unverified extracted exposure"><table><caption>Proposed exposure rows · all require staff verification</caption><thead><tr><th>Operations / employee group</th><th>Class from document</th><th>Gross exposure</th><th>Proposed OT / exclusions</th><th>Rate</th><th>Rate basis</th><th>Dates · end exclusive</th></tr></thead><tbody>' +
          rows
            .map(
              (r) =>
                "<tr><td>" +
                esc(r.name) +
                "</td><td>" +
                esc(r.code) +
                "</td><td>" +
                esc(r.exposure) +
                "</td><td>" +
                esc(r.adjustment) +
                "</td><td>" +
                esc(r.rate ?? "Unknown") +
                "</td><td>per " +
                esc(r.per) +
                "</td><td>" +
                esc(r.start) +
                " → " +
                esc(r.end) +
                "</td></tr>",
            )
            .join("") +
          "</tbody></table></div>" +
          rows
            .map(
              (r) =>
                "<details><summary>Document quote for " +
                esc(r.name) +
                "</summary><blockquote>" +
                esc(r.sourceQuote) +
                "</blockquote></details>",
            )
            .join("")
        : "<p>No complete exposure rows could be extracted. Use the questions below and the manual worksheet.</p>") +
      "<h4>Draft questions and supporting records</h4>" +
      draft.findings
        .map(
          (f) =>
            '<article class="card flat"><strong>' +
            esc(f.title) +
            "</strong><p>" +
            esc(f.detail) +
            "</p><blockquote>" +
            esc(f.sourceQuote) +
            "</blockquote><p><strong>Check:</strong> " +
            esc(f.evidenceNeeded) +
            "</p></article>",
        )
        .join("") +
      '<details><summary>Advanced: inspect or edit the proposed import data</summary><p>Only edit this if needed. Document quotes must remain present in the original selected text. Rates, dates and imported exclusions are never verified automatically.</p><label class="field">Draft import JSON<textarea id="learning-draft-json" style="min-height:320px"></textarea></label></details><div class="spread"><button class="btn" id="learning-apply">Stage checked draft in worksheet</button><button class="btn" id="learning-record">Record before/after comparison snapshot</button></div><p class="inline-note">Staging replaces this line’s rows, mod periods, premium steps and draft findings, and clears verification. Review the full worksheet before using the estimate.</p>';
    input("learning-draft-json").value = JSON.stringify(state.draft, null, 2);
    slot.querySelector<HTMLElement>("#learning-apply")!.onclick = () =>
      void run(async () => {
        const draft = validateDraft(
          JSON.parse(input("learning-draft-json").value),
          state.reviewText,
          c.line,
        );
        if (
          !confirm(
            "Replace this coverage line with the draft? All imported verification will be cleared. Check the worksheet before using any estimate.",
          )
        )
          return;
        // Preserve the original response; edited/imported values belong in the corrected worksheet snapshot.
        changed(
          applyDraft(current(), draft),
          "AI draft staged. Every rate, exclusion, COI, exemption, mod and premium element requires human verification.",
        );
      });
    slot.querySelector<HTMLElement>("#learning-record")!.onclick = () =>
      void run(async () => {
        const saved = await savedCase();
        const r = await api("audit-runs", "POST", {
          caseId: c.id,
          caseRevision: saved.revision,
          provider: state.provider,
          model: state.model,
          inputHash: state.inputHash,
          draft: state.draft,
          lessons: state.usedLessons.map((l) => ({
            id: l.id,
            revision: l.revision,
          })),
        });
        state.runId = r.id;
        status(
          "Original draft and saved corrected worksheet recorded as an immutable comparison snapshot. No lesson was approved automatically.",
        );
      });
  };
  slot.querySelector<HTMLElement>("#learning-settings")!.onclick = openSettings;
  slot.querySelector<HTMLElement>("#learning-use-pdf")!.onclick = () => {
    if (!c.worksheetText.trim()) {
      status(
        "Read a PDF above first, or paste a redacted text excerpt. Scans need separate OCR.",
      );
      return;
    }
    state.text = c.worksheetText.slice(0, 60000);
    input("learning-text").value = state.text;
    status(
      c.worksheetText.length > 60000
        ? "The first 60,000 characters are selected. Choose the relevant excerpt before sending."
        : "Extracted text copied for your review. Nothing has been sent to an AI provider.",
    );
  };
  slot.querySelector<HTMLElement>("#learning-match")!.onclick = () =>
    void run(async () => {
      await match();
      status("Applicable approved corrections loaded. No AI request was made.");
    });
  slot.querySelector<HTMLElement>("#learning-review")!.onclick = () =>
    void run(async () => {
      const settings = currentAISettings();
      if (!settings.enabled)
        throw new Error(
          "AI is off. Configure your optional key and model in AI settings; manual review and correction memory remain available.",
        );
      if (!input("learning-sharing").checked)
        throw new Error(
          "Confirm authority to share the selected text and applicable corrections with your provider.",
        );
      const text = input("learning-text").value;
      if (!text.trim()) throw new Error("Select audit text first.");
      const button = slot.querySelector<HTMLButtonElement>("#learning-review")!;
      button.disabled = true;
      try {
        await match();
        if (!active()) return;
        status(
          "Drafting a source-quoted review using " +
            state.lessons.length +
            " applicable approved corrections…",
        );
        const sentLessons = structuredClone(state.lessons);
        const draft = await provider.review(
          text,
          c.line,
          sentLessons,
          settings,
        );
        state.text = text;
        state.reviewText = text;
        state.draft = draft;
        state.usedLessons = sentLessons;
        state.inputHash = await sha(text);
        state.model = settings.model;
        state.provider = settings.provider;
        state.runId = null;
        if (!active()) return;
        displayDraft();
        input("correction-original").value = draft.summary;
        status(
          "Draft ready. Check and correct it; nothing was applied, saved or approved automatically.",
        );
      } finally {
        if (active()) button.disabled = false;
      }
    });
  slot.querySelector<HTMLElement>("#learning-clear")!.onclick = () => {
    state.text = "";
    state.reviewText = "";
    state.draft = null;
    state.usedLessons = [];
    state.runId = null;
    input("learning-text").value = "";
    displayDraft();
    status(
      "Selected text and local draft cleared. Previously recorded backend snapshots remain until the source case/account is deleted.",
    );
  };
  let after: string | null = null,
    canApprove = false;
  const queue = async (append = false) => {
    const data = await api(
      "corrections" +
        (append && after ? "?after=" + encodeURIComponent(after) : ""),
    );
    if (!active()) return;
    canApprove = data.canApprove;
    after = data.next;
    const list = slot.querySelector("#correction-queue")!;
    if (!append) list.replaceChildren();
    for (const raw of data.lessons) {
      const lesson = lessonSchema.parse(raw),
        article = document.createElement("article");
      article.className = "card flat";
      article.innerHTML =
        "<h3>" +
        esc(lesson.payload.title) +
        ' <span class="badge">' +
        esc(lesson.status) +
        " · v" +
        lesson.revision +
        "</span></h3><p>" +
        esc(lesson.payload.correctedFinding) +
        '</p><p class="inline-note">' +
        esc(lesson.payload.sourceReference) +
        " · " +
        (lesson.synthetic ? "SYNTHETIC SOURCE" : "CLIENT SOURCE") +
        " · " +
        esc(lesson.payload.line.toUpperCase()) +
        '</p><details><summary>Edit correction (editing creates a draft revision)</summary><label class="field">Correction JSON<textarea class="lesson-json"></textarea></label><button class="btn lesson-edit">Save edited draft</button></details>' +
        (canApprove
          ? '<label class="check"><input class="lesson-source-checked" type="checkbox">I checked the cited source and its applicability, including dates and class scope.</label><label class="check"><input class="lesson-reuse" type="checkbox">I removed client identifiers and approve tenant reuse of this correction; this does not authorize sale or cross-tenant sharing.</label><div class="spread"><button class="btn lesson-approve">Approve for future reviews</button><button class="btn lesson-reject">Reject</button><button class="btn lesson-retire">Retire / withdraw from reuse</button></div>'
          : "<p>Tenant owner approval is required before reuse.</p>");
      article.querySelector<HTMLTextAreaElement>(".lesson-json")!.value =
        JSON.stringify(lesson.payload, null, 2);
      const patch = async (action: string, payload?: unknown) => {
        await api("corrections/" + lesson.id, "PATCH", {
          revision: lesson.revision,
          action,
          ...(payload ? { payload } : {}),
          sourceVerified:
            article.querySelector<HTMLInputElement>(".lesson-source-checked")
              ?.checked ?? false,
          reuseConfirmed:
            article.querySelector<HTMLInputElement>(".lesson-reuse")?.checked ??
            false,
        });
        await queue();
        status(
          "Correction " +
            action +
            " recorded. Future review requests reload current approval state.",
        );
      };
      article.querySelector<HTMLElement>(".lesson-edit")!.onclick = () =>
        void run(() =>
          patch(
            "edit",
            correctionSchema.parse(
              JSON.parse(
                article.querySelector<HTMLTextAreaElement>(".lesson-json")!
                  .value,
              ),
            ),
          ),
        );
      for (const action of ["approve", "reject", "retire"]) {
        const button = article.querySelector<HTMLElement>(".lesson-" + action);
        if (button) button.onclick = () => void run(() => patch(action));
      }
      list.append(article);
    }
    slot.querySelector<HTMLButtonElement>("#corrections-more")!.hidden = !after;
  };
  slot.querySelector<HTMLElement>("#corrections-refresh")!.onclick = () =>
    void run(() => queue());
  slot.querySelector<HTMLElement>("#corrections-more")!.onclick = () =>
    void run(() => queue(true));
  slot.querySelector<HTMLFormElement>("#correction-form")!.onsubmit = (
    event,
  ) => {
    event.preventDefault();
    void run(async () => {
      const saved = await savedCase(),
        payload = correctionSchema.parse({
          title: input("correction-title").value,
          topic: input("correction-topic").value,
          line: c.line,
          state: "FL",
          originalFinding: input("correction-original").value,
          correctedFinding: input("correction-corrected").value,
          sourceReference: input("correction-source").value,
          classCodes: input("correction-codes")
            .value.split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          effectiveFrom: input("correction-from").value,
          effectiveTo: input("correction-to").value,
        });
      await api("corrections", "POST", {
        caseId: c.id,
        caseRevision: saved.revision,
        runId: state.runId,
        payload,
      });
      await queue();
      status(
        "Correction saved as a draft. It will not influence later reviews until explicitly approved.",
      );
    });
  };
  slot.querySelector<HTMLElement>("#learning-history")!.onclick = () =>
    void run(async () => {
      const rows: { id: string; case_revision: number; created_at: number }[] =
        await api("audit-runs?caseId=" + c.id);
      const list = slot.querySelector("#learning-runs")!;
      list.replaceChildren();
      for (const row of rows) {
        const button = document.createElement("button");
        button.className = "btn";
        button.textContent =
          "Open review of case revision " +
          row.case_revision +
          " · " +
          new Date(row.created_at * 1000).toLocaleString();
        button.onclick = () =>
          void run(async () => {
            const snapshot = await api("audit-runs/" + row.id);
            slot.querySelector("#learning-snapshot")!.textContent =
              JSON.stringify(snapshot, null, 2);
            state.runId = row.id;
            status("Immutable original/corrected comparison loaded.");
          });
        list.append(button);
      }
      if (!rows.length)
        list.textContent = "No comparison snapshots recorded yet.";
    });
  displayDraft();
  if (state.lessons.length) displayMatches();
  void run(() => queue());
}
