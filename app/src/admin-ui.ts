const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
async function admin(path: string, method = "GET", body?: unknown) {
  const response = await fetch("/api/admin/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Admin request failed");
  return result;
}
export function adminPanel() {
  return '<section class="card" id="sourcy-admin" hidden><h2>Sourcy administration</h2><p>Privileged actions are logged with a reason. Tenant data stays isolated; this panel does not expose client documents or contact lists. Subscriptions are verified manually during the pilot. No payments are charged here.</p><button class="btn" id="admin-list">Load tenants</button><button class="btn" id="admin-more" hidden>More tenants</button><div id="admin-tenants"></div><form id="admin-entitlement"><div class="fields"><label class="field">Tenant ID<input id="admin-tenant-id" required></label><label class="field">State<select id="admin-state"><option value="active">active</option><option value="suspended">suspended</option></select></label><label class="field">Paid through (leave blank for free)<input id="admin-paid" type="date"></label><label class="field">Paid storage allowance (GB)<input id="admin-quota" type="number" value="50" min="50" max="1000000" step="1" required></label><label class="field">Verified subscription / invoice reference<input id="admin-reference" maxlength="500"></label><label class="field">Reason<input id="admin-reason" minlength="8" maxlength="500" required></label></div><button class="btn" type="submit">Update entitlement / state</button></form><h3>Verified monthly costs</h3><p>Record storage, infrastructure and Sourcy-paid LLM costs separately from real invoices or metering. Quoted price is twice their sum. BYOK costs paid by a user are excluded. Entries are additive; use unique source references.</p><form id="admin-cost-form"><div class="fields"><label class="field">Billing month<input id="admin-cost-month" type="month" required></label><label class="field">Cost category<select id="admin-cost-category"><option>storage</option><option>infrastructure</option><option>llm</option><option>other</option></select></label><label class="field">Verified cost in USD cents<input id="admin-cost-cents" type="number" min="0" max="1000000000" step="1" required></label></div><p>Uses the Tenant ID, source reference and reason above.</p><button class="btn" type="submit">Record cost & calculate 2× quote</button></form><h3>Restricted aggregate exports</h3><p>Only latest human-verified outcomes with prospective and current consent are eligible. Each feature group needs ten distinct consenting tenants. Counts are rounded down to tens. No identifiers, contacts, exact financials, documents or free text. Sparse pilot data will normally produce an empty export. Independent privacy review is still required before third-party release.</p><div class="spread"><button class="btn" id="admin-training">Download training aggregate</button><button class="btn" id="admin-export">Download sale aggregate</button><button class="btn" id="admin-events">View recent admin events</button></div><pre id="admin-result" tabindex="0"></pre><p id="admin-status" role="status"></p></section>';
}
export function mountAdmin(root: HTMLElement) {
  const panel = root.querySelector<HTMLElement>("#sourcy-admin");
  if (!panel) return;
  const status = root.querySelector<HTMLElement>("#admin-status")!;
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      status.textContent =
        e instanceof Error ? e.message : "Admin request failed";
    }
  };
  const val = (id: string) =>
    root.querySelector<HTMLInputElement>("#admin-" + id)!.value;
  let after: string | null = null;
  const list = async (append = false) => {
    const result = await admin(
      "tenants" +
        (append && after ? "?after=" + encodeURIComponent(after) : ""),
    );
    after = result.next;
    if (!append) root.querySelector("#admin-tenants")!.innerHTML = "";
    root
      .querySelector("#admin-tenants")!
      .insertAdjacentHTML(
        "beforeend",
        result.tenants
          .map(
            (t: {
              id: string;
              name: string;
              used_bytes: number;
              status: string;
              quote_cents: number | null;
            }) =>
              "<p><strong>" +
              esc(t.name) +
              "</strong> · " +
              esc(t.id) +
              " · " +
              esc(t.status) +
              " · " +
              (t.used_bytes / 1e9).toFixed(3) +
              " GB · " +
              (t.quote_cents === null
                ? "quote pending"
                : "quote $" + (t.quote_cents / 100).toFixed(2)) +
              "</p>",
          )
          .join(""),
      );
    root.querySelector<HTMLButtonElement>("#admin-more")!.hidden = !after;
  };
  root.querySelector<HTMLElement>("#admin-list")!.onclick = () =>
    void run(() => list());
  root.querySelector<HTMLElement>("#admin-more")!.onclick = () =>
    void run(() => list(true));
  root.querySelector<HTMLFormElement>("#admin-entitlement")!.onsubmit = (e) => {
    e.preventDefault();
    void run(async () => {
      await admin("tenant", "PATCH", {
        tenantId: val("tenant-id"),
        status: val("state"),
        paidUntil: val("paid")
          ? Date.parse(val("paid") + "T23:59:59Z") / 1000
          : 0,
        quotaBytes: Number(val("quota")) * 1e9,
        billingReference: val("reference"),
        reason: val("reason"),
      });
      status.textContent = "Entitlement updated. No payment was charged.";
      await list();
    });
  };
  root.querySelector<HTMLFormElement>("#admin-cost-form")!.onsubmit = (e) => {
    e.preventDefault();
    void run(async () => {
      const result = await admin("costs", "POST", {
        tenantId: val("tenant-id"),
        period: val("cost-month"),
        category: val("cost-category"),
        amountCents: Number(val("cost-cents")),
        reference: val("reference"),
        reason: val("reason"),
      });
      root.querySelector("#admin-result")!.textContent = JSON.stringify(
        result,
        null,
        2,
      );
      status.textContent = "Verified cost recorded; 2× quote calculated.";
    });
  };
  for (const purpose of ["training", "export"])
    root.querySelector<HTMLElement>("#admin-" + purpose)!.onclick = () =>
      void run(async () => {
        if (val("reason").trim().length < 8)
          throw new Error(
            "Enter an export reason of at least 8 characters above",
          );
        const result = await admin(purpose, "POST", { reason: val("reason") }),
          url = URL.createObjectURL(
            new Blob([JSON.stringify(result, null, 2)], {
              type: "application/json",
            }),
          ),
          a = document.createElement("a");
        a.href = url;
        a.download = "audit-monkey-" + purpose + "-aggregate.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        root.querySelector("#admin-result")!.textContent = JSON.stringify(
          result,
          null,
          2,
        );
        status.textContent = "Restricted aggregate exported and action logged.";
      });
  root.querySelector<HTMLElement>("#admin-events")!.onclick = () =>
    void run(async () => {
      root.querySelector("#admin-result")!.textContent = JSON.stringify(
        await admin("events"),
        null,
        2,
      );
    });
  void fetch("/api/session")
    .then((r) => r.json())
    .then((s) => {
      panel.hidden = !s.sourcyAdmin;
    })
    .catch(() => {
      panel.hidden = true;
    });
}
