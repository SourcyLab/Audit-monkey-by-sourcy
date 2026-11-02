import type { AuditCase } from "./schema";
import { wcRowSchema, glRowSchema } from "./schema";
export const csvHeaders = {
  wc: "name,classCode,duties,gross,overtimePremium,excludedPay,rate,start,end,officer,officerMin,officerMax,exempt,subcontractor",
  gl: "name,classCode,basis,exposure,excluded,insuredSubCost,insuredSubExcluded,rate,per,start,end",
};
function cells(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  const push = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += ch;
    } else if (ch === ",") push();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      push();
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else if (ch === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw new Error("Invalid CSV quoting");
      cell += ch;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (cell || row.length || closed) {
    push();
    if (row.some((x) => x.trim())) rows.push(row);
  }
  return rows;
}
export function importExposureCSV(text: string, c: AuditCase): AuditCase {
  if (new TextEncoder().encode(text).length > 1024 * 1024)
    throw new Error("Use a CSV smaller than 1 MB");
  const rows = cells(text.replace(/^\uFEFF/, ""));
  const headers = rows.shift()?.map((x) => x.trim());
  const expected = csvHeaders[c.line].split(",");
  if (
    !headers ||
    headers.length !== expected.length ||
    new Set(headers).size !== headers.length ||
    expected.some((h) => !headers.includes(h))
  )
    throw new Error(
      "Use the downloaded template headers for this coverage line",
    );
  if (!rows.length || rows.length > 500)
    throw new Error("Import between 1 and 500 rows");
  const copy = structuredClone(c);
  const parsed = rows.map((row, i) => {
    if (row.length !== headers.length)
      throw new Error("Row " + (i + 2) + ": wrong number of columns");
    const value = Object.fromEntries(headers.map((h, j) => [h, row[j].trim()]));
    const n = (key: string, optional = false) => {
      if (!value[key] && optional) return null;
      if (!/^\d+(\.\d+)?$/.test(value[key] ?? ""))
        throw new Error(key + " must be a plain nonnegative number");
      return Number(value[key]);
    };
    const b = (key: string) => {
      if (!["true", "false"].includes(value[key]))
        throw new Error(key + " must be true or false");
      return value[key] === "true";
    };
    try {
      if (c.line === "wc")
        return wcRowSchema.parse({
          id: crypto.randomUUID(),
          name: value.name,
          classCode: value.classCode,
          duties: value.duties,
          gross: n("gross"),
          overtimePremium: n("overtimePremium"),
          excludedPay: n("excludedPay"),
          rate: n("rate", true),
          start: value.start,
          end: value.end,
          officer: b("officer"),
          officerMin: n("officerMin", true),
          officerMax: n("officerMax", true),
          exempt: b("exempt"),
          subcontractor: b("subcontractor"),
          exemptionVerified: false,
          coiVerified: false,
          recordsVerified: false,
        });
      return glRowSchema.parse({
        id: crypto.randomUUID(),
        name: value.name,
        classCode: value.classCode,
        basis: value.basis,
        exposure: n("exposure"),
        excluded: n("excluded"),
        insuredSubCost: n("insuredSubCost"),
        insuredSubExcluded: b("insuredSubExcluded"),
        rate: n("rate", true),
        per: n("per"),
        start: value.start,
        end: value.end,
        evidenceVerified: false,
      });
    } catch (error) {
      throw new Error(
        "Row " +
          (i + 2) +
          ": " +
          (error instanceof Error ? error.message : "Invalid input"),
        { cause: error },
      );
    }
  });
  if (c.line === "wc") copy.wc = parsed.map((r) => wcRowSchema.parse(r));
  else copy.gl = parsed.map((r) => glRowSchema.parse(r));
  copy.policy.elementsVerified = false;
  copy.workflow.updatedAt = new Date().toISOString();
  copy.workflow.stage = "reviewing";
  return copy;
}
export function exposureTemplate(c: AuditCase): string {
  return (
    csvHeaders[c.line] +
    "\r\n" +
    (c.line === "wc"
      ? `Example employee,TODO,Describe actual duties,0,0,0,,${c.policy.start},${c.policy.end},false,,,false,false`
      : `Example operations,TODO,sales,0,0,0,false,,1000,${c.policy.start},${c.policy.end}`) +
    "\r\n"
  );
}
