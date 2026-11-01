import { z } from "zod";
import { caseSchema } from "../app/src/schema";
import { json, type Tenant, type User } from "./tenants";
export async function caseAPI(
  req: Request,
  db: D1Database,
  user: User,
  tenant: Tenant,
  read: () => Promise<unknown>,
): Promise<Response> {
  const url = new URL(req.url),
    parts = url.pathname.split("/");
  if (parts.length === 3 && req.method === "GET") {
    const after = url.searchParams.get("after") || "";
    const rows = await db
      .prepare(
        "SELECT id,revision,updated_at,updated_by,json_extract(payload,'$.name') AS name,json_extract(payload,'$.line') AS line,json_extract(payload,'$.workflow.stage') AS stage FROM audit_cases WHERE tenant_id=? AND id>? ORDER BY id LIMIT 100",
      )
      .bind(tenant.id, after)
      .all();
    return json({
      cases: rows.results.map((row) => ({
        ...row,
        owned: tenant.role === "owner",
      })),
      next: rows.results.length === 100 ? rows.results.at(-1)!.id : null,
    });
  }
  const id = z.string().uuid().parse(parts[3]);
  if (parts.length !== 4) return json({ error: "Not found" }, 404);
  const row = await db
    .prepare("SELECT * FROM audit_cases WHERE id=? AND tenant_id=?")
    .bind(id, tenant.id)
    .first<{
      payload: string;
      revision: number;
      updated_at: number;
      updated_by: string;
    }>();
  if (req.method === "GET")
    return row
      ? json({
          auditCase: JSON.parse(row.payload),
          revision: row.revision,
          updatedAt: row.updated_at,
          updatedBy: row.updated_by,
          owned: tenant.role === "owner",
        })
      : json({ error: "Not found" }, 404);
  if (req.method === "PUT") {
    const input = z
      .object({ auditCase: caseSchema, revision: z.number().int().min(0) })
      .strict()
      .parse(await read());
    if (input.auditCase.id !== id)
      return json({ error: "Case ID mismatch" }, 400);
    const payload = JSON.stringify(input.auditCase),
      stamp = Math.floor(Date.now() / 1000);
    const saved =
      input.revision === 0
        ? await db
            .prepare(
              "INSERT INTO audit_cases(id,owner_id,payload,revision,updated_at,updated_by,tenant_id,export_eligible) VALUES(?,?,?,1,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING revision",
            )
            .bind(
              id,
              tenant.owner_id,
              payload,
              stamp,
              user.email,
              tenant.id,
              tenant.sale_allowed === 1
                ? ((
                    await db
                      .prepare(
                        "SELECT training+2*sale AS eligible FROM consent_events WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
                      )
                      .bind(tenant.owner_id)
                      .first<{ eligible: number }>()
                  )?.eligible ?? 0)
                : 0,
            )
            .first()
        : await db
            .prepare(
              "UPDATE audit_cases SET payload=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=? AND tenant_id=? RETURNING revision",
            )
            .bind(payload, stamp, user.email, id, input.revision, tenant.id)
            .first();
    return saved
      ? json(saved)
      : json(
          {
            error:
              "Case changed or is unavailable. Export your local draft, then refresh and load the saved case. No saved data was overwritten.",
          },
          409,
        );
  }
  if (req.method === "DELETE") {
    if (tenant.role !== "owner")
      return json({ error: "Tenant owner access required" }, 403);
    const revision = z.coerce
      .number()
      .int()
      .positive()
      .parse(req.headers.get("If-Match"));
    const deleted = await db
      .prepare(
        "DELETE FROM audit_cases WHERE id=? AND tenant_id=? AND revision=? RETURNING id",
      )
      .bind(id, tenant.id, revision)
      .first();
    return deleted
      ? json({ deleted: true })
      : json(
          { error: "Case changed or is unavailable; refresh before deleting" },
          409,
        );
  }
  return json({ error: "Method not allowed" }, 405);
}
