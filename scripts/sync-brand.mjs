import { mkdir, copyFile } from "node:fs/promises";
for (const name of ["logo.png", "favicon.ico"]) {
  await mkdir(new URL("../app/public/brand/", import.meta.url), {
    recursive: true,
  });
  await copyFile(
    new URL("../brand/" + name, import.meta.url),
    new URL("../app/public/brand/" + name, import.meta.url),
  );
}
