import { readFile, writeFile } from "node:fs/promises";
const files = {
  prepare: "prepare.md",
  review: "review.md",
  dispute: "dispute.md",
  florida: "states/fl.md",
  gl: "gl.md",
  wc: "wc.md",
  glossary: "glossary.md",
};
const guides = {};
for (const [id, path] of Object.entries(files))
  guides[id] = await readFile(
    new URL("../guides/" + path, import.meta.url),
    "utf8",
  );
await writeFile(
  new URL("../mcp/guide-data.ts", import.meta.url),
  "// Generated from guides by scripts/sync-guides.mjs. Do not edit by hand.\nexport const bundledGuides:Record<string,string>=" +
    JSON.stringify(guides, null, 2) +
    ";\n",
);
