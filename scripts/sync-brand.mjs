import { mkdir, copyFile, readdir, unlink } from "node:fs/promises";
const dest = new URL("../app/public/brand/", import.meta.url);
await mkdir(dest, { recursive: true });
for (const old of ["logo.png", "favicon.ico"])
  try {
    await unlink(new URL(old, dest));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
for (const name of await readdir(new URL("../brand/", import.meta.url)))
  if (name.startsWith("audit-monkey-") && /\.(svg|png)$/.test(name))
    await copyFile(
      new URL("../brand/" + name, import.meta.url),
      new URL(name, dest),
    );
