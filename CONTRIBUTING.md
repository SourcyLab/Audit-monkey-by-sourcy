# Contributing

Use fictional, plainly labeled data. Never commit client records, account credentials, API keys, SSNs or live insurance documents. This repository is the free noncommercial project; do not edit the separate paid-business repository.

## Local checks

Node 22.13+ or 24+:

```sh
npm ci
npm run lint
npm test
npm run build
npm run dev
```

Loopback HTTP tests require permission for local sockets. Do not skip them and then report the suite as passing. Run CI and retain failures with their context. For browser verification use the fictional case, test keyboard navigation, narrow screens, first-run notice, errors, export/import and local PDF extraction. No deployment is part of these commands.

## Add a state module

1. Open a state-addition issue naming the jurisdiction, lines and primary authorities.
2. Implement `StateModule` in `app/src/states/<code>.ts`. Separate law, manual edition, policy-effective values and reviewer assertions. Link sources, record verification date and leave unknown figures TODO.
3. Keep state-specific logic out of the UI and generic engine. If actual formula behavior differs, add a typed pure function with explicit inputs and dates; do not silently make a Florida rule national.
4. Add fixtures for effective-date boundaries, missing inputs and unsupported cases. Software tests with synthetic inputs are not professional approval of an insurance rule.
5. Add the guide module and source/verification notes. Obtain subject-matter review before presenting a new rule as verified. Document limitations and migrate versioned JSON if the schema changes.

## Add a line module

Keep WC and GL independent. A new line belongs in `app/src/engine/`, with explicit basis, rate denominator, applicability and a traceable result. It must not infer carrier rates or exclusions. Reuse premium sequencing only where appropriate. Add meaningful tests for both ordinary calculations and withheld results.

## Modify the engine or MCP

- Engine functions have no browser, storage, file or network dependency. Shared schemas validate JSON and MCP inputs.
- Preserve the distinction between unknown and zero. Preserve actual exposure dates and user-entered premium sequence. Do not add insurance “defaults” without verified applicability.
- MCP tools must expose accurate descriptions, input bounds and read-only/action annotations. No hidden file access, external transmission, persistent cases or carrier submissions.
- Test protocol initialization, tools/list, invalid inputs, outputs, prompts/resources, stdio and HTTP Host/Origin enforcement. Do not claim provider approval based on an SDK test.
- Report changes with problem, resulting behavior, validation and material limitations. Keep screenshots fictional and free of user information.

## Branding

Replace source files in `/brand`, update `brand/README.md` provenance, and adjust the **single** `app/src/brand.ts` config only if paths change. `scripts/sync-brand.mjs` copies assets into the ignored app public directory before dev/build. Color tokens live in `app/src/tokens.css`. Do not add agency affiliations or provider endorsement marks.

## Licenses

Code: PolyForm Noncommercial 1.0.0. Original guides, prompts and templates: CC BY-NC 4.0. Submit only material you may license under the relevant terms. Attribute third-party material and preserve dependency notices. Commercial use needs permission; a public repository does not grant a commercial license.
