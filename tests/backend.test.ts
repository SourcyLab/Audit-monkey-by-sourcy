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
  termsVersion: "2026-11-01-v1",
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
  return { cookie: cookies(verify as unknown as Response), challenge };
}
beforeAll(async () => {
  const db = await mf.getD1Database("DB");
  await db.exec(await readFile("backend/migrations/0001_accounts.sql", "utf8"));
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
