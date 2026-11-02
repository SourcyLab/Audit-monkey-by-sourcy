import { z } from "zod";
import { day } from "./engine/common";
import type { AuditCase } from "./schema";
export const correctionTopics = [
  "overtime",
  "officer",
  "subcontractor",
  "classification",
  "mod",
  "gl-basis",
  "premium-math",
  "dates",
  "other",
] as const;
const date = z
  .string()
  .refine((value) => Number.isFinite(day(value)), "Use a valid date");
export const correctionSchema = z
  .object({
    title: z.string().trim().min(4).max(160),
    topic: z.enum(correctionTopics),
    line: z.enum(["wc", "gl"]),
    state: z.literal("FL"),
    originalFinding: z.string().trim().min(1).max(4000),
    correctedFinding: z.string().trim().min(8).max(4000),
    sourceReference: z.string().trim().min(8).max(2000),
    classCodes: z
      .array(z.string().regex(/^\d{3,6}$/))
      .max(20)
      .refine((c) => new Set(c).size === c.length),
    effectiveFrom: date,
    effectiveTo: date,
  })
  .strict()
  .refine(
    (c) => day(c.effectiveTo) > day(c.effectiveFrom),
    "Lesson end must follow start; end date is exclusive",
  );
export type Correction = z.infer<typeof correctionSchema>;
export const lessonSchema = z.object({
  id: z.string(),
  revision: z.number().int().positive(),
  status: z.enum(["draft", "approved", "rejected", "retired"]),
  synthetic: z.boolean(),
  payload: correctionSchema,
  createdBy: z.string(),
  approvedBy: z.string().nullable(),
  updatedAt: z.number(),
});
export type Lesson = z.infer<typeof lessonSchema>;
export function matchingLessons(c: AuditCase, lessons: Lesson[]): Lesson[] {
  const codes = new Set(
    (c.line === "wc" ? c.wc : c.gl).map((r) => r.classCode),
  );
  const topics = new Set<string>();
  if (c.line === "wc") {
    if (c.wc.some((r) => r.overtimePremium > 0)) topics.add("overtime");
    if (c.wc.some((r) => r.officer || r.exempt)) topics.add("officer");
    if (c.wc.some((r) => r.subcontractor)) topics.add("subcontractor");
    if (c.policy.mods.length > 1) topics.add("mod");
  } else {
    topics.add("gl-basis");
    if (c.gl.some((r) => r.basis === "subcost")) topics.add("subcontractor");
  }
  return lessons
    .filter(
      (l) =>
        l.status === "approved" &&
        l.synthetic === c.fictional &&
        l.payload.line === c.line &&
        l.payload.state === "FL" &&
        Number.isFinite(day(c.policy.start)) &&
        day(l.payload.effectiveFrom) <= day(c.policy.start) &&
        day(l.payload.effectiveTo) >= day(c.policy.end) &&
        (!l.payload.classCodes.length ||
          l.payload.classCodes.some((code) => codes.has(code))),
    )
    .sort(
      (a, b) =>
        Number(topics.has(b.payload.topic)) -
          Number(topics.has(a.payload.topic)) ||
        b.updatedAt - a.updatedAt ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 8);
}
export function lessonContext(lessons: Lesson[]) {
  return lessons.map((l) => ({
    id: l.id,
    revision: l.revision,
    title: l.payload.title,
    topic: l.payload.topic,
    line: l.payload.line,
    state: l.payload.state,
    classCodes: l.payload.classCodes,
    effectiveFrom: l.payload.effectiveFrom,
    effectiveTo: l.payload.effectiveTo,
    previousError: l.payload.originalFinding,
    correction: l.payload.correctedFinding,
    sourceReference: l.payload.sourceReference,
  }));
}
