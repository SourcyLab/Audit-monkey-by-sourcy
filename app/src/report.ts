import type { AuditCase } from "./schema";
import { packet } from "./engine/review";
import { readiness } from "./workflow";
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
export function reportHTML(c: AuditCase, disclaimer: string): string {
  const issues = readiness(c);
  const draft = escape(packet(c, disclaimer)).replace(
    /^##? (.+)$/gm,
    "<h2>$1</h2>",
  );
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>' +
    escape(c.name) +
    ' — Audit findings draft</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#17291e;max-width:850px;margin:40px auto;padding:24px}h1{font-size:30px}.draft{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.draft h2{white-space:normal;font-size:21px;margin:22px 0 0;break-after:avoid}.notice{padding:16px;background:#f5efd9;border:1px solid #806125}small{color:#44564a}@media print{body{margin:0;padding:0;font-size:11pt}.instructions{display:none}.draft{orphans:3;widows:3}}@page{margin:18mm}</style></head><body><small>The Audit Monkey · by Sourcy</small><h1>Audit findings and dispute draft</h1><p class="instructions">Open this file in a browser and choose Print → Save as PDF. This is a draft; attach supporting records and review before sending.</p><aside class="notice"><strong>' +
    (issues.length
      ? "Pre-submission checks remain"
      : "Pre-submission checks recorded — human approval still required") +
    "</strong>" +
    (issues.length
      ? "<ul>" +
        issues.map((x) => "<li>" + escape(x) + "</li>").join("") +
        "</ul>"
      : "") +
    '</aside><div class="draft">' +
    draft +
    "</div></body></html>"
  );
}
