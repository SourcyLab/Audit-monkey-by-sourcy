import { tenantHeaders, tenantId } from "./tenant-ui";
import { caseSchema, type AuditCase } from "./schema";
const revisions = new Map<string, number>();
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
async function api(
  path = "",
  method = "GET",
  body?: unknown,
  revision?: number,
) {
  const r = await fetch("/api/cases" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...tenantHeaders(),
      ...(revision ? { "If-Match": String(revision) } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Could not access saved cases");
  return result;
}
export function storagePanel() {
  return '<section class="card"><h2>Saved tenant cases</h2><p>Save the active case to your selected tenant. All its teammates can read and edit it. In local development, records stay on this computer. Save is explicit; unsaved edits remain in this browser.</p><div class="spread"><button class="btn primary" id="save-server-case">Save active case to backend</button><button class="btn" id="refresh-server-cases">Refresh saved cases</button></div><p id="case-storage-status" role="status"></p><div id="saved-case-list"></div></section>';
}
export function mountCaseStorage(
  root: HTMLElement,
  current: () => AuditCase,
  loaded: (c: AuditCase) => void,
) {
  const status = root.querySelector<HTMLElement>("#case-storage-status");
  if (!status) return;
  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      status.textContent =
        err instanceof Error ? err.message : "Storage request failed";
    }
  };
  const refresh = async () => {
    const rows: {
      id: string;
      name: string;
      revision: number;
      updated_at: number;
      updated_by: string;
      owned: boolean;
      line: string;
    }[] = [];
    let after: string | null = null;
    do {
      const result = await api(
        after ? "?after=" + encodeURIComponent(after) : "",
      );
      rows.push(...result.cases);
      after = result.next;
    } while (after && rows.length < 1000);
    const list = root.querySelector<HTMLElement>("#saved-case-list")!;
    list.innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              '<article class="card flat"><h3>' +
              esc(r.name) +
              "</h3><p>" +
              esc(r.line.toUpperCase()) +
              " · revision " +
              r.revision +
              " · " +
              esc(new Date(r.updated_at * 1000).toLocaleString()) +
              " · saved by " +
              esc(r.updated_by) +
              '</p><div class="spread"><button class="btn" data-load-saved="' +
              esc(r.id) +
              '">Load saved case</button>' +
              (r.owned
                ? '<button class="btn danger" data-delete-saved="' +
                  esc(r.id) +
                  '" data-revision="' +
                  r.revision +
                  '">Delete saved copy</button>'
                : '<span class="badge">SHARED WITH YOU</span>') +
              "</div></article>",
          )
          .join("")
      : "<p>No saved cases yet. Save your active case above.</p>";
    list.querySelectorAll<HTMLElement>("[data-load-saved]").forEach(
      (b) =>
        (b.onclick = () =>
          void run(async () => {
            if (
              !confirm(
                "Load this saved case? Export or save any unsaved local edits first. The saved copy replaces the matching case in your browser.",
              )
            )
              return;
            const result = await api("/" + b.dataset.loadSaved),
              c = caseSchema.parse(result.auditCase);
            revisions.set(tenantId() + ":" + c.id, result.revision);
            loaded(c);
          })),
    );
    list.querySelectorAll<HTMLElement>("[data-delete-saved]").forEach(
      (b) =>
        (b.onclick = () =>
          void run(async () => {
            if (
              !confirm(
                "Delete the backend copy and all collaborator access? Local browser and exported copies remain.",
              )
            )
              return;
            await api(
              "/" + b.dataset.deleteSaved,
              "DELETE",
              undefined,
              Number(b.dataset.revision),
            );
            revisions.delete(tenantId() + ":" + b.dataset.deleteSaved!);
            await refresh();
            status.textContent =
              "Saved copy deleted. Local and exported copies remain.";
          })),
    );
  };
  root.querySelector<HTMLElement>("#save-server-case")!.onclick = () =>
    void run(async () => {
      const c = caseSchema.parse(current());
      const result = await api("/" + encodeURIComponent(c.id), "PUT", {
        auditCase: c,
        revision: revisions.get(tenantId() + ":" + c.id) ?? 0,
      });
      revisions.set(tenantId() + ":" + c.id, result.revision);
      await refresh();
      status.textContent =
        "Case saved to backend · revision " +
        result.revision +
        ". Subsequent edits need another Save.";
    });
  root.querySelector<HTMLElement>("#refresh-server-cases")!.onclick = () =>
    void run(refresh);
  void run(refresh);
}
