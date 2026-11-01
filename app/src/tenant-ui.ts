let activeTenant = "";
export const tenantHeaders = (): Record<string, string> =>
  activeTenant ? { "X-Tenant-ID": activeTenant } : {};
export const tenantId = () => activeTenant;
export function selectTenant(id: string) {
  activeTenant = id;
}
export async function tenantRequest(path = "", method = "GET", body?: unknown) {
  const r = await fetch("/api/tenants" + path, {
    method,
    headers: { "Content-Type": "application/json", ...tenantHeaders() },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || "Tenant request failed");
  return value;
}
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
export function tenantPanel() {
  return '<section class="card"><h2>Tenant workspace</h2><label class="field">Active tenant<select id="tenant-select"></select></label><p id="tenant-usage"></p><button class="btn" id="tenant-refresh">Refresh usage</button><details><summary>Tenant owner settings & teammates</summary><p>Teammates can read and edit all cases and list all documents in this tenant. There is no teammate count limit. Invite by email; they sign in using that email. No invitation email is sent.</p><label class="field">Workspace name<input id="tenant-name" maxlength="120"></label><label class="check"><input id="tenant-sale" type="checkbox">Allow prospective eligible training/sale aggregate exports (each also requires the owner’s separate consent)</label><label class="check"><input id="tenant-authority" type="checkbox">I confirm authority for this tenant’s eligible records</label><button class="btn" id="tenant-save" disabled>Save tenant settings</button><label class="field">Teammate email<input id="case-member-email" type="email" maxlength="254"></label><div class="spread"><button class="btn" id="invite-case-member" disabled>Grant tenant access</button><button class="btn" id="revoke-case-member" disabled>Revoke tenant access</button><button class="btn" id="list-case-members" disabled>Show teammates</button><button class="btn" id="more-members" hidden>More teammates</button></div><p id="case-member-list"></p></details><p id="tenant-status" role="status"></p></section>';
}
export async function initTenant(userId: string) {
  const rows: { id: string }[] = await tenantRequest();
  activeTenant = rows.some((x) => x.id === userId) ? userId : rows[0]?.id || "";
}
export function mountTenant(root: HTMLElement, changed: () => void) {
  const select = root.querySelector<HTMLSelectElement>("#tenant-select");
  if (!select) return;
  const status = root.querySelector<HTMLElement>("#tenant-status")!;
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      status.textContent =
        e instanceof Error ? e.message : "Tenant request failed";
    }
  };
  let after: string | null = null,
    members: string[] = [];
  const load = async () => {
    const rows: {
      id: string;
      name: string;
      used_bytes: number;
      paid_until: number;
      quota_bytes: number;
      cost_cents: number | null;
      quote_cents: number | null;
      sale_allowed: number;
      role: string;
      status: string;
    }[] = await tenantRequest();
    select.innerHTML = rows
      .map(
        (r) =>
          '<option value="' +
          esc(r.id) +
          '" ' +
          (r.id === activeTenant ? "selected" : "") +
          ">" +
          esc(r.name) +
          (r.status === "active" ? "" : " (suspended)") +
          "</option>",
      )
      .join("");
    const current = rows.find((r) => r.id === activeTenant);
    if (!current) return;
    const paid = current.paid_until > Date.now() / 1000;
    root.querySelector("#tenant-usage")!.textContent =
      (current.used_bytes / 1e9).toFixed(3) +
      " GB used · " +
      (paid ? current.quota_bytes / 1e9 : 50) +
      " GB allowance · " +
      (paid
        ? "paid through " +
          new Date(current.paid_until * 1000).toLocaleDateString()
        : "free tier; paid subscription required for storage beyond 50 GB. Contact Team@sourcyinc.com") +
      (current.quote_cents === null
        ? " · pricing awaits verified cost entries"
        : " · last recorded cost-based quote: $" +
          (current.quote_cents / 100).toFixed(2) +
          " (2× recorded costs; confirm billing period)");
    root.querySelector<HTMLInputElement>("#tenant-name")!.value = current.name;
    root.querySelector<HTMLInputElement>("#tenant-sale")!.checked =
      !!current.sale_allowed;
    root
      .querySelectorAll<HTMLButtonElement>(
        "#tenant-save,#invite-case-member,#revoke-case-member,#list-case-members",
      )
      .forEach((b) => (b.disabled = current.role !== "owner"));
  };
  select.onchange = () => {
    selectTenant(select.value);
    changed();
  };
  root.querySelector<HTMLElement>("#tenant-refresh")!.onclick = () =>
    void run(load);
  root.querySelector<HTMLElement>("#tenant-save")!.onclick = () =>
    void run(async () => {
      await tenantRequest("", "PATCH", {
        name: root.querySelector<HTMLInputElement>("#tenant-name")!.value,
        saleAllowed:
          root.querySelector<HTMLInputElement>("#tenant-sale")!.checked,
        authorityConfirmed:
          root.querySelector<HTMLInputElement>("#tenant-authority")!.checked,
      });
      status.textContent =
        "Tenant settings saved. Existing cases were not retroactively made export eligible.";
      await load();
    });
  const listMembers = async (append = false) => {
    const result: {
      members: { email: string; role: string }[];
      next: string | null;
    } = await tenantRequest(
      "/members" +
        (append && after ? "?after=" + encodeURIComponent(after) : ""),
    );
    if (!append) members = [];
    members.push(...result.members.map((m) => m.email + " (" + m.role + ")"));
    after = result.next;
    root.querySelector("#case-member-list")!.textContent = members.join(", ");
    root.querySelector<HTMLButtonElement>("#more-members")!.hidden = !after;
  };
  for (const [id, method] of [
    ["invite-case-member", "POST"],
    ["revoke-case-member", "DELETE"],
    ["list-case-members", "GET"],
  ])
    root.querySelector<HTMLElement>("#" + id)!.onclick = () =>
      void run(async () => {
        const email =
          root.querySelector<HTMLInputElement>("#case-member-email")!;
        if (method !== "GET" && (!email.value || !email.reportValidity()))
          return;
        if (method !== "GET")
          await tenantRequest("/members", method, {
            email: email.value.trim(),
          });
        await listMembers();
        status.textContent =
          method === "GET" ? "Team list loaded." : "Tenant access updated.";
      });
  root.querySelector<HTMLElement>("#more-members")!.onclick = () =>
    void run(() => listMembers(true));
  void run(load);
}
