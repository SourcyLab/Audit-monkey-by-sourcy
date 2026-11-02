import { z } from "zod";
export type User = { id: string; email: string };
export type Tenant = {
  id: string;
  name: string;
  owner_id: string;
  status: string;
  used_bytes: number;
  quota_bytes: number;
  paid_until: number;
  sale_allowed: number;
  role: string;
};
export const FREE_BYTES = 50_000_000_000;
export const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function ensureTenant(db: D1Database, user: User) {
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO tenants(id,name,owner_id,created_at) VALUES(?,'My audit workspace',?,unixepoch())",
      )
      .bind(user.id, user.id),
    db
      .prepare("INSERT OR IGNORE INTO tenant_members VALUES(?,?,'owner')")
      .bind(user.id, user.email),
  ]);
}
export async function tenantFor(
  req: Request,
  db: D1Database,
  user: User,
): Promise<Tenant> {
  const id = req.headers.get("X-Tenant-ID") || user.id;
  const tenant = await db
    .prepare(
      "SELECT tenants.*,tenant_members.role FROM tenants JOIN tenant_members ON tenants.id=tenant_members.tenant_id WHERE tenants.id=? AND tenant_members.email=?",
    )
    .bind(id, user.email)
    .first<Tenant>();
  if (!tenant) throw new Error("Tenant access denied");
  if (tenant.status !== "active") throw new Error("Tenant suspended");
  return tenant;
}
export async function tenantAPI(
  req: Request,
  db: D1Database,
  user: User,
  read: () => Promise<unknown>,
) {
  const url = new URL(req.url),
    tail = url.pathname.split("/").slice(3);
  if (!tail.length && req.method === "GET")
    return json(
      (
        await db
          .prepare(
            "SELECT tenants.id,name,status,used_bytes,quota_bytes,paid_until,cost_cents,quote_cents,quote_period,sale_allowed,role FROM tenants JOIN tenant_members ON tenants.id=tenant_members.tenant_id WHERE email=? ORDER BY tenants.created_at,id",
          )
          .bind(user.email)
          .all()
      ).results,
    );
  const tenant = await tenantFor(req, db, user);
  if (tenant.role !== "owner")
    return json({ error: "Tenant owner access required" }, 403);
  if (tail[0] === "members") {
    if (req.method === "GET") {
      const after = url.searchParams.get("after") || "";
      const rows = await db
        .prepare(
          "SELECT email,role FROM tenant_members WHERE tenant_id=? AND email>? ORDER BY email LIMIT 100",
        )
        .bind(tenant.id, after)
        .all<{ email: string; role: string }>();
      return json({
        members: rows.results,
        next: rows.results.length === 100 ? rows.results.at(-1)!.email : null,
      });
    }
    if (["POST", "DELETE"].includes(req.method)) {
      const input = z
        .object({
          email: z
            .email()
            .max(254)
            .transform((x) => x.toLowerCase()),
        })
        .strict()
        .parse(await read());
      if (req.method === "POST")
        await db
          .prepare("INSERT OR IGNORE INTO tenant_members VALUES(?,?,'member')")
          .bind(tenant.id, input.email)
          .run();
      else {
        if (input.email === user.email)
          return json(
            { error: "Owner cannot remove their own membership" },
            400,
          );
        await db
          .prepare(
            "DELETE FROM tenant_members WHERE tenant_id=? AND email=? AND role='member'",
          )
          .bind(tenant.id, input.email)
          .run();
      }
      return json({ saved: true });
    }
  }
  if (!tail.length && req.method === "PATCH") {
    const input = z
      .object({
        name: z.string().trim().min(1).max(120),
        saleAllowed: z.boolean(),
        authorityConfirmed: z.boolean(),
      })
      .strict()
      .parse(await read());
    if (input.saleAllowed && !input.authorityConfirmed)
      return json(
        { error: "Confirm authority before enabling aggregate export" },
        400,
      );
    await db
      .prepare("UPDATE tenants SET name=?,sale_allowed=? WHERE id=?")
      .bind(input.name, Number(input.saleAllowed), tenant.id)
      .run();
    return json({ saved: true });
  }
  return json({ error: "Not found" }, 404);
}
