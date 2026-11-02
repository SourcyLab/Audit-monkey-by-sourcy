# Calculation model and boundaries

These are software behaviors, not universally applicable insurance rules. The reviewer supplies verified policy inputs.

## WC

`net payroll = gross − extra OT premium − other allowed excluded pay`.

If an officer applies, net is bounded by the **entered period-specific** minimum and maximum. A verified individual exemption or explicitly verified WC insured-sub exclusion makes that row zero. Invalid exclusions, unverified allocation, missing rates and missing officer limits withhold final premium.

Each row must fit exactly one verified experience-mod period, with no other intersecting mod period. The row’s charge is `chargeable exposure / 100 × rate × mod`. Payroll must be split using actual records at an effective-date change; the app does not allocate payroll by days. Overlapping same-name officer rows are withheld to prevent applying one individual’s limit twice. For supported multi-class officer allocation, first reconcile the person-level limit with a professional, then enter the resulting chargeable allocations and their evidence without reapplying an officer cap to each row.

## GL

`chargeable exposure = gross exposure − allowed exclusions`. For a sub-cost basis only, the entered insured cost is also deducted when the user explicitly verifies both policy permission and evidence. If insured costs remain subject to a different rate, use a separate row instead of deducting them. Each line is `chargeable exposure / entered denominator × entered rate`. The engine does not impose WC mods or officer rules on GL.

## Premium sequence

After summing WC modified rows or GL class charges, apply an optional fixed charge. Only that charge can be prorated using `actual policy days / entered annual denominator`. All intervals are start-inclusive, end-exclusive UTC calendar dates. Actual exposure is already for the period and is never prorated again. An annual day denominator is an explicit policy input; verify leap-year, cancellation and short-rate treatment.

Apply subsequent steps in entered order:

- Factor: running premium × factor (e.g. `0.90` for a 10% credit).
- Fixed: add a supported dollar charge.
- Minimum: replace running premium with the greater of running premium and minimum.
- Assessment: add running premium × entered percent / 100.

An assessment always uses the running subtotal here. When its governing base differs, reconcile the assessment separately and enter the supported dollar result as a fixed step, with notes. Minimum placement, expense-constant treatment and credits are not assumed to follow one universal sequence. The global `elementsVerified` flag confirms that the complete policy-specific sequence has been reviewed. Each step also requires verification.

Intermediate precision is retained. Round the final premium to cents, then subtract the entered payment/deposit credit. Positive balance = due; negative balance = return. Trace amounts are displayed in cents; check the carrier’s rounding convention.

## Findings and impact

Structural problems with supplied inputs are detected automatically. Class selection, policy authority, evidence authenticity and basis interpretations require human verification; the app supplies manual issue flags rather than claiming to decide them.

Standalone impacts rerun the full entered sequence after removing one proposed deduction or cap/exemption. They are not additive, especially under minimums or interacting elements. The overall carrier-versus-proposed difference compares final premiums of the same intended scope; it is not automatically proof of overcharge. Unknown or incomplete scenarios have null final/impact values, never fabricated figures.

PDF extraction supplies untrusted text only. No OCR, AI inference or automatic number import is performed. Shared Zod schemas bound imports and MCP inputs. Browser evidence status and calculation verification flags are separate: having a received record is not a professional determination that an adjustment applies.

Not legal, tax or insurance advice. No agent, CPA or client relationship is created. Verify with your carrier, NCCI and a licensed professional.
