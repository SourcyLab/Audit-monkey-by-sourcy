import { day } from "../app/src/engine/common";
import { z } from "zod";
import {
  correctionSchema,
  matchingLessons,
  lessonSchema,
} from "../app/src/corrections";
import { auditDraftSchema } from "../app/src/audit-draft";
import { caseSchema } from "../app/src/schema";
import { json, type Tenant, type User } from "./tenants";
const now = () => Math.floor(Date.now() / 1000);
const sha = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
type Row = {
  id: string;
  tenant_id: string;
  case_id: string;
  case_revision: number;
  run_id: string | null;
  payload: string;
  status: string;
  revision: number;
  synthetic: number;
  created_by: string;
  approved_by: string | null;
  updated_at: number;
};
const publicLesson = (row: Row) => ({
  id: row.id,
  revision: row.revision,
  status: row.status,
  synthetic: !!row.synthetic,
  payload: JSON.parse(row.payload),
  createdBy: row.created_by,
  approvedBy: row.approved_by,
  updatedAt: row.updated_at,
  caseId: row.case_id,
  runId: row.run_id,
  caseRevision: row.case_revision,
});
async function sourceCase(db: D1Database, tenant: Tenant, id: string) {
  return db
    .prepare(
      "SELECT payload,revision FROM audit_cases WHERE id=? AND tenant_id=?",
    )
    .bind(id, tenant.id)
    .first<{ payload: string; revision: number }>();
}
export async function reviewMemoryAPI(
  req: Request,
  db: D1Database,
  user: User,
  tenant: Tenant,
  read: () => Promise<unknown>,
) {
  const url = new URL(req.url),
    parts = url.pathname.split("/"),
    isRun = parts[2] === "audit-runs";
  if (isRun) {
    if (req.method === "GET" && parts.length === 4) {
      const id = z.string().uuid().parse(parts[3]);
      const row = await db
        .prepare(
          "SELECT id,payload,case_revision,created_by,created_at FROM audit_runs WHERE id=? AND tenant_id=?",
        )
        .bind(id, tenant.id)
        .first<{
          id: string;
          payload: string;
          case_revision: number;
          created_by: string;
          created_at: number;
        }>();
      return row
        ? json({ ...row, payload: JSON.parse(row.payload) })
        : json({ error: "Review run not found" }, 404);
    }
    if (req.method === "GET") {
      const id = z.string().uuid().parse(url.searchParams.get("caseId"));
      if (!(await sourceCase(db, tenant, id)))
        return json({ error: "Case not found" }, 404);
      return json(
        (
          await db
            .prepare(
              "SELECT id,case_revision,created_by,created_at FROM audit_runs WHERE tenant_id=? AND case_id=? ORDER BY created_at DESC LIMIT 50",
            )
            .bind(tenant.id, id)
            .all()
        ).results,
      );
    }
    if (req.method !== "POST" || parts.length !== 3)
      return json({ error: "Method not allowed" }, 405);
    const input = z
      .object({
        caseId: z.string().uuid(),
        caseRevision: z.number().int().positive(),
        provider: z.enum(["openai-compatible", "anthropic"]),
        model: z.string().min(1).max(200),
        inputHash: z.string().regex(/^[a-f0-9]{64}$/),
        draft: auditDraftSchema,
        lessons: z
          .array(
            z
              .object({
                id: z.string().uuid(),
                revision: z.number().int().positive(),
              })
              .strict(),
          )
          .max(8),
      })
      .strict()
      .parse(await read());
    const c = await sourceCase(db, tenant, input.caseId);
    if (!c) return json({ error: "Case not found" }, 404);
    if (c.revision !== input.caseRevision)
      return json(
        {
          error:
            "Saved case changed. Load it and review again before recording this snapshot.",
        },
        409,
      );
    const saved = caseSchema.parse(JSON.parse(c.payload));
    const lessons = [];
    for (const ref of input.lessons) {
      const row = await db
        .prepare(
          "SELECT * FROM audit_corrections WHERE id=? AND tenant_id=? AND revision=? AND status='approved'",
        )
        .bind(ref.id, tenant.id, ref.revision)
        .first<Row>();
      if (!row || !!row.synthetic !== saved.fictional)
        return json(
          {
            error:
              "Remembered correction changed or is unavailable. Refresh and review again.",
          },
          409,
        );
      const lesson = publicLesson(row);
      if (!matchingLessons(saved, [lessonSchema.parse(lesson)]).length)
        return json(
          { error: "Remembered correction is outside this case scope" },
          400,
        );
      lessons.push(lesson);
    }
    if (
      (saved.line === "wc" && input.draft.gl.length) ||
      (saved.line === "gl" &&
        (input.draft.wc.length || input.draft.mods.length))
    )
      return json({ error: "Draft coverage differs from saved case" }, 400);
    const payload = JSON.stringify({
        provider: input.provider,
        model: input.model,
        inputHash: input.inputHash,
        draft: input.draft,
        lessons,
        reviewVersion: "audit-review-v1",
        correctedWorksheet: {
          line: saved.line,
          policy: saved.policy,
          wc: saved.wc,
          gl: saved.gl,
          observations: saved.observations,
          reviewer: saved.workflow.reviewer,
        },
      }),
      id = crypto.randomUUID();
    if (new TextEncoder().encode(payload).length > 1800000)
      return json(
        {
          error:
            "Review snapshot is too large; split this audit before recording",
        },
        413,
      );
    await db
      .prepare("INSERT INTO audit_runs VALUES(?,?,?,?,?,?,?)")
      .bind(id, tenant.id, input.caseId, c.revision, payload, user.email, now())
      .run();
    return json({ id, caseRevision: c.revision }, 201);
  }
  if (parts[3] === "match" && req.method === "POST") {
    const input = z
      .object({
        line: z.enum(["wc", "gl"]),
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        classCodes: z.array(z.string().regex(/^\d{3,6}$/)).max(500),
        synthetic: z.boolean(),
        topics: z.array(z.string().max(30)).max(9),
      })
      .strict()
      .parse(await read());
    if (
      !Number.isFinite(day(input.start)) ||
      !(day(input.end) > day(input.start))
    )
      return json(
        { error: "Choose a valid policy period before matching corrections" },
        400,
      );
    const rows = await db
      .prepare(
        "SELECT * FROM audit_corrections WHERE tenant_id=? AND status='approved' AND synthetic=? AND json_extract(payload,'$.line')=? AND json_extract(payload,'$.effectiveFrom')<=? AND json_extract(payload,'$.effectiveTo')>=? AND (json_array_length(payload,'$.classCodes')=0 OR EXISTS(SELECT 1 FROM json_each(audit_corrections.payload,'$.classCodes') c JOIN json_each(?) q ON c.value=q.value)) ORDER BY EXISTS(SELECT 1 FROM json_each(?) t WHERE t.value=json_extract(payload,'$.topic')) DESC,updated_at DESC,id LIMIT 8",
      )
      .bind(
        tenant.id,
        Number(input.synthetic),
        input.line,
        input.start,
        input.end,
        JSON.stringify(input.classCodes),
        JSON.stringify(input.topics),
      )
      .all<Row>();
    return json({ lessons: rows.results.map(publicLesson) });
  }
  if (parts.length === 3 && req.method === "GET") {
    const status = url.searchParams.get("status") || "all",
      after = url.searchParams.get("after") || "";
    if (!["all", "draft", "approved", "rejected", "retired"].includes(status))
      return json({ error: "Unknown status" }, 400);
    const rows = await db
      .prepare(
        "SELECT * FROM audit_corrections WHERE tenant_id=? AND id>? AND (?='all' OR status=?) ORDER BY id LIMIT 100",
      )
      .bind(tenant.id, after, status, status)
      .all<Row>();
    return json({
      lessons: rows.results.map(publicLesson),
      next: rows.results.length === 100 ? rows.results.at(-1)!.id : null,
      canApprove: tenant.role === "owner",
    });
  }
  if (parts.length === 3 && req.method === "POST") {
    const input = z
      .object({
        caseId: z.string().uuid(),
        caseRevision: z.number().int().positive(),
        runId: z.string().uuid().nullable(),
        payload: correctionSchema,
      })
      .strict()
      .parse(await read());
    const c = await sourceCase(db, tenant, input.caseId);
    if (!c) return json({ error: "Case not found" }, 404);
    if (c.revision !== input.caseRevision)
      return json(
        {
          error:
            "Saved case changed. Refresh before submitting the correction.",
        },
        409,
      );
    if (
      input.runId &&
      !(await db
        .prepare(
          "SELECT id FROM audit_runs WHERE id=? AND tenant_id=? AND case_id=?",
        )
        .bind(input.runId, tenant.id, input.caseId)
        .first())
    )
      return json({ error: "Review run not found" }, 404);
    const source = caseSchema.parse(JSON.parse(c.payload));
    if (source.line !== input.payload.line)
      return json(
        { error: "Correction coverage differs from source case" },
        400,
      );
    const payload = JSON.stringify(input.payload),
      id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO audit_corrections(id,tenant_id,case_id,case_revision,run_id,payload,status,revision,synthetic,created_by,modified_by,approved_by,content_hash,updated_at) VALUES(?,?,?,?,?,?,'draft',1,?,?,?,NULL,?,?)",
      )
      .bind(
        id,
        tenant.id,
        input.caseId,
        c.revision,
        input.runId,
        payload,
        Number(source.fictional),
        user.email,
        user.email,
        await sha(payload),
        now(),
      )
      .run();
    return json({ id, revision: 1, status: "draft" }, 201);
  }
  const id = z.string().uuid().parse(parts[3]);
  const row = await db
    .prepare("SELECT * FROM audit_corrections WHERE id=? AND tenant_id=?")
    .bind(id, tenant.id)
    .first<Row>();
  if (!row) return json({ error: "Correction not found" }, 404);
  if (req.method === "GET") return json(publicLesson(row));
  if (req.method !== "PATCH") return json({ error: "Method not allowed" }, 405);
  const input = z
    .object({
      revision: z.number().int().positive(),
      action: z.enum(["edit", "approve", "reject", "retire"]),
      payload: correctionSchema.optional(),
      sourceVerified: z.boolean().optional(),
      reuseConfirmed: z.boolean().optional(),
    })
    .strict()
    .parse(await read());
  if (input.action !== "edit" && tenant.role !== "owner")
    return json(
      { error: "Only the tenant owner can approve, reject or retire a lesson" },
      403,
    );
  if (
    input.action === "edit" &&
    tenant.role !== "owner" &&
    row.created_by !== user.email
  )
    return json(
      { error: "Only the author or owner can edit this correction" },
      403,
    );
  if (
    input.action === "approve" &&
    (!input.sourceVerified ||
      !input.reuseConfirmed ||
      !["draft", "rejected"].includes(row.status))
  )
    return json(
      {
        error:
          "Review the cited source and confirm redacted tenant reuse before approving a draft",
      },
      400,
    );
  if (input.action === "edit" && !input.payload)
    return json({ error: "Edited correction content is required" }, 400);
  if (
    input.payload &&
    input.payload.line !== correctionSchema.parse(JSON.parse(row.payload)).line
  )
    return json(
      { error: "Create a separate correction for another coverage line" },
      400,
    );
  const status =
      input.action === "edit"
        ? "draft"
        : input.action === "approve"
          ? "approved"
          : input.action === "reject"
            ? "rejected"
            : "retired",
    payload = input.payload ? JSON.stringify(input.payload) : row.payload;
  if (input.action !== "edit" && input.payload)
    return json(
      { error: "Edit first, then explicitly approve the new revision" },
      400,
    );
  const saved = await db
    .prepare(
      "UPDATE audit_corrections SET payload=?,status=?,revision=revision+1,modified_by=?,approved_by=?,content_hash=?,updated_at=? WHERE id=? AND tenant_id=? AND revision=? RETURNING revision",
    )
    .bind(
      payload,
      status,
      user.email,
      status === "approved" ? user.email : null,
      await sha(payload),
      now(),
      id,
      tenant.id,
      input.revision,
    )
    .first();
  return saved
    ? json({ saved: true, status, ...saved })
    : json({ error: "Correction changed. Refresh before reviewing it." }, 409);
}
