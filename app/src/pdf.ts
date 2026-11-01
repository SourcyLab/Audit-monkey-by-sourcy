import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = worker;
export async function readPDF(file: File): Promise<string> {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Please use a PDF smaller than 25 MB.");
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  try {
    if (pdf.numPages > 200)
      throw new Error("Please split PDFs longer than 200 pages locally.");
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i),
        content = await page.getTextContent();
      pages.push(
        `--- Page ${i} ---\n` +
          content.items.map((x) => ("str" in x ? x.str : "")).join(" "),
      );
    }
    const text = pages.join("\n\n");
    if (text.length > 200000)
      throw new Error(
        "Extracted text exceeds 200,000 characters; split this PDF locally.",
      );
    return text;
  } finally {
    await task.destroy();
  }
}
