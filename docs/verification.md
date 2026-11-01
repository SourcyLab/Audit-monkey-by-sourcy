# Verification evidence

Verified November 1, 2026, on Windows with Node 24.22.1 and Chrome 156.0.8078.48. All examples and screenshots use fictional data. These checks verify software behavior, not professional approval of insurance rules or provider certification.

| Check | Result |
| --- | --- |
| Clean npm lockfile install in an isolated staging directory | Passed: 226 packages installed; 227 audited |
| Dependency audit against the final lockfile | 0 reported vulnerabilities at verification time |
| ESLint + strict TypeScript | Passed |
| Vitest engine and MCP protocol suite | **39 passed, 2 test files**; [verbose output](test-output.txt) |
| Production static build | Passed with Vite 8.3.5; output `app/dist/` |
| Production-preview browser workflow | Passed using loopback-only static preview |
| Browser PDF extraction | Fictional PDF text extracted with the bundled worker; manual inputs remain separate |
| Keyboard form flow | Tab focus retained after recalculation; previews/worksheet scroll regions keyboard focusable |
| JSON export/import | Fictional workspace round-tripped; invalid version rejected |
| Request/packet downloads | Draft Markdown files downloaded; nothing submitted |
| Narrow screen | No document-level horizontal overflow at 390 × 844 for overview/review |
| Automated accessibility | No axe WCAG 2.1 A/AA violations on 10 tested screens/states |
| Runtime/network observation | No browser runtime errors; no external requests during the test workflow |
| Git main scope before branch push | One initialization commit, only `README.md` |

Detailed [browser results](browser-verification.json) and [screenshots](screenshots/) are committed. Automated accessibility checks and focused keyboard/visual inspection do **not** establish comprehensive WCAG conformance. Test actual assistive technologies and every supported browser before making a certification claim.

## Reproduce

```sh
npm ci
npm run lint
npm test -- --reporter=verbose
npm run build
npm run preview
# Separate terminal, use the URL printed by preview:
# AUDIT_BASE_URL=http://127.0.0.1:4173 npm run test:browser
```

PowerShell:

```powershell
$env:AUDIT_BASE_URL = 'http://127.0.0.1:4173'
$env:AUDIT_BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:browser
```

Alternatively install Playwright Chromium as described in the README. Test output redacts only the local absolute repository path as `<repo>`; names, results and failures are otherwise retained. The HTTP transport tests bind an ephemeral loopback port and require local socket permission. CI runs them on Ubuntu/Node 24.

## Important boundaries

- No carrier rates, official officer payroll amounts, assessment percentages or universal dispute deadlines were invented. Synthetic inputs test formulas only. NCCI/ISO manual applicability still needs professional verification.
- A clean test run does not independently verify an officer exemption, COI, correct class, GL exclusion or a provider account’s permissions.
- The refreshed-logo Linux path supplied by the user is unavailable on the Windows host. Existing public-site assets are retained with [provenance](../brand/README.md) pending accessible files.
- MCP uses the official TypeScript SDK and passes protocol tests, including a real stdio subprocess and local Streamable HTTP. Actual ChatGPT/Cursor/Claude/Gemini/Meta product-client acceptance and public listings are **not** claimed. See [readiness and remaining requirements](../mcp/README.md).
- No deployment, provider marketplace submission, DNS change or modification to the separate paid-business repository is part of this build.

Not legal, tax or insurance advice. No agent, CPA or client relationship is created. Verify with your carrier, NCCI and a licensed professional.
