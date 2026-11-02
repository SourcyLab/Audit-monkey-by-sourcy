# Benchmark real client audits without uploading their records

The structured benchmark can run locally now, with redacted figures from authorized client work and independently checked reference results. It does not require the web app, displayed development login codes, a backend, AI keys or deployment. It is separate from the hosted employee pilot, which remains undeployed.

No real client cohort has been run by this repository's automated checks. All checked-in examples, unit fixtures and screenshots are synthetic. No claim of real-client accuracy is made.

## First cohort

Start with a small held-out set of completed Florida WC and GL audits. A practical first pass is five of each; this is a debugging cohort, not a statistically validated accuracy claim. Include ordinary cases and difficult records: OT premium, officer limits/exemptions, insured subcontractors, mod-effective dates, GL bases/exclusions, minimum premium and deposit/return reconciliation. Do not select only cases already known to work.

Have one staff member establish the reference from a corrected carrier worksheet or a separate reviewed calculation before seeing the tool's answer. Preserve the original worksheet, supporting records, authority, reviewer and reference in your existing approved client-record system. Do not assume the carrier's original bill is correct. An unresolved/open audit can use an independently checked staff reference, but do not label a proposed saving as carrier-approved.

Give each audit an opaque ID such as BENCH-WC-001 or BENCH-GL-001, and its reference an ID such as REF-001. Keep the identity mapping outside this repository and outside the benchmark input. The benchmark schema has no client names, contacts, policy numbers, document text or staff-note fields. It still contains confidential financial figures and dates; keep it in company-approved private storage.

## Run locally

Install the repository dependencies with `npm ci` if needed. Create a private folder **outside this checkout** using your approved file-storage process. The paths below are placeholders; substitute your actual private folder. From the repository root:

```powershell
npm run benchmark -- --init "C:\YourPrivateAuditFolder\cohort-001.json"
```

This creates two **synthetic** WC/GL examples to show the format. Their numbers, classes and rates are made up; they are not Florida rules, carrier rates or real benchmark evidence. Existing files are never overwritten. Replace the examples with your redacted cases, using one separate entry per coverage policy.

```powershell
npm run benchmark -- --input "C:\YourPrivateAuditFolder\cohort-001.json" --out "C:\YourPrivateAuditFolder\results"
```

The command generates private JSON results and a self-contained printable HTML report. Open HTML in a browser, then Print → Save as PDF if needed. It makes no network calls and does not upload records, invoke AI, train a model, publish results or send anything to a carrier. Input and output paths within the public repository—including paths resolving into it through junctions/symlinks—are rejected. The input is limited to 10 MB and 100 cases; use separate cohorts for larger sets.

File permissions inherit the approved folder's existing controls. The script does not configure encryption, Windows ACLs or company retention policy. Do not use a public/shared-download folder. Results include confidential reference and estimated premium figures; do not attach real results to a GitHub issue or PR.

## Input and reference fields

- `dataOrigin`: use `redacted-client-audit` for real cases; synthetic examples are counted separately and excluded from real-client metrics. Merely changing this label does not make an example real.
- `policy`: enter verified dates, deposit, mod periods, fixed-charge settings and each premium element in worksheet order. Steps omit free-text labels/identifiers; the runner generates generic labels. Rates are your own verified values.
- `wc` or `gl`: enter only the line being benchmarked. Rows omit names, duties text and IDs; the runner generates generic row labels. Class codes are numeric strings or blank. A human must separately check duties, allocation and class choice; `recordsVerified`/`evidenceVerified` are deliberate staff assertions.
- `reference.source`: `carrier-corrected-worksheet` or `independent-staff-recalculation` for real cases. Set `humanVerified=true` only after that review. Synthetic controls use `synthetic-hand-calculation` and are never presented as human-approved client results.
- `reference.expectedComplete`: true only when the available verified inputs support a final calculation. Then provide both `finalPremium` and `balance`; a negative balance is a return. For an expected abstention, set both to null. A wrong deposit or independently inconsistent balance remains visible as a mismatch.
- `reference.expectedFlags`: independently reviewed candidate-adjustment **categories**. Allowed values: overtime, officer-cap, officer-exemption, insured-sub, gl-exclusion, gl-insured-sub, reconciliation, verification. Use null when not assessed. An empty array means explicitly checked and none expected. This is not a test of automated discovery from raw documents: adjustments are derived from the structured values the staff member entered.
- `timing`: actual `manualMinutes` and `toolMinutes`, or null if unmeasured. Include preparation, entry, verification and draft cleanup in the tool time. A slower result is recorded as negative time saved.
- `manualReview`: grade `criticalError`, `documentIntakeCorrect`, `classificationReviewCorrect` and `packetUsable` independently. Use null for unassessed; unknown values do not pass. The calculator alone cannot establish these four properties. Evaluate the web-app document/letter workflow separately using the redacted case and reviewer rubric; original identifiable records still require the hosted-pilot safeguards in the pilot runbook.

## Read the results

The report separates real cases and synthetic controls; compares completeness, premium and balance; reports signed cent differences, absolute error over available numeric outputs, withheld/unexpected final outputs, missed/extra categories and category precision/recall. One cent is the default comparison tolerance, configurable from zero to 100 cents and recorded in the report. Use a justified tolerance consistently; do not relax it after seeing failures without documenting why.

A withheld amount is not counted as zero arithmetic error. Unknown reference flags, timings and human-review fields are not converted into successes. Precision/recall are category-level comparisons, not line-level or legal correctness measures. Detailed issues and false/missed categories are in JSON. Reference/source IDs, the input SHA-256, time, Git revision and whether the checkout was clean provide reproducibility without copying source documents into the repository.

## Decide the next step

Investigate every mismatch, unexpected completed estimate and critical manual error. Separate data-entry mistakes, incomplete references, engine defects, policy interpretation and workflow friction. Retain the original failed case privately; make a small **synthetic** regression example when reporting a code defect publicly. Do not publish client figures or identity mappings.

A sensible initial internal acceptance rule is no unexplained arithmetic/balance discrepancies under the agreed tolerance, no unaddressed critical errors, and all document/classification/packet reviews completed. Record actual staff time and explain missed/extra flags. These are proposed pilot criteria, not certification, a refund promise or proof of broad accuracy. A small successful cohort does not establish performance on other states, industries, carriers or policy editions.

Keep benchmark cases held out of training/tuning until evaluation is complete. The offline runner has no training/sale integration and does not change consent or enroll cases. Any later secondary use requires its own valid authority and permissions; benchmark participation is not secondary-use consent.

For identifiable uploads and live employee collaboration, the existing hosted-pilot requirements still apply: authorized deployment, real email verification, tenant access controls, retention/recovery and reviewed data handling. Do not put identifiable client records into the displayed-code development web app. [Pilot runbook](pilot-runbook.md).

Not legal, tax or insurance advice. No agent, CPA or client relationship is created. Verify with your carrier, NCCI and a licensed professional. Documentation: CC BY-NC 4.0.
