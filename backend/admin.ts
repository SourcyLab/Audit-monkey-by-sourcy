import { z } from "zod";
import { json, type User } from "./tenants";
const stamp = () => Math.floor(Date.now() / 1000);
export function sourcyAdmin(email: string, allowlist: string): boolean {
  return allowlist
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
export async function adminAPI(
  req: Request,
  db: D1Database,
  user: User,
  allowlist: string,
  read: () => Promise<unknown>,
) {
  if (!sourcyAdmin(user.email, allowlist))
    return json({ error: "Sourcy admin access required" }, 403);
  const url = new URL(req.url),
    part = url.pathname.split("/")[3];
  const record = (action: string, tenant: string, reason: string) =>
    db
      .prepare("INSERT INTO admin_events VALUES(?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), user.email, action, tenant, reason, stamp());
  if (part === "tenants" && req.method === "GET") {
    const after = url.searchParams.get("after") || "";
    const rows = await db
      .prepare(
        "SELECT id,name,status,used_bytes,quota_bytes,paid_until,cost_cents,quote_cents,quote_period,sale_allowed FROM tenants WHERE id>? ORDER BY id LIMIT 100",
      )
      .bind(after)
      .all();
    await record("list-tenants", "*", "Administrative supervision").run();
    return json({
      tenants: rows.results,
      next: rows.results.length === 100 ? rows.results.at(-1)!.id : null,
    });
  }
  if (part === "tenant" && req.method === "PATCH") {
    const input = z
      .object({
        tenantId: z.string().uuid(),
        status: z.enum(["active", "suspended"]),
        paidUntil: z.number().int().min(0),
        quotaBytes: z.number().int().min(50_000_000_000).max(1e15),
        billingReference: z.string().trim().max(500),
        reason: z.string().trim().min(8).max(500),
      })
      .strict()
      .parse(await read());
    if (input.paidUntil > stamp() && !input.billingReference)
      return json(
        {
          error:
            "Paid entitlement requires a verified subscription/invoice reference",
        },
        400,
      );
    const result = await db.batch([
      db
        .prepare(
          "UPDATE tenants SET status=?,paid_until=?,quota_bytes=?,billing_reference=? WHERE id=?",
        )
        .bind(
          input.status,
          input.paidUntil,
          input.quotaBytes,
          input.billingReference,
          input.tenantId,
        ),
      record("set-entitlement", input.tenantId, input.reason),
    ]);
    return result[0].meta.changes
      ? json({ saved: true })
      : json({ error: "Tenant not found" }, 404);
  }
  if (part === "costs" && req.method === "POST") {
    const input = z
      .object({
        tenantId: z.string().uuid(),
        period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
        category: z.enum(["storage", "infrastructure", "llm", "other"]),
        amountCents: z.number().int().min(0).max(1e9),
        reference: z.string().trim().min(3).max(500),
        reason: z.string().trim().min(8).max(500),
      })
      .strict()
      .parse(await read());
    const tenant = await db
      .prepare("SELECT id FROM tenants WHERE id=?")
      .bind(input.tenantId)
      .first();
    if (!tenant) return json({ error: "Tenant not found" }, 404);
    const result = await db.batch([
      db
        .prepare("INSERT INTO tenant_costs VALUES(?,?,?,?,?,?,?)")
        .bind(
          crypto.randomUUID(),
          input.tenantId,
          input.period,
          input.category,
          input.amountCents,
          input.reference,
          stamp(),
        ),
      db
        .prepare(
          "UPDATE tenants SET cost_cents=(SELECT SUM(amount_cents) FROM tenant_costs WHERE tenant_id=? AND period=?),quote_cents=2*(SELECT SUM(amount_cents) FROM tenant_costs WHERE tenant_id=? AND period=?),quote_period=? WHERE id=?",
        )
        .bind(
          input.tenantId,
          input.period,
          input.tenantId,
          input.period,
          input.period,
          input.tenantId,
        ),
      record("record-verified-cost", input.tenantId, input.reason),
      db
        .prepare(
          "SELECT SUM(amount_cents) AS costCents,2*SUM(amount_cents) AS priceCents FROM tenant_costs WHERE tenant_id=? AND period=?",
        )
        .bind(input.tenantId, input.period),
    ]);
    return json({
      period: input.period,
      ...z
        .object({ costCents: z.number(), priceCents: z.number() })
        .parse(result[3].results[0]),
      note: "Recorded cost basis only. No payment charged; taxes/fees and unrecorded costs are not included.",
    });
  }
  if ((part === "export" || part === "training") && req.method === "POST") {
    const input = z
      .object({ reason: z.string().trim().min(8).max(500) })
      .strict()
      .parse(await read());
    // Fixed aggregate fields only. Never export identifiers, contacts, text, documents, exact financials or rates.
    const purpose = part === "training" ? "training" : "sale";
    const query =
      "SELECT json_extract(l.features,'$.coverage') AS coverage,json_extract(l.features,'$.rowBand') AS rowBand,json_extract(l.features,'$.reviewCategory') AS category,json_extract(l.features,'$.outcome') AS outcome,COUNT(*) AS samples,COUNT(DISTINCT t.id) AS tenants FROM learning_events l JOIN tenants t ON t.id=l.tenant_id WHERE t.status='active' AND t.sale_allowed=1 AND l.human_verified=1 AND l." +
      purpose +
      "_eligible=1 AND l.revision=(SELECT MAX(revision) FROM learning_events WHERE case_id=l.case_id) AND (SELECT " +
      purpose +
      " FROM consent_events WHERE user_id=t.owner_id ORDER BY created_at DESC,rowid DESC LIMIT 1)=1 GROUP BY coverage,rowBand,category,outcome HAVING COUNT(DISTINCT t.id)>=10";
    const groups = await db.prepare(query).all<{
      coverage: string;
      rowBand: string;
      category: string;
      outcome: string;
      samples: number;
      tenants: number;
    }>();
    const aggregates = groups.results.map((r) => ({
      coverage: r.coverage,
      rowBand: r.rowBand,
      reviewCategory: r.category,
      outcome: r.outcome,
      sampleCountAtLeast: Math.floor(r.samples / 10) * 10,
      tenantCountAtLeast: Math.floor(r.tenants / 10) * 10,
    }));
    await record("export-" + purpose + "-aggregates", "*", input.reason).run();
    return json({
      schema: "audit-monkey-learning-aggregate-v1",
      purpose,
      aggregates,
      suppression:
        "Only latest human-verified outcomes with prospective and current permissions. Fewer than 10 distinct consenting tenants per feature group is suppressed; counts rounded down to tens. No identifiers, contacts, financial values, rates, documents, free text or dates. This is not a legal anonymization determination.",
    });
  }
  if (part === "events" && req.method === "GET") {
    const after = url.searchParams.get("after") || "";
    return json(
      (
        await db
          .prepare(
            "SELECT id,actor,action,tenant_id,reason,created_at FROM admin_events WHERE id>? ORDER BY id LIMIT 100",
          )
          .bind(after)
          .all()
      ).results,
    );
  }
  return json({ error: "Not found" }, 404);
}
