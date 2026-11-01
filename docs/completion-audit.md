# Current scope audit

The original no-backend design was superseded by the user's request for required contact/terms signup, a backend and authenticated MCP. The original audit modes, approved branding, optional BYOK AI and local case tools remain.

Implemented locally: required email/phone/current terms; email-code flow (development codes only on loopback); D1 accounts, consent history and hashed sessions; explicit private R2 uploads with owner isolation; consent withdrawal, active file/account deletion and OAuth grant revocation; shared engine/tool factory; OAuth discovery, S256 PKCE, DCR/CIMD support, scoped bearer validation, browser-bound authorization consent, issuer responses, refresh rotation and revocation.

Training and third-party training-sale terms are conspicuous separate opt-ins and are off by default. No actual training or sale pipeline exists. No historical records were retroactively opted in. Operator is Sourcy Inc; privacy contact Team@sourcyinc.com.

Tests cover both modes/no-AI, registration validation, code replay/brute-force limits, upload isolation/deletion, consent change, OAuth positive/negative paths, scope metadata, private browser case separation, actual stdio and local HTTP. See test-output.txt and browser-verification.json. All tests are fictional; they are not legal or provider approval.

Not deployed or claimed complete for public collection: real email sender/secret configuration, public HTTPS domain/issuer/resources, production rate/bot controls, recovery, lifecycle/backup-retention policies, final terms/privacy legal review, recipient disclosures and real host-client acceptance. Muse Code's exact remote OAuth contract remains unverified. Local protocol compatibility is not marketplace certification. Main remains README-only; PR #1 remains unmerged.
