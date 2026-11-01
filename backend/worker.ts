import {
  OAuthProvider,
  AuthorizationError,
  CimdFetchError,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  registrationSchema,
  validateRegistration,
} from "../app/src/registration";
import { TERMS_TEXT, TERMS_VERSION } from "../app/src/terms";
import { auditServer } from "./mcp";
const profileSchema = z.object({ userId: z.string().uuid() });
type Bindings = Env & { OAUTH_PROVIDER?: OAuthHelpers };
const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const token = () => crypto.randomUUID() + crypto.randomUUID();
const hash = async (s: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
function local(req: Request, env: Bindings) {
  return (
    env.LOCAL_DEV === "true" &&
    ["localhost", "127.0.0.1"].includes(new URL(req.url).hostname)
  );
}
function origin(req: Request, env: Bindings) {
  return new Set<string>([env.PUBLIC_ORIGIN, env.APP_ORIGIN]).has(
    req.headers.get("Origin") ?? "",
  );
}
async function bounded(req: Request, max: number) {
  if (Number(req.headers.get("Content-Length") ?? 0) > max)
    throw new Error("Payload too large");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > max) {
      await reader.cancel();
      throw new Error("Payload too large");
    }
    parts.push(r.value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
async function data(req: Request) {
  return JSON.parse(new TextDecoder().decode(await bounded(req, 16384)));
}
async function session(req: Request, env: Bindings) {
  const raw = req.headers
    .get("Cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("am_session="))
    ?.slice(11);
  if (!raw) return null;
  return env.DB.prepare(
    "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?",
  )
    .bind(await hash(raw), now())
    .first<{
      id: string;
      email: string;
      phone: string;
      terms_version: string;
    }>();
}
async function requireSession(req: Request, env: Bindings) {
  const user = await session(req, env);
  if (!user || user.terms_version !== TERMS_VERSION)
    throw new Error("Sign in and accept current terms first");
  return user;
}
function cookie(raw: string, req: Request) {
  return (
    "am_session=" +
    raw +
    "; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400" +
    (new URL(req.url).protocol === "https:" ? "; Secure" : "")
  );
}
async function consents(env: Bindings, userId: string) {
  return env.DB.prepare(
    "SELECT training,sale,created_at FROM consent_events WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
  )
    .bind(userId)
    .first();
}
async function app(req: Request, env: Bindings): Promise<Response> {
  const url = new URL(req.url),
    path = url.pathname;
  if (env.LOCAL_DEV === "true" && !local(req, env))
    return json(
      {
        error: "Local development configuration cannot serve a public hostname",
      },
      503,
    );
  if (path === "/api/terms")
    return json({
      operator: "Sourcy Inc",
      privacyEmail: env.PRIVACY_EMAIL,
      version: TERMS_VERSION,
      text: TERMS_TEXT,
    });
  if (path.startsWith("/api/") && req.method !== "GET" && !origin(req, env))
    return json({ error: "Untrusted origin" }, 403);
  if (path === "/api/auth/start" && req.method === "POST") {
    const input = validateRegistration(await data(req), TERMS_VERSION);
    input.email = input.email.toLowerCase();
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM challenges WHERE email=? AND created_at>?",
    )
      .bind(input.email, now() - 900)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= 3)
      return json(
        { error: "Too many requests. Wait before requesting another code." },
        429,
      );
    const id = crypto.randomUUID(),
      random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const code = String(10000000 + (random[0] % 90000000));
    const codeHash = await hash(env.AUTH_SECRET + id + code);
    await env.DB.prepare(
      "INSERT INTO challenges(id,email,code_hash,registration,created_at,expires_at) VALUES(?,?,?,?,?,?)",
    )
      .bind(
        id,
        input.email,
        codeHash,
        JSON.stringify(input),
        now(),
        now() + 600,
      )
      .run();
    if (!local(req, env)) {
      if (!env.RESEND_API_KEY || env.RESEND_API_KEY.startsWith("local-"))
        return json({ error: "Sign-in email service is not configured" }, 503);
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.RESEND_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.MAIL_FROM,
          to: [input.email],
          subject: "Your Audit Monkey sign-in code",
          text:
            "Your Sourcy Inc Audit Monkey code is " +
            code +
            ". It expires in 10 minutes. If you did not request this, ignore this email.",
        }),
      });
      if (!sent.ok)
        return json(
          { error: "Could not send sign-in email. Please try later." },
          503,
        );
    }
    return json(
      {
        challengeId: id,
        ...(local(req, env) ? { developmentCode: code } : {}),
        message: "Enter the code sent to your email.",
      },
      202,
    );
  }
  if (path === "/api/auth/verify" && req.method === "POST") {
    const input = z
      .object({
        challengeId: z.string().uuid(),
        code: z.string().regex(/^\d{8}$/),
      })
      .strict()
      .parse(await data(req));
    const challenge = await env.DB.prepare(
      "UPDATE challenges SET attempts=attempts+1 WHERE id=? AND expires_at>? AND attempts<5 RETURNING *",
    )
      .bind(input.challengeId, now())
      .first<{ email: string; code_hash: string; registration: string }>();
    if (
      !challenge ||
      !timingSafeEqual(
        enc.encode(challenge.code_hash),
        enc.encode(
          await hash(env.AUTH_SECRET + input.challengeId + input.code),
        ),
      )
    )
      return json({ error: "Invalid or expired code" }, 401);
    const consumed = await env.DB.prepare(
      "DELETE FROM challenges WHERE id=? RETURNING id",
    )
      .bind(input.challengeId)
      .first();
    if (!consumed) return json({ error: "Code already used" }, 401);
    const registration = registrationSchema.parse(
      JSON.parse(challenge.registration),
    );
    let user = await env.DB.prepare("SELECT id FROM users WHERE email=?")
      .bind(challenge.email)
      .first<{ id: string }>();
    if (!user) user = { id: crypto.randomUUID() };
    const raw = token();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users(id,email,phone,terms_version,created_at) VALUES(?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET phone=excluded.phone,terms_version=excluded.terms_version",
      ).bind(
        user.id,
        challenge.email,
        registration.phone,
        TERMS_VERSION,
        now(),
      ),
      env.DB.prepare("INSERT INTO consent_events VALUES(?,?,?,?,?,?)").bind(
        crypto.randomUUID(),
        user.id,
        TERMS_VERSION,
        Number(registration.aiTrainingConsent),
        Number(registration.thirdPartyTrainingSaleConsent),
        now(),
      ),
      env.DB.prepare("INSERT INTO sessions VALUES(?,?,?)").bind(
        await hash(raw),
        user.id,
        now() + 86400,
      ),
    ]);
    return new Response(JSON.stringify({ registered: true, userId: user.id }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": cookie(raw, req),
      },
    });
  }
  if (path === "/api/session") {
    const user = await session(req, env);
    return user
      ? json({
          registered: user.terms_version === TERMS_VERSION,
          userId: user.id,
          email: user.email,
          phone: user.phone,
          consents: await consents(env, user.id),
        })
      : json({ registered: false }, 401);
  }
  if (path === "/api/privacy" && req.method === "PATCH") {
    const user = await requireSession(req, env);
    const input = z
      .object({ training: z.boolean(), sale: z.boolean() })
      .strict()
      .parse(await data(req));
    await env.DB.prepare("INSERT INTO consent_events VALUES(?,?,?,?,?,?)")
      .bind(
        crypto.randomUUID(),
        user.id,
        TERMS_VERSION,
        Number(input.training),
        Number(input.sale),
        now(),
      )
      .run();
    return json({ saved: true });
  }
  if (path === "/api/logout" && req.method === "POST") {
    const user = await requireSession(req, env);
    await env.DB.prepare("DELETE FROM sessions WHERE user_id=?")
      .bind(user.id)
      .run();
    return new Response("{}", {
      headers: {
        "Set-Cookie": "am_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }
  if (path === "/api/uploads" && req.method === "POST") {
    const user = await requireSession(req, env);
    if (req.headers.get("X-Upload-Authority") !== "confirmed")
      return json(
        { error: "Confirm authority and redaction before uploading" },
        400,
      );
    const filename = decodeURIComponent(req.headers.get("X-File-Name") ?? "")
      .split("")
      .map((c) => (c.charCodeAt(0) < 32 || c === "/" || c === "\\" ? "_" : c))
      .join("")
      .slice(0, 200);
    if (!filename) return json({ error: "Filename is required" }, 400);
    const bytes = await bounded(req, 25 * 1024 * 1024);
    if (!bytes.length) return json({ error: "Empty file" }, 400);
    const id = crypto.randomUUID(),
      key = user.id + "/" + id;
    const reserved = await env.DB.prepare(
      "INSERT INTO uploads SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM uploads WHERE user_id=?)<20 RETURNING id",
    )
      .bind(id, user.id, key, filename, bytes.length, now(), user.id)
      .first();
    if (!reserved)
      return json(
        { error: "Upload quota reached; remove existing files first" },
        409,
      );
    try {
      await env.UPLOADS.put(key, bytes, {
        httpMetadata: { contentType: "application/octet-stream" },
      });
    } catch {
      await env.DB.prepare("DELETE FROM uploads WHERE id=?").bind(id).run();
      throw new Error("Upload failed");
    }
    return json({ id, filename, size: bytes.length }, 201);
  }
  if (path === "/api/uploads" && req.method === "GET") {
    const user = await requireSession(req, env);
    return json(
      (
        await env.DB.prepare(
          "SELECT id,filename,size,created_at FROM uploads WHERE user_id=? ORDER BY created_at",
        )
          .bind(user.id)
          .all()
      ).results,
    );
  }
  if (path.startsWith("/api/uploads/") && req.method === "DELETE") {
    const user = await requireSession(req, env);
    const item = await env.DB.prepare(
      "SELECT object_key FROM uploads WHERE id=? AND user_id=?",
    )
      .bind(path.split("/").at(-1), user.id)
      .first<{ object_key: string }>();
    if (!item) return json({ error: "Not found" }, 404);
    await env.UPLOADS.delete(item.object_key);
    await env.DB.prepare("DELETE FROM uploads WHERE object_key=?")
      .bind(item.object_key)
      .run();
    return json({ deleted: true });
  }
  if (path === "/api/account" && req.method === "DELETE") {
    const user = await requireSession(req, env);
    let cursor: string | undefined;
    do {
      const grants = await env.OAUTH_PROVIDER!.listUserGrants(user.id, {
        cursor,
      });
      for (const grant of grants.items)
        await env.OAUTH_PROVIDER!.revokeGrant(grant.id, user.id);
      cursor = grants.cursor;
    } while (cursor);
    const rows = await env.DB.prepare(
      "SELECT object_key FROM uploads WHERE user_id=?",
    )
      .bind(user.id)
      .all<{ object_key: string }>();
    for (const item of rows.results) await env.UPLOADS.delete(item.object_key);
    await env.DB.prepare("DELETE FROM users WHERE id=?").bind(user.id).run();
    return new Response("{}", {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": "am_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      },
    });
  }
  if (path === "/authorize") {
    const user = await session(req, env);
    if (!user || user.terms_version !== TERMS_VERSION) {
      const login = new URL("/", env.PUBLIC_ORIGIN);
      login.searchParams.set("return_to", url.pathname + url.search);
      return Response.redirect(login.href, 302);
    }
    const oauth = env.OAUTH_PROVIDER!;
    if (req.method === "GET") {
      const auth = await oauth.parseAuthRequest(req);
      const details = await oauth.describeConsent(auth);
      const consent = await oauth.beginConsent(auth);
      const scope = details.scope.filter((x) => x === "audit:read");
      if (scope.length !== details.scope.length)
        throw new Error("Unsupported scope");
      consent.headers.set("Content-Type", "text/html; charset=utf-8");
      return new Response(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize Audit Monkey</title><h1>Connect ' +
          esc(details.clientName) +
          "?</h1><p>" +
          (details.clientDomain
            ? "Client domain: " + esc(details.clientDomain)
            : "Self-registered client; name is not verified.") +
          "</p><p>Redirect destination: " +
          esc(details.redirectHost) +
          "</p>" +
          (details.redirectIsLoopback
            ? "<p>This sends access to an app on your computer. Continue only if you initiated it.</p>"
            : "") +
          '<p>Scope: audit:read — use the audit calculation and public guide tools. This grants no training/sale consent, contact export or file download access.</p><form method="post"><input type="hidden" name="handle" value="' +
          esc(consent.handle) +
          '"><button name="decision" value="approve">Allow</button> <button name="decision" value="deny">Deny</button></form></html>',
        { headers: consent.headers },
      );
    }
    if (req.method === "POST") {
      if (!origin(req, env)) return json({ error: "Untrusted origin" }, 403);
      const form = await req.formData();
      const handle = String(form.get("handle"));
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(req, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(req, handle, {
        scope: ["audit:read"],
      });
      const result = await oauth.completeAuthorization({
        request: approved.request,
        userId: user.id,
        metadata: {},
        scope: ["audit:read"],
        props: { userId: user.id },
      });
      approved.headers.set("Location", result.redirectTo);
      return new Response(null, { status: 302, headers: approved.headers });
    }
  }
  if (path.startsWith("/api/")) return json({ error: "Not found" }, 404);
  return env.ASSETS.fetch(req);
}
export default {
  async fetch(req: Request, env: Bindings, ctx: ExecutionContext) {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32)
      return json({ error: "Authentication secret is not configured" }, 503);
    const originUrl = new URL(env.PUBLIC_ORIGIN);
    if (originUrl.origin !== env.PUBLIC_ORIGIN)
      return json({ error: "Invalid canonical origin" }, 503);
    if (env.LOCAL_DEV === "true" && !local(req, env))
      return json(
        { error: "Local development configuration cannot serve public hosts" },
        503,
      );
    const oauth = new OAuthProvider<Bindings>({
      apiRoute: "/mcp",
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/oauth/token",
      clientRegistrationEndpoint: "/oauth/register",
      scopesSupported: ["audit:read"],
      requiredScopes: ["audit:read"],
      resourceMetadata: {
        resource: env.PUBLIC_ORIGIN + "/mcp",
        authorization_servers: [env.PUBLIC_ORIGIN],
      },
      clientIdMetadataDocumentEnabled: true,
      defaultHandler: { fetch: app },
      apiHandler: {
        async fetch(request, bindings, context) {
          const auth = context as ExecutionContext & {
            props: unknown;
            auth: { scope: string[] };
          };
          const userId = profileSchema.parse(auth.props).userId;
          if (!auth.auth.scope.includes("audit:read"))
            return json({ error: "Insufficient scope" }, 403);
          const user = await bindings.DB.prepare(
            "SELECT id,terms_version FROM users WHERE id=?",
          )
            .bind(userId)
            .first<{ id: string; terms_version: string }>();
          if (!user || user.terms_version !== TERMS_VERSION) {
            const response = json(
              { error: "Account unavailable or terms changed" },
              401,
            );
            response.headers.set(
              "WWW-Authenticate",
              'Bearer error="invalid_token", resource_metadata="' +
                bindings.PUBLIC_ORIGIN +
                '/.well-known/oauth-protected-resource/mcp"',
            );
            return response;
          }
          const server = auditServer();
          const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
          });
          await server.connect(transport);
          const response = await transport.handleRequest(request);
          context.waitUntil(Promise.all([server.close(), transport.close()]));
          return response;
        },
      },
    });
    try {
      const effective =
        new URL(req.url).pathname === "/.well-known/oauth-protected-resource"
          ? new Request(
              new URL(
                "/.well-known/oauth-protected-resource/mcp",
                env.PUBLIC_ORIGIN,
              ),
              req,
            )
          : req;
      return await oauth.fetch(effective, env, ctx);
    } catch (error) {
      if (
        error instanceof AuthorizationError ||
        error instanceof CimdFetchError
      )
        return json({ error: "Invalid or expired authorization request" }, 400);
      return json(
        {
          error:
            error instanceof z.ZodError
              ? "Invalid input"
              : error instanceof Error &&
                  [
                    "Payload too large",
                    "Sign in and accept current terms first",
                  ].includes(error.message)
                ? error.message
                : "Request could not be completed",
        },
        error instanceof z.ZodError
          ? 400
          : error instanceof Error && error.message === "Payload too large"
            ? 413
            : error instanceof Error &&
                error.message === "Sign in and accept current terms first"
              ? 401
              : 503,
      );
    }
  },
};
