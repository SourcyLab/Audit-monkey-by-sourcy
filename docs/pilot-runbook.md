# Employee pilot runbook

This build is a local, fictional-data pilot. It is not deployed. Do not put live client records into development-code login mode. A hosted employee pilot requires explicit deployment authorization, HTTPS, real email verification and the operational checks below.

For a first comparison using redacted real-client figures and independent references, use the separate [offline benchmark procedure](real-client-benchmark.md). It does not start the web app or use development login codes. No real cases have been benchmarked by the repository tests.

## Run and sign in

Install Node 24 with npm, then run `npm start` from the repository root. Open http://localhost:8787. Sign up with a fictional email, phone and current terms; the local-only email code appears on screen. Optional training and sale permissions are separate and unchecked. No email is sent in local mode.

## Tenant owner

1. Open **Client cases**. Under **Tenant workspace**, rename the default workspace for your organization. Every account has its own tenant and can also join other tenants by invitation.
2. Expand **Tenant owner settings & teammates**. Enter an employee email and choose **Grant tenant access**. Teammates sign in with exactly that email and select your tenant. No invitation email is sent. There is no teammate count cap; lists paginate in batches of 100.
3. All teammates can read/edit tenant cases, list/download tenant documents and upload originals. Only the tenant owner manages teammates or deletes shared cases/documents. Revocation applies to future server requests; it cannot erase copies already downloaded.
4. Training/sale aggregate eligibility requires the owner's applicable separate consent plus the tenant authority/export switch before the case's first backend save. Existing cases are not retroactively enrolled. Turn either control off to stop future applicable exports.

## Staff audit workflow

1. Select the correct tenant before creating a case. Choose **New case**, enter the insured, carrier, policy number, internal reference, assignee and dates. Use a separate case for each WC or GL policy; do not mix their premium sequences.
2. In **Prepare**, collect the full policy and audit instructions, accounting records, payroll, subcontractor coverage and exemption evidence. Mark received records as received; mark verified only after checking dates, entity and relevance. Give a record/page/date reference or a reason for not-applicable. Download carrier, accountant and subcontractor requests as needed.
3. In **Review**, extract a text PDF locally or enter the worksheet manually. Scans need separate OCR. For bulk exposure, download the WC or GL CSV template and replace its example. Import accepts quoted CSV, up to 500 rows/1 MB; it replaces that line's exposure rows and clears verification. Blank optional rates stay unknown. Use plain nonnegative numbers without currency symbols or thousands separators. Every imported row must be verified.
4. WC: split actual payroll by duties/class and mod-effective period. Remove only extra OT premium, enter period-specific officer limits, and verify exemption/COI authority and dates. GL: verify each class's basis, denominator, allowed sales/payroll exclusions and treatment of insured subcontractors. A WC exclusion is not automatically a GL exclusion.
5. Reproduce the carrier's rate, premium sequence, credits, minima, assessments, proration and deposit credit. Unknown inputs withhold the estimate. Findings are review questions and scenarios, not a binding coverage/class decision. Individual estimated effects overlap and must not be added.
6. Record the next action, follow-up date and reviewer. Internal staff notes are excluded from carrier drafts. General reviewer notes/reconciliation assumptions are included. The **ready** stage is blocked until the pre-submission checks are resolved; this is not an independent human approval.
7. In **Client cases**, choose **Save active case to backend**. Save explicitly after editing; local edits do not automatically sync. On another browser, select the same tenant and load the saved case. If a save conflicts, export your local draft, refresh/load the latest saved copy and reconcile changes. There is no silent last-writer overwrite.
8. Original documents upload separately after authority/redaction confirmation. Backend case save includes extracted worksheet text and staff notes but not original files. Originals are tenant-scoped and download as attachments. Redact unnecessary identifiers. File size limit is 25 MB; logical case/file bytes count toward storage.
9. In **Dispute packet**, review outstanding checks and download Markdown or the printable HTML findings/letter draft. Open HTML in a browser and Print → Save as PDF. Attach actual evidence yourself. Nothing is sent automatically. Confirm deadlines and any collection hold with the carrier; filing a complaint does not itself extend a deadline.
10. When the carrier responds, record review category, outcome, source/page and reviewer. Check outcome verification only against a written response, then save. Each saved revision creates an atomic learning event. Drafts are not treated as verified training truth. No model retrains itself.

## Teach a later review

Use the [checked learning loop](checked-learning-loop.md): feed redacted audit text, request an optional source-quoted draft, correct the worksheet, save and record the original/corrected snapshot, submit a source-backed correction and obtain explicit owner approval. The next matching audit can use that approved lesson. Retrieval is tenant-local; no underlying model weights or premium rules automatically change. Real provider/client improvement remains to be measured.

## Sourcy pilot administration

The privileged allowlist is `SOURCY_ADMIN_EMAILS`, empty in source control. Configure approved admin emails server-side; client input cannot grant this role. Use real verified email and additional operational access protection before hosted use. A fictional allowlist may be passed only to a loopback test server, never published.

In **Client cases**, allowlisted users see **Sourcy administration**. It lists tenant names/IDs, state, storage and quote metadata, not raw client records. Suspending a tenant blocks its data endpoints. Reasons and privileged actions are logged.

The free allowance is **50 decimal GB = 50,000,000,000 bytes per tenant**. Atomic SQL triggers reserve upload bytes before R2 storage and track case payload growth/deletion. The limit covers logical original-file and saved-case bytes, not every provider's metadata/backup overhead. At the limit, additional storage returns a subscription-required response. Reads and deletions remain available; existing records are not erased. Failed uploads release their reservation. A paid allowance expires at its recorded paid-through time.

For the pilot, verify subscriptions externally, then enter the paid-through date, explicit GB allowance and subscription/invoice reference. No automated checkout, payment collection or payment-provider connection exists. Never grant paid status merely because someone asks. Record actual monthly cost entries for storage, infrastructure and Sourcy-funded LLM use; the quote is exactly **2 × recorded costs** in USD cents. BYOK provider charges paid directly by the user are excluded. Unrecorded costs, taxes and payment fees are not guessed. This is not an automatic actual-cost reconciliation or invoice generator.

Training and sale exports use fixed aggregate fields: coverage, broad row-count band, review category, outcome and counts rounded down to tens. Only the latest human-verified revision, prospective permission, current owner consent and current tenant export setting qualify. Every group needs ten distinct consenting tenants. Small pilots normally export no rows. No names, contacts, identifiers, exact financial values, rates, documents, free text or dates are exported. These controls are not a legal determination of anonymity; obtain independent privacy review before any third-party release. No buyer delivery or model-training job is implemented.

## Hosted pilot acceptance, after separate authorization

Provision private Cloudflare resources; set a canonical HTTPS origin; disable development codes and configure a verified email sender/secret. Confirm admin allowlist and operational access, legal/privacy terms, records authority, retention/deletion/backups, bot/abuse controls and recovery. Scan/quarantine documents before use on staff devices. Establish incident/restore procedures and billing verification. Exercise two real employee accounts in separate tenants before admitting client records. MCP protocol tests do not constitute actual ChatGPT/Claude/Cursor/Gemini/Muse approval.

Nothing in this runbook authorizes deployment or merging. `initial-build` and PR #1 remain the review surface.

Not legal, tax or insurance advice. No agent, CPA or client relationship is created. Verify with your carrier, NCCI and a licensed professional.
