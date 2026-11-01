# After the audit: explain the bill before disputing it

Work from the complete audit worksheet and final bill. An invoice showing only “additional premium” is not enough to reconstruct the audit. Ask for the exposure, rate, basis, class and every adjustment.

## Reconcile the premium, line by line

1. Match the insured, coverage line, policy dates and locations. Bridge accounting periods to those dates.
2. For each WC class and effective period, calculate chargeable payroll divided by 100, multiplied by the policy rate. For GL, divide the chargeable class exposure by the **specified rate denominator**, then multiply by its rate.
3. For WC, apply the verified experience mod to the proper exposure segment. Confirm the worksheet’s effective date, not just its displayed factor.
4. Follow the policy’s actual order for credits, discounts, minimum premium, expense constant and assessments. Determine which elements are subject to the mod and which assessment base applies. There is no universal sequence in this tool.
5. Compare final premium with the deposit and all prior premium payments or credits. A negative final-minus-deposit balance is a return premium; a positive amount is additional premium.

In the app, each exposure trace shows a line charge. Premium-element traces show the running subtotal. Full precision is retained through the calculation and the result is rounded to cents; verify the carrier’s rounding convention. An unsupported value withholds the final estimate.

## Look for explainable differences

| Question | Evidence / next step |
| --- | --- |
| Wrong class or work description? | Actual operations, duties, job records and the carrier’s class-rule explanation |
| Payroll split ignored? | Contemporaneous employee / duty / class records; do not invent percentage allocations |
| Extra OT premium included? | Payroll detail separating ordinary pay from only the additional premium portion |
| Officer limit or exemption ignored? | Individual identity, applicable period values and dated DWC verification |
| Sales or payroll outside the period? | Date bridge, transactions, payroll and cancellation terms |
| Sub charged despite coverage? | Correct line of insurance, legal entity, all dates worked, issuer confirmation and policy authority |
| GL basis or denominator wrong? | Class schedule and supporting ledger; WC rules do not settle GL treatment |
| Rate or mod wrong? | Policy endorsements, rate pages, full mod worksheet and effective periods |
| Deposit credit missing? | Payment ledger and prior bills or refunds |
| Minimum or assessment different? | Filed/policy value, exact base and calculation sequence |

The software does not choose a legally correct class or decide coverage. Use its manual review flags to identify the question and the evidence needed. A flag is not proof of an error.

## Recover records left out of the original submission

Ask whether the carrier will accept late COIs, eligible individual exemption certificates, OT premium detail and supported payroll splits. Document original dates; do not backdate or alter records. Ask for re-audit rules and deadlines in writing.

The app estimates the standalone effect of entered OT, officer-limit, exemption, insured-sub and GL-exclusion adjustments by repricing a scenario before that adjustment. A minimum premium or another factor can reduce the effect to zero. These individual effects can overlap and **must not be added**. The overall carrier-versus-proposed difference is a separate reconciliation, not an extra saving. Missing rates or authority mean **TODO**, not zero savings.

For a proposed class or rate change, make a JSON backup, run a separate case with the supported changed input and compare the complete results. Preserve the original worksheet. State assumptions and identify the evidence that would support the change.

Next: [Dispute](dispute.md). Source register: [Florida](states/fl.md).

---
CC BY-NC 4.0 · The Audit Monkey, by Sourcy. Not legal, tax or insurance advice. No agent, CPA or client relationship is created. Verify with your carrier, NCCI and a licensed professional. Verify current values.
