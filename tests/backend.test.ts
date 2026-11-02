import { sampleCase } from "../app/src/cases";
import { beforeAll, afterAll, it, expect } from "vitest";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
const base = "http://localhost:8787";
const mf = new Miniflare({
  modules: true,
  scriptPath: "backend/build/worker.js",
  compatibilityDate: "2026-07-28",
  compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
  d1Databases: ["DB"],
  r2Buckets: ["UPLOADS"],
  kvNamespaces: ["OAUTH_KV"],
  bindings: {
    PUBLIC_ORIGIN: base,
    APP_ORIGIN: "http://localhost:5173",
    LOCAL_DEV: "true",
    PRIVACY_EMAIL: "Team@sourcyinc.com",
    MAIL_FROM: "Sourcy Inc <Team@sourcyinc.com>",
    AUTH_SECRET: "fictional-test-secret-not-for-production-12345",
    RESEND_API_KEY: "local-test-key",
    SOURCY_ADMIN_EMAILS:
      "pilot-admin@example.test,cost-admin@example.test,export-admin@example.test",
  },
});
const req = (
  path: string,
  method = "GET",
  body?: unknown,
  cookie = "",
  headers: Record<string, string> = {},
) =>
  mf.dispatchFetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: base,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
const cookies = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
const registration = (email: string) => ({
  email,
  phone: "+12025550123",
  termsAccepted: true,
  termsVersion: "2026-11-01-v4",
  aiTrainingConsent: false,
  thirdPartyTrainingSaleConsent: false,
});
async function login(email: string) {
  const start = await req("/api/auth/start", "POST", registration(email));
  expect(start.status).toBe(202);
  const challenge = (await start.json()) as {
    challengeId: string;
    developmentCode: string;
  };
  const verify = await req("/api/auth/verify", "POST", {
    challengeId: challenge.challengeId,
    code: challenge.developmentCode,
  });
  expect(verify.status).toBe(200);
  const identity = (await verify.json()) as { userId: string };
  return {
    cookie: cookies(verify as unknown as Response),
    challenge,
    userId: identity.userId,
  };
}
beforeAll(async () => {
  const db = await mf.getD1Database("DB");
  await db.exec(await readFile("backend/migrations/0001_accounts.sql", "utf8"));
  await db.exec(await readFile("backend/migrations/0002_cases.sql", "utf8"));
  for (const name of [
    "0003_tenants.sql",
    "0004_costs.sql",
    "0005_learning.sql",
    "0006_billing_sources.sql",
    "0007_review_memory.sql",
  ])
    await db.exec(await readFile("backend/migrations/" + name, "utf8"));
});
afterAll(() => mf.dispose());
it("requires verified email, phone and explicit current terms; legacy acknowledgments cannot bypass", async () => {
  expect((await req("/api/session")).status).toBe(401);
  expect(
    (
      await req("/api/auth/start", "POST", {
        ...registration("invalid@example.test"),
        phone: "",
        termsAccepted: false,
      })
    ).status,
  ).toBe(400);
  const { cookie, challenge } = await login("signup@example.test");
  const state = (await (
    await req("/api/session", "GET", undefined, cookie)
  ).json()) as {
    registered: boolean;
    consents: { training: number; sale: number };
  };
  expect(state.registered).toBe(true);
  expect(state.consents).toMatchObject({ training: 0, sale: 0 });
  expect(
    (
      await req("/api/auth/verify", "POST", {
        challengeId: challenge.challengeId,
        code: challenge.developmentCode,
      })
    ).status,
  ).toBe(401);
});
it("isolates private uploads, records explicit consent changes and deletes active files/account", async () => {
  const a = await login("owner@example.test"),
    b = await login("other@example.test");
  expect(
    (
      await req("/api/uploads", "POST", "fictional", a.cookie, {
        "X-File-Name": "fixture.txt",
      })
    ).status,
  ).toBe(400);
  const upload = await req("/api/uploads", "POST", "fictional", a.cookie, {
    "X-File-Name": "fixture.txt",
    "X-Upload-Authority": "confirmed",
  });
  expect(upload.status).toBe(201);
  const item = (await upload.json()) as { id: string };
  expect(
    (await req("/api/uploads/" + item.id, "DELETE", undefined, b.cookie))
      .status,
  ).toBe(404);
  expect(
    await (await req("/api/uploads", "GET", undefined, b.cookie)).json(),
  ).toEqual([]);
  expect(
    (
      await req(
        "/api/privacy",
        "PATCH",
        { training: true, sale: true },
        a.cookie,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await req(
        "/api/privacy",
        "PATCH",
        { training: false, sale: false },
        a.cookie,
      )
    ).status,
  ).toBe(200);
  expect(
    (await req("/api/account", "DELETE", undefined, a.cookie)).status,
  ).toBe(200);
  expect((await req("/api/session", "GET", undefined, a.cookie)).status).toBe(
    401,
  );
  expect((await (await mf.getR2Bucket("UPLOADS")).list()).objects).toHaveLength(
    0,
  );
});
it("rejects cross-origin writes and code brute force", async () => {
  expect(
    (
      await req(
        "/api/auth/start",
        "POST",
        registration("csrf@example.test"),
        "",
        { Origin: "https://evil.example" },
      )
    ).status,
  ).toBe(403);
  const start = (await (
    await req("/api/auth/start", "POST", registration("attempts@example.test"))
  ).json()) as { challengeId: string; developmentCode: string };
  for (let i = 0; i < 5; i++)
    expect(
      (
        await req("/api/auth/verify", "POST", {
          challengeId: start.challengeId,
          code: "00000000",
        })
      ).status,
    ).toBe(401);
  expect(
    (
      await req("/api/auth/verify", "POST", {
        challengeId: start.challengeId,
        code: start.developmentCode,
      })
    ).status,
  ).toBe(401);
});
it("publishes OAuth/PKCE discovery and challenges unauthenticated MCP calls", async () => {
  const discovery = (await (
    await req("/.well-known/oauth-authorization-server")
  ).json()) as Record<string, unknown>;
  expect(discovery).toMatchObject({
    issuer: base,
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
  });
  const r = await req("/mcp");
  expect(r.status).toBe(401);
  expect(r.headers.get("www-authenticate")).toContain("resource_metadata=");
  expect(
    await (await req("/.well-known/oauth-protected-resource/mcp")).json(),
  ).toMatchObject({
    resource: base + "/mcp",
    scopes_supported: ["audit:read"],
  });
});
it("performs DCR, browser-bound consent, S256 code exchange, authenticated MCP and revocation", async () => {
  const user = await login("oauth@example.test");
  const clientResponse = await req("/oauth/register", "POST", {
    client_name: "Fictional MCP test client",
    redirect_uris: ["http://127.0.0.1:9999/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
  expect(clientResponse.status).toBe(201);
  const client = (await clientResponse.json()) as { client_id: string };
  const verifier = randomBytes(32).toString("base64url"),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: "http://127.0.0.1:9999/callback",
    response_type: "code",
    scope: "audit:read",
    state: "fictional-state",
    resource: base + "/mcp",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  expect((await req("/authorize?" + query)).status).toBe(302);
  const consent = await req(
    "/authorize?" + query,
    "GET",
    undefined,
    user.cookie,
  );
  expect(consent.status).toBe(200);
  const html = await consent.text();
  expect(html).toContain("127.0.0.1");
  const handle = html.match(/name="handle" value="([^"]+)"/)?.[1];
  expect(handle).toBeTruthy();
  const approval = await req(
    "/authorize",
    "POST",
    new URLSearchParams({ handle: handle!, decision: "approve" }).toString(),
    user.cookie + "; " + cookies(consent as unknown as Response),
    { "Content-Type": "application/x-www-form-urlencoded" },
  );
  expect(approval.status).toBe(302);
  const redirect = new URL(approval.headers.get("location")!);
  expect(redirect.searchParams.get("state")).toBe("fictional-state");
  expect(redirect.searchParams.get("iss")).toBe(base);
  const exchange = await req(
    "/oauth/token",
    "POST",
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: client.client_id,
      redirect_uri: "http://127.0.0.1:9999/callback",
      code: redirect.searchParams.get("code")!,
      code_verifier: verifier,
      resource: base + "/mcp",
    }).toString(),
    "",
    { "Content-Type": "application/x-www-form-urlencoded" },
  );
  expect(exchange.status).toBe(200);
  let tokens = (await exchange.json()) as {
    access_token: string;
    refresh_token: string;
  };
  expect(tokens.access_token).toBeTruthy();
  const previousRefresh = tokens.refresh_token;
  expect(previousRefresh).toBeTruthy();
  const refreshed = await req(
    "/oauth/token",
    "POST",
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: previousRefresh,
      client_id: client.client_id,
      resource: base + "/mcp",
    }).toString(),
    "",
    { "Content-Type": "application/x-www-form-urlencoded" },
  );
  expect(refreshed.status).toBe(200);
  tokens = (await refreshed.json()) as typeof tokens;
  expect(tokens.refresh_token).not.toBe(previousRefresh);
  const call = await req(
    "/mcp",
    "POST",
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    "",
    {
      Authorization: "Bearer " + tokens.access_token,
      Accept: "application/json, text/event-stream",
    },
  );
  expect(call.status).toBe(200);
  const tools = (await call.json()) as {
    result: { tools: { _meta: unknown }[] };
  };
  expect(tools.result.tools).toHaveLength(8);
  expect(tools.result.tools[0]._meta).toHaveProperty("securitySchemes");
  expect(
    (
      await req(
        "/oauth/token",
        "POST",
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: client.client_id,
          redirect_uri: "http://127.0.0.1:9999/callback",
          code: redirect.searchParams.get("code")!,
          code_verifier: verifier,
          resource: base + "/mcp",
        }).toString(),
        "",
        { "Content-Type": "application/x-www-form-urlencoded" },
      )
    ).status,
  ).toBe(400);
  const metadata = (await (
    await req("/.well-known/oauth-authorization-server")
  ).json()) as { revocation_endpoint: string };
  expect(
    (
      await req(
        new URL(metadata.revocation_endpoint).pathname,
        "POST",
        new URLSearchParams({
          token: tokens.access_token,
          client_id: client.client_id,
        }).toString(),
        "",
        { "Content-Type": "application/x-www-form-urlencoded" },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await req(
        "/mcp",
        "POST",
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
        "",
        {
          Authorization: "Bearer " + tokens.access_token,
          Accept: "application/json, text/event-stream",
        },
      )
    ).status,
  ).toBe(401);
}, 20000);

it("rejects unsafe redirects, plain PKCE and wrong resource, and supports explicit denial", async () => {
  const user = await login("oauth-negative@example.test");
  const client = (await (
    await req("/oauth/register", "POST", {
      client_name: "Unverified test client",
      redirect_uris: ["http://127.0.0.1:9998/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    })
  ).json()) as { client_id: string };
  const verifier = randomBytes(32).toString("base64url"),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: "http://127.0.0.1:9998/callback",
    response_type: "code",
    scope: "audit:read",
    state: "deny-state",
    resource: base + "/mcp",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const badRedirect = new URLSearchParams(q);
  badRedirect.set("redirect_uri", "https://evil.example/callback");
  expect(
    (await req("/authorize?" + badRedirect, "GET", undefined, user.cookie))
      .status,
  ).toBe(400);
  const plain = new URLSearchParams(q);
  plain.set("code_challenge_method", "plain");
  expect(
    (await req("/authorize?" + plain, "GET", undefined, user.cookie)).status,
  ).toBe(400);
  const foreign = new URLSearchParams(q);
  foreign.set("resource", "https://evil.example/mcp");
  expect(
    (await req("/authorize?" + foreign, "GET", undefined, user.cookie)).status,
  ).toBe(400);
  const consent = await req("/authorize?" + q, "GET", undefined, user.cookie);
  const handle = (await consent.text()).match(
    /name="handle" value="([^"]+)"/,
  )?.[1];
  expect(handle).toBeTruthy();
  const denied = await req(
    "/authorize",
    "POST",
    new URLSearchParams({ handle: handle!, decision: "deny" }).toString(),
    user.cookie + "; " + cookies(consent as unknown as Response),
    { "Content-Type": "application/x-www-form-urlencoded" },
  );
  expect(denied.status).toBe(302);
  const destination = new URL(denied.headers.get("location")!);
  expect(destination.searchParams.get("error")).toBe("access_denied");
  expect(destination.searchParams.get("iss")).toBe(base);
  expect(destination.searchParams.get("state")).toBe("deny-state");
});

it("isolates tenants, supports unlimited teammates, rejects stale saves and revokes access", async () => {
  const a = await login("case-owner@example.test"),
    b = await login("case-reviewer@example.test"),
    outsider = await login("case-outsider@example.test");
  const auditCase = sampleCase(),
    path = "/api/cases/" + auditCase.id,
    shared = { "X-Tenant-ID": a.userId };
  expect(
    (await req(path, "PUT", { auditCase, revision: 0 }, a.cookie)).status,
  ).toBe(200);
  expect((await req(path, "GET", undefined, outsider.cookie)).status).toBe(404);
  expect(
    (await req(path, "GET", undefined, outsider.cookie, shared)).status,
  ).toBe(403);
  expect(
    (
      await req(
        "/api/tenants/members",
        "POST",
        { email: "case-reviewer@example.test" },
        a.cookie,
      )
    ).status,
  ).toBe(200);
  const result = (await (
    await req(path, "GET", undefined, b.cookie, shared)
  ).json()) as { auditCase: unknown };
  expect(result.auditCase).toEqual(auditCase);
  auditCase.workflow.assignee = "Fictional reviewer";
  expect(
    await (
      await req(path, "PUT", { auditCase, revision: 1 }, b.cookie, shared)
    ).json(),
  ).toEqual({ revision: 2 });
  expect(
    (await req(path, "PUT", { auditCase, revision: 1 }, a.cookie)).status,
  ).toBe(409);
  expect(
    (
      await req(
        "/api/tenants/members",
        "POST",
        { email: "case-outsider@example.test" },
        b.cookie,
        shared,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await req(path, "DELETE", undefined, b.cookie, {
        ...shared,
        "If-Match": "2",
      })
    ).status,
  ).toBe(403);
  const db = await mf.getD1Database("DB");
  await db.batch(
    Array.from({ length: 125 }, (_, i) =>
      db
        .prepare("INSERT INTO tenant_members VALUES(?,?,'member')")
        .bind(a.userId, "fixture" + i + "@example.test"),
    ),
  );
  const first = (await (
    await req("/api/tenants/members", "GET", undefined, a.cookie)
  ).json()) as { members: unknown[]; next: string };
  expect(first.members.length).toBe(100);
  expect(first.next).toBeTruthy();
  const second = (await (
    await req(
      "/api/tenants/members?after=" + encodeURIComponent(first.next),
      "GET",
      undefined,
      a.cookie,
    )
  ).json()) as { members: unknown[] };
  expect(second.members.length).toBeGreaterThan(20);
  expect(
    (
      await req(
        "/api/tenants/members",
        "DELETE",
        { email: "case-reviewer@example.test" },
        a.cookie,
      )
    ).status,
  ).toBe(200);
  expect((await req(path, "GET", undefined, b.cookie, shared)).status).toBe(
    403,
  );
  expect(
    (await req("/api/account", "DELETE", undefined, a.cookie)).status,
  ).toBe(409);
  expect(
    (await req(path, "DELETE", undefined, a.cookie, { "If-Match": "1" }))
      .status,
  ).toBe(409);
  expect(
    (await req(path, "DELETE", undefined, a.cookie, { "If-Match": "2" }))
      .status,
  ).toBe(200);
});
it("validates case bodies and removes owned cases when the account is deleted", async () => {
  const a = await login("case-delete@example.test"),
    auditCase = sampleCase(),
    path = "/api/cases/" + auditCase.id;
  expect(
    (
      await req(
        path,
        "PUT",
        { auditCase: { ...auditCase, wc: "invalid" }, revision: 0 },
        a.cookie,
      )
    ).status,
  ).toBe(400);
  expect(
    (await req(path, "PUT", { auditCase, revision: 0 }, a.cookie)).status,
  ).toBe(200);
  expect(
    (await req("/api/account", "DELETE", undefined, a.cookie)).status,
  ).toBe(200);
  const db = await mf.getD1Database("DB");
  expect(
    await db
      .prepare("SELECT id FROM audit_cases WHERE id=?")
      .bind(auditCase.id)
      .first(),
  ).toBeNull();
});
it("atomically gates 50 GB storage, permits paid allowance, releases deleted bytes and blocks suspended tenants", async () => {
  const a = await login("quota-owner@example.test"),
    admin = await login("pilot-admin@example.test"),
    db = await mf.getD1Database("DB");
  await db
    .prepare("UPDATE tenants SET used_bytes=50000000000 WHERE id=?")
    .bind(a.userId)
    .run();
  const upload = () =>
    req("/api/uploads", "POST", "fake", a.cookie, {
      "X-Upload-Authority": "confirmed",
      "X-File-Name": "fake.txt",
    });
  expect((await upload()).status).toBe(402);
  const c = sampleCase();
  expect(
    (
      await req(
        "/api/cases/" + c.id,
        "PUT",
        { auditCase: c, revision: 0 },
        a.cookie,
      )
    ).status,
  ).toBe(402);
  expect(
    (
      await req(
        "/api/admin/tenant",
        "PATCH",
        {
          tenantId: a.userId,
          status: "active",
          paidUntil: Math.floor(Date.now() / 1000) + 86400,
          quotaBytes: 100000000000,
          billingReference: "",
          reason: "Fictional missing invoice",
        },
        admin.cookie,
      )
    ).status,
  ).toBe(400);
  const settings = {
    tenantId: a.userId,
    status: "active",
    paidUntil: Math.floor(Date.now() / 1000) + 86400,
    quotaBytes: 100000000000,
    billingReference: "FICTIONAL-SUB-1",
    reason: "Fictional paid subscription verified",
  };
  expect(
    (await req("/api/admin/tenant", "PATCH", settings, admin.cookie)).status,
  ).toBe(200);
  const stored = await upload();
  expect(stored.status).toBe(201);
  const file = (await stored.json()) as { id: string };
  const bytes = await db
    .prepare("SELECT used_bytes AS n FROM tenants WHERE id=?")
    .bind(a.userId)
    .first<{ n: number }>();
  expect(bytes?.n).toBe(50000000004);
  const download = await req(
    "/api/uploads/" + file.id,
    "GET",
    undefined,
    a.cookie,
  );
  expect(await download.text()).toBe("fake");
  expect(download.headers.get("Content-Disposition")).toContain("attachment");
  expect(
    (await req("/api/uploads/" + file.id, "DELETE", undefined, a.cookie))
      .status,
  ).toBe(200);
  expect(
    (
      await db
        .prepare("SELECT used_bytes AS n FROM tenants WHERE id=?")
        .bind(a.userId)
        .first<{ n: number }>()
    )?.n,
  ).toBe(50000000000);
  expect(
    (
      await req(
        "/api/admin/tenant",
        "PATCH",
        { ...settings, paidUntil: 0 },
        admin.cookie,
      )
    ).status,
  ).toBe(200);
  expect((await upload()).status).toBe(402);
  expect(
    (
      await req(
        "/api/admin/tenant",
        "PATCH",
        { ...settings, status: "suspended" },
        admin.cookie,
      )
    ).status,
  ).toBe(200);
  expect((await req("/api/cases", "GET", undefined, a.cookie)).status).toBe(
    403,
  );
  expect((await upload()).status).toBe(403);
});
it("restricts Sourcy controls to configured admins and prices recorded storage, infrastructure and LLM costs at 2x", async () => {
  const a = await login("cost-owner@example.test"),
    admin = await login("cost-admin@example.test");
  expect(
    (await req("/api/admin/tenants", "GET", undefined, a.cookie)).status,
  ).toBe(403);
  expect(
    (await req("/api/admin/tenants", "GET", undefined, admin.cookie)).status,
  ).toBe(200);
  let quote: { costCents: number; priceCents: number } | undefined;
  for (const [category, amountCents] of [
    ["storage", 150],
    ["infrastructure", 200],
    ["llm", 300],
  ] as const) {
    const r = await req(
      "/api/admin/costs",
      "POST",
      {
        tenantId: a.userId,
        period: "2026-11",
        category,
        amountCents,
        reference: "FICTIONAL-" + category,
        reason: "Fictional invoice verified for test",
      },
      admin.cookie,
    );
    expect(r.status).toBe(200);
    quote = (await r.json()) as { costCents: number; priceCents: number };
  }
  expect(quote).toMatchObject({ costCents: 650, priceCents: 1300 });
  const rows = (await (
    await req("/api/tenants", "GET", undefined, a.cookie)
  ).json()) as { quote_cents: number; quote_period: string }[];
  expect(rows[0]).toMatchObject({ quote_cents: 1300, quote_period: "2026-11" });
  expect(
    (
      await req(
        "/api/admin/costs",
        "POST",
        {
          tenantId: a.userId,
          period: "2026-11",
          category: "storage",
          amountCents: 150,
          reference: "FICTIONAL-storage",
          reason: "Duplicate source must not be counted",
        },
        admin.cookie,
      )
    ).status,
  ).toBe(409);
  const events = (await (
    await req("/api/admin/events", "GET", undefined, admin.cookie)
  ).json()) as { action: string }[];
  expect(events.some((e) => e.action === "record-verified-cost")).toBe(true);
});
it("captures learning for every saved revision, excludes drafts/private text, requires prospective permissions and suppresses small export groups", async () => {
  const admin = await login("export-admin@example.test"),
    owners: Awaited<ReturnType<typeof login>>[] = [];
  for (let i = 0; i < 10; i++) {
    const a = await login("learning-" + i + "@example.test");
    owners.push(a);
    await req(
      "/api/privacy",
      "PATCH",
      { training: true, sale: true },
      a.cookie,
    );
    await req(
      "/api/tenants",
      "PATCH",
      {
        name: "Private business " + i,
        saleAllowed: true,
        authorityConfirmed: true,
      },
      a.cookie,
    );
    const c = sampleCase();
    c.fictional = false;
    c.workflow.reviewCategory = "overtime";
    c.workflow.reviewer = "PRIVATE REVIEWER";
    c.workflow.internalNotes = "PRIVATE INTERNAL TEXT";
    expect(
      (
        await req(
          "/api/cases/" + c.id,
          "PUT",
          { auditCase: c, revision: 0 },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    c.workflow.outcome = "accepted";
    c.workflow.outcomeVerified = true;
    c.workflow.outcomeSource = "PRIVATE CARRIER RESPONSE";
    expect(
      (
        await req(
          "/api/cases/" + c.id,
          "PUT",
          { auditCase: c, revision: 1 },
          a.cookie,
        )
      ).status,
    ).toBe(200);
  }
  const exportData = async (purpose: string) =>
    (await (
      await req(
        "/api/admin/" + purpose,
        "POST",
        { reason: "Fictional approved aggregate evaluation" },
        admin.cookie,
      )
    ).json()) as { aggregates: unknown[] };
  const training = await exportData("training");
  expect(training.aggregates).toEqual([
    {
      coverage: "wc",
      rowBand: "1-9",
      reviewCategory: "overtime",
      outcome: "accepted",
      sampleCountAtLeast: 10,
      tenantCountAtLeast: 10,
    },
  ]);
  const sale = await exportData("export");
  expect(sale.aggregates.length).toBe(1);
  expect(JSON.stringify(sale)).not.toContain("PRIVATE");
  expect(JSON.stringify(sale)).not.toContain("Palmetto");
  await req(
    "/api/privacy",
    "PATCH",
    { training: true, sale: false },
    owners[0].cookie,
  );
  expect((await exportData("export")).aggregates).toEqual([]);
  expect((await exportData("training")).aggregates.length).toBe(1);
  await req(
    "/api/privacy",
    "PATCH",
    { training: false, sale: false },
    owners[0].cookie,
  );
  expect((await exportData("training")).aggregates).toEqual([]);
  const db = await mf.getD1Database("DB"),
    events = await db
      .prepare(
        "SELECT features,human_verified FROM learning_events WHERE tenant_id=? ORDER BY revision",
      )
      .bind(owners[1].userId)
      .all<{ features: string; human_verified: number }>();
  expect(events.results.map((e) => e.human_verified)).toEqual([0, 1]);
  expect(JSON.stringify(events.results)).not.toContain("PRIVATE");
  const no = await login("learning-no-consent@example.test"),
    c = sampleCase();
  expect(
    (
      await req(
        "/api/cases/" + c.id,
        "PUT",
        { auditCase: c, revision: 0 },
        no.cookie,
      )
    ).status,
  ).toBe(200);
  await req("/api/privacy", "PATCH", { training: true, sale: true }, no.cookie);
  await req(
    "/api/tenants",
    "PATCH",
    {
      name: "No retroactive consent",
      saleAllowed: true,
      authorityConfirmed: true,
    },
    no.cookie,
  );
  c.fictional = false;
  c.workflow.outcome = "accepted";
  c.workflow.outcomeVerified = true;
  c.workflow.outcomeSource = "Written";
  c.workflow.reviewer = "Human";
  expect(
    (
      await req(
        "/api/cases/" + c.id,
        "PUT",
        { auditCase: c, revision: 1 },
        no.cookie,
      )
    ).status,
  ).toBe(200);
  const last = await db
    .prepare(
      "SELECT training_eligible,sale_eligible FROM learning_events WHERE case_id=? ORDER BY revision DESC LIMIT 1",
    )
    .bind(c.id)
    .first();
  expect(last).toEqual({ training_eligible: 0, sale_eligible: 0 });
});
it("keeps corrections in draft until source-checked owner approval, scopes later reuse and withdraws stale lessons", async () => {
  const owner = await login("teacher-owner@example.test"),
    member = await login("teacher-member@example.test"),
    outsider = await login("teacher-outsider@example.test");
  const auditCase = sampleCase();
  auditCase.fictional = false;
  auditCase.wc[0].classCode = "1234";
  const casePath = "/api/cases/" + auditCase.id;
  await req(casePath, "PUT", { auditCase, revision: 0 }, owner.cookie);
  await req(
    "/api/tenants/members",
    "POST",
    { email: "teacher-member@example.test" },
    owner.cookie,
  );
  const shared = { "X-Tenant-ID": owner.userId };
  const payload = {
    title: "Check extra OT premium",
    topic: "overtime",
    line: "wc",
    state: "FL",
    originalFinding: "Earlier draft counted all overtime.",
    correctedFinding:
      "Only remove documented extra overtime premium after checking the applicable policy and manual authority.",
    sourceReference: "Fictional reviewed policy/manual authority page 1",
    classCodes: ["1234"],
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
  };
  const created = await req(
    "/api/corrections",
    "POST",
    { caseId: auditCase.id, caseRevision: 1, runId: null, payload },
    member.cookie,
    shared,
  );
  expect(created.status).toBe(201);
  const lesson = (await created.json()) as { id: string; revision: number };
  const context = {
    line: "wc",
    start: "2025-01-01",
    end: "2026-01-01",
    classCodes: ["1234"],
    synthetic: false,
    topics: ["overtime"],
  };
  const matches = async (body = context, cookie = owner.cookie, headers = {}) =>
    (await (
      await req("/api/corrections/match", "POST", body, cookie, headers)
    ).json()) as { lessons: { id: string; revision: number }[] };
  expect((await matches()).lessons).toEqual([]);
  expect(
    (
      await req(
        "/api/corrections/" + lesson.id,
        "PATCH",
        { revision: 1, action: "edit", payload: { ...payload, line: "gl" } },
        member.cookie,
        shared,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await req(
        "/api/corrections/" + lesson.id,
        "PATCH",
        {
          revision: 1,
          action: "approve",
          sourceVerified: true,
          reuseConfirmed: true,
        },
        member.cookie,
        shared,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await req(
        "/api/corrections/" + lesson.id,
        "PATCH",
        { revision: 1, action: "approve" },
        owner.cookie,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await req(
        "/api/corrections/" + lesson.id,
        "PATCH",
        {
          revision: 1,
          action: "approve",
          sourceVerified: true,
          reuseConfirmed: true,
        },
        owner.cookie,
      )
    ).status,
  ).toBe(200);
  expect((await matches()).lessons[0]).toMatchObject({
    id: lesson.id,
    revision: 2,
  });
  expect((await matches({ ...context, synthetic: true })).lessons).toEqual([]);
  expect((await matches({ ...context, classCodes: ["9999"] })).lessons).toEqual(
    [],
  );
  expect((await matches({ ...context, end: "2027-01-01" })).lessons).toEqual(
    [],
  );
  expect((await matches(context, outsider.cookie)).lessons).toEqual([]);
  expect(
    (
      await req(
        "/api/corrections/" + lesson.id,
        "GET",
        undefined,
        outsider.cookie,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await req(
        "/api/corrections/" + lesson.id,
        "PATCH",
        { revision: 1, action: "retire" },
        owner.cookie,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await req(
        "/api/corrections/" + lesson.id,
        "PATCH",
        {
          revision: 2,
          action: "edit",
          payload: {
            ...payload,
            correctedFinding:
              "Revised teaching correction supported by reviewed records.",
          },
        },
        owner.cookie,
      )
    ).status,
  ).toBe(200);
  expect((await matches()).lessons).toEqual([]);
  expect(
    (
      await req(
        "/api/corrections/" + lesson.id,
        "PATCH",
        {
          revision: 3,
          action: "approve",
          sourceVerified: true,
          reuseConfirmed: true,
        },
        owner.cookie,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await req(
        "/api/corrections/" + lesson.id,
        "PATCH",
        { revision: 4, action: "retire" },
        owner.cookie,
      )
    ).status,
  ).toBe(200);
  expect((await matches()).lessons).toEqual([]);
  const db = await mf.getD1Database("DB"),
    events = await db
      .prepare(
        "SELECT status,revision FROM correction_events WHERE correction_id=? ORDER BY revision",
      )
      .bind(lesson.id)
      .all();
  expect(events.results.map((e) => e.status)).toEqual([
    "draft",
    "approved",
    "draft",
    "approved",
    "retired",
  ]);
});
it("records an immutable original/corrected review snapshot and rejects changed cases, secrets and foreign lessons", async () => {
  const a = await login("snapshot-owner@example.test"),
    c = sampleCase();
  const path = "/api/cases/" + c.id;
  await req(path, "PUT", { auditCase: c, revision: 0 }, a.cookie);
  const draft = {
    summary: "Fictional review draft",
    wc: [],
    gl: [],
    mods: [],
    steps: [],
    totals: { carrierFinal: null, deposit: null, sourceQuote: null },
    findings: [],
  };
  const body = {
    caseId: c.id,
    caseRevision: 1,
    provider: "openai-compatible",
    model: "fake-model",
    inputHash: "a".repeat(64),
    draft,
    lessons: [],
  };
  expect(
    (
      await req(
        "/api/audit-runs",
        "POST",
        { ...body, key: "DO-NOT-STORE" },
        a.cookie,
      )
    ).status,
  ).toBe(400);
  const saved = await req("/api/audit-runs", "POST", body, a.cookie);
  expect(saved.status).toBe(201);
  const run = (await saved.json()) as { id: string };
  const snapshot = (await (
    await req("/api/audit-runs/" + run.id, "GET", undefined, a.cookie)
  ).json()) as {
    payload: { draft: unknown; correctedWorksheet: { policy: unknown } };
  };
  expect(snapshot.payload.draft).toEqual(draft);
  expect(snapshot.payload.correctedWorksheet.policy).toEqual(c.policy);
  c.policy.deposit = 123;
  await req(path, "PUT", { auditCase: c, revision: 1 }, a.cookie);
  expect((await req("/api/audit-runs", "POST", body, a.cookie)).status).toBe(
    409,
  );
  expect(
    (
      await req(
        "/api/audit-runs",
        "POST",
        {
          ...body,
          caseRevision: 2,
          lessons: [
            { id: "11111111-1111-4111-8111-111111111111", revision: 1 },
          ],
        },
        a.cookie,
      )
    ).status,
  ).toBe(409);
  expect(
    (await req("/api/audit-runs/" + run.id, "PATCH", {}, a.cookie)).status,
  ).toBe(405);
  const old = (await (
    await req("/api/audit-runs/" + run.id, "GET", undefined, a.cookie)
  ).json()) as {
    payload: { correctedWorksheet: { policy: { deposit: number } } };
  };
  expect(old.payload.correctedWorksheet.policy.deposit).toBe(4500);
  await req("/api/cases/" + c.id, "DELETE", undefined, a.cookie, {
    "If-Match": "2",
  });
  expect(
    (await req("/api/audit-runs/" + run.id, "GET", undefined, a.cookie)).status,
  ).toBe(404);
});
it("retains the exact approved lesson revision in a review snapshot and rejects it after editing", async () => {
  const a = await login("versioned-memory@example.test"),
    c = sampleCase();
  await req(
    "/api/cases/" + c.id,
    "PUT",
    { auditCase: c, revision: 0 },
    a.cookie,
  );
  const payload = {
    title: "Versioned review lesson",
    topic: "overtime",
    line: "wc",
    state: "FL",
    originalFinding: "Earlier synthetic review missed a question.",
    correctedFinding:
      "Check supported premium-only overtime against the actual current policy and payroll records.",
    sourceReference: "Fictional reviewed source page 2",
    classCodes: [],
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
  };
  const lesson = (await (
    await req(
      "/api/corrections",
      "POST",
      { caseId: c.id, caseRevision: 1, runId: null, payload },
      a.cookie,
    )
  ).json()) as { id: string };
  expect(
    (
      await req(
        "/api/corrections/" + lesson.id,
        "PATCH",
        {
          revision: 1,
          action: "approve",
          sourceVerified: true,
          reuseConfirmed: true,
        },
        a.cookie,
      )
    ).status,
  ).toBe(200);
  const draft = {
      summary: "Synthetic original",
      wc: [],
      gl: [],
      mods: [],
      steps: [],
      totals: { carrierFinal: null, deposit: null, sourceQuote: null },
      findings: [],
    },
    body = {
      caseId: c.id,
      caseRevision: 1,
      provider: "openai-compatible",
      model: "fake-model",
      inputHash: "b".repeat(64),
      draft,
      lessons: [{ id: lesson.id, revision: 2 }],
    };
  const created = await req("/api/audit-runs", "POST", body, a.cookie);
  expect(created.status).toBe(201);
  const run = (await created.json()) as { id: string };
  await req(
    "/api/corrections/" + lesson.id,
    "PATCH",
    {
      revision: 2,
      action: "edit",
      payload: {
        ...payload,
        correctedFinding:
          "New correction requires its own explicit source approval before use.",
      },
    },
    a.cookie,
  );
  expect((await req("/api/audit-runs", "POST", body, a.cookie)).status).toBe(
    409,
  );
  const original = (await (
    await req("/api/audit-runs/" + run.id, "GET", undefined, a.cookie)
  ).json()) as {
    payload: { lessons: { revision: number; payload: unknown }[] };
  };
  expect(original.payload.lessons[0].revision).toBe(2);
  expect(original.payload.lessons[0].payload).toEqual(payload);
});
