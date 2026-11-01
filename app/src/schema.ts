import { z } from "zod";
const amount = z.number().finite().min(0).max(1e12);
const short = z.string().max(500);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const wcRowSchema = z
  .object({
    id: short,
    name: short,
    classCode: short,
    duties: short,
    gross: amount,
    overtimePremium: amount,
    excludedPay: amount,
    officer: z.boolean(),
    officerMin: amount.nullable(),
    officerMax: amount.nullable(),
    exempt: z.boolean(),
    exemptionVerified: z.boolean(),
    subcontractor: z.boolean(),
    coiVerified: z.boolean(),
    recordsVerified: z.boolean(),
    rate: amount.nullable(),
    start: date,
    end: date,
  })
  .strict();
export const glRowSchema = z
  .object({
    id: short,
    name: short,
    classCode: short,
    basis: z.enum(["payroll", "sales", "subcost", "units"]),
    exposure: amount,
    excluded: amount,
    insuredSubCost: amount,
    insuredSubExcluded: z.boolean(),
    evidenceVerified: z.boolean(),
    rate: amount.nullable(),
    per: amount.positive(),
    start: date,
    end: date,
  })
  .strict();
export const policySchema = z
  .object({
    elementsVerified: z.boolean(),
    start: date,
    end: date,
    deposit: amount,
    carrierFinal: amount.nullable(),
    steps: z
      .array(
        z
          .object({
            id: short,
            label: short,
            kind: z.enum(["factor", "fixed", "minimum", "assessment"]),
            value: amount,
            verified: z.boolean(),
          })
          .strict(),
      )
      .max(40),
    mods: z
      .array(
        z
          .object({ start: date, end: date, factor: amount.positive() })
          .strict(),
      )
      .max(40),
    fixedChargeAnnual: amount,
    fixedChargeProrated: z.boolean(),
    annualDays: amount.positive(),
  })
  .strict();
export const evidenceSchema = z
  .object({
    id: short,
    label: short,
    status: z.enum([
      "missing",
      "requested",
      "received",
      "verified",
      "not-applicable",
    ]),
    note: z.string().max(4000),
  })
  .strict();
export const observationSchema = z
  .object({
    id: short,
    title: short,
    detail: z.string().max(4000),
    evidence: short,
  })
  .strict();
export const workflowSchema = z
  .object({
    carrier: short.default(""),
    reviewCategory: z
      .enum([
        "unclassified",
        "overtime",
        "officer",
        "subcontractor",
        "classification",
        "mod",
        "gl-basis",
        "other",
      ])
      .default("unclassified"),
    outcome: z
      .enum(["pending", "accepted", "partly-accepted", "rejected", "no-change"])
      .default("pending"),
    outcomeVerified: z.boolean().default(false),
    outcomeSource: short.default(""),
    policyNumber: short.default(""),
    reference: short.default(""),
    assignee: short.default(""),
    reviewer: short.default(""),
    stage: z
      .enum([
        "intake",
        "preparing",
        "reviewing",
        "ready",
        "submitted",
        "closed",
      ])
      .default("intake"),
    nextAction: short.default(""),
    followUp: z.string().max(10).default(""),
    internalNotes: z.string().max(20000).default(""),
    updatedAt: z.string().max(40).default(""),
  })
  .strict();
export const caseSchema = z
  .object({
    id: short,
    name: short,
    fictional: z.boolean(),
    workflow: workflowSchema.default(() => workflowSchema.parse({})),
    line: z.enum(["wc", "gl"]),
    policy: policySchema,
    wc: z.array(wcRowSchema).max(500),
    gl: z.array(glRowSchema).max(500),
    evidence: z.array(evidenceSchema).max(100),
    observations: z.array(observationSchema).max(100),
    notes: z.string().max(20000),
    deadline: z.string().max(10),
    deadlineSource: short,
    worksheetText: z.string().max(200000),
  })
  .strict();
export const workspaceSchema = z
  .object({ version: z.literal(1), cases: z.array(caseSchema).max(100) })
  .strict();
export type AuditCase = z.infer<typeof caseSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
