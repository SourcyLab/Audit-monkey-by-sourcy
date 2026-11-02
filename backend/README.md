# Sourcy Inc account, consent and MCP backend

Local Cloudflare Worker + D1 + private R2 + OAuth KV. No resources have been provisioned or deployed. The checked-in IDs are local placeholders and workers.dev/preview URLs are disabled.

## Local run

Use Node 24 and run npm start at the repository root. This installs dependencies, builds the web app, creates an ignored local-only secret file if absent, applies D1 migrations with --local and runs Wrangler on loopback port 8787. Open http://localhost:8787 (the canonical local OAuth issuer).

In local development only, requesting a sign-in code displays an eight-digit development code in the browser. This does not prove real email ownership; it exercises the same code/session flow without sending mail. Development-code mode refuses all public hostnames. Never use real client records in this mode. For actual email verification configure a real secret RESEND_API_KEY and a verified sender; set LOCAL_DEV=false and approved HTTPS canonical origins only after separate deployment authorization. No emails or DNS changes have been performed by this task.

## Data and identity

- Email, phone and current-terms acceptance are required before access to the browser workspace. The old local disclaimer flag is not accepted as signup.
- Login is passwordless email-code verification: ten-minute challenges, five attempts, three requests per email per fifteen minutes, hashed/HMAC-salted challenges, single-use consumption, and an opaque hashed session token. Cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS. Sessions expire after 24 hours. Phone is collected, not verified.
- General terms acceptance does not imply secondary-purpose consent. Training and third-party training sale/licensing each require separate unchecked decisions. D1 records the terms version and consent history with server timestamps. Existing local records are never retroactively opted in.
- Local indexing is still local. Only the explicit private-upload action sends an original file to Sourcy Inc; it requires an authority/redaction confirmation. Objects are private, tenant-scoped and use random keys. Authenticated teammates can download attachments; other tenants cannot access them. There are no public download URLs. Limit: 25 MB per file, subject to tenant storage. Files are not rendered by the backend.
- Privacy controls allow consent withdrawal, file deletion, all-session logout and account deletion. Active account deletion removes R2 objects, D1 account/session/consent rows and revokes OAuth grants. Local case JSON/browser copies are independent and are not silently deleted.
- No automatic buyer delivery, data sale execution, model retraining, marketing subscription or model ingestion exists. Privileged aggregate export downloads are described in the pilot runbook. Contact and audit uploads are not automatically sent to any AI. The user-requested permissions are disclosed prospective permissions, subject to other people's rights and applicable law.
- Operator: Sourcy Inc. Privacy contact: Team@sourcyinc.com. Terms are in app/src/terms.ts with a version checked by the backend.

## Authenticated remote MCP

Cloudflare's maintained workers-oauth-provider implements the OAuth protocol; browser login and the contact/terms gate supply end-user identity. Remote /mcp requires OAuth bearer authorization, not a website cookie or a static shared secret. The Node stdio integration remains public calculations/guides only and does not access stored contacts or uploads.

Discovery: /.well-known/oauth-authorization-server and /.well-known/oauth-protected-resource/mcp (also available at the root protected-resource well-known path). Discovery advertises the exact issuer, S256 PKCE, resource audience, DCR, CIMD and token/revocation endpoints. /authorize requires sign-in and presents client identity, redirect hostname, scopes and Allow/Deny. The maintained library binds consent to the browser and handles code replay, expiry, token hashing/encryption, refresh rotation, client metadata checks and RFC 9207 issuer responses. The Worker additionally checks that the authorized user still exists, accepted current terms and has audit:read.

OAuth scopes never grant training/sale permission. audit:read permits supplied-data calculations and public guides only; it does not export contacts, list private objects or authorize a sale. All eight tools share the same factory and engine across Worker and stdio transports. HTTP tools publish OAuth security metadata.

## Client compatibility and honest status

ChatGPT, Claude, Cursor and Gemini support OAuth-capable remote MCP through their documented host flows; clients can use DCR or supported metadata identification and PKCE against this implementation. Muse is treated here as Meta Muse Code: its official documentation establishes MCP support, but a specific remote OAuth acceptance contract could not be verified from available public documentation. Its stdio path remains available. No actual provider account, directory approval, certification, hosted endpoint or live-client acceptance is claimed. A green protocol test does not grant provider approval.

Primary references checked November 1, 2026:
- https://developers.openai.com/plugins/build/auth
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- https://github.com/cloudflare/workers-oauth-provider
- https://code.claude.com/docs/en/mcp
- https://cursor.com/docs/context/mcp
- https://geminicli.com/docs/tools/mcp-server/
- https://developers.meta.com/vr/downloads/package/meta-vr-cli/1.8.0/

## Production gates (not deployed)

Before public collection: confirm final terms/privacy review, recipient categories, retention and backup deletion policy, applicable data-sale rights and restricted personal-data handling; provision private D1/R2/KV resources and rotate secrets; configure verified email delivery, canonical HTTPS issuer/origins and rate/bot controls beyond per-email limits; implement recovery and operational monitoring without logging private bodies; scan/quarantine any files before staff downloads or downstream use; test actual client authorization and delete/revoke flows. Do not enable a data-sale or training pipeline merely because consent flags exist. No unbounded account/record retention policy is asserted here: automatic lifecycle retention is not yet implemented and must be resolved before production.

The installed local workerd supports compatibility date 2026-10-30; that date is deliberately used instead of a newer unsupported date. Test simulations use a supported runtime date. Type bindings are generated with Wrangler, not handwritten. Tests use fictional data and no real mail.

ChatGPT directory qualification also requires a published complete privacy policy and purpose-limited data collection; mandatory phone collection may need justification or redesign for that channel. Protocol compatibility is not a claim that the proposed training/resale practices are accepted by OpenAI or any other provider. See https://developers.openai.com/plugins/plugin-guidelines .

## MVP / pilot tenant additions

See [employee/admin runbook](../docs/pilot-runbook.md) for tenant owner/member roles, unlimited paginated teammates, explicit saved cases and conflict handling, tenant document downloads, the atomic 50 GB logical-byte quota, externally verified paid entitlements, 2× recorded infrastructure/storage/LLM costs, and prospective consent-aware learning. Admin identity comes only from the server-side SOURCY_ADMIN_EMAILS allowlist (empty by default). Admin actions log actor/action/reason/time. Membership and tenant state are checked on each data request. Deleting a member does not erase shared tenant records.

Migrations 0002–0006 add case storage, tenant isolation, quota triggers, costs, atomic per-revision learning and duplicate cost-source protection. Legacy version-1 JSON gets workflow defaults; prior cases are not retroactively made export eligible. Training and sale eligibility are independent bits captured at first save and checked against current owner choices and tenant permission at export. Only the latest human-verified outcome per case is eligible. Fixed broad features, ten-tenant group suppression and rounded counts constrain exports; no raw documents/contact/private-text export endpoint exists. No anonymization certification is claimed.

Run npm run verify:browser after npm run build to start an isolated loopback database/server and exercise both modes plus separate owner/member/outsider/admin browser contexts. Install Playwright Chromium or set AUDIT_BROWSER_PATH. The harness uses only a fictional admin allowlist and local test auth values; it creates no cloud resources.

## Checked correction memory

Migration 0007 adds immutable audit review snapshots, versioned corrections and a status/actor/content-hash journal. Authenticated tenant members may submit drafts; authors/owners may edit; only the tenant owner can explicitly approve/reject/retire. Every retrieval is tenant/scope/origin constrained and approval is reset by editing. Snapshot recording checks case/lesson versions and stores the original draft, corrected worksheet, source hash, provider/model label and exact lesson content/version; no key field is accepted. New content participates in storage quotas; source-case deletion cascades linked records. No raw lesson export, cross-tenant reuse or model fine-tuning exists. See [checked teaching workflow](../docs/checked-learning-loop.md).
