import { it, expect } from "vitest";
import { sampleCase } from "./cases";
import { exposureTemplate, importExposureCSV } from "./csv";
import { calculate } from "./engine/review";
it("imports quoted WC names and preserves amounts while requiring new verification", () => {
  const c = sampleCase();
  const csv = exposureTemplate(c)
    .replace("Example employee", '"Smith, Alex"')
    .replace("Describe actual duties", "Office")
    .replace(",0,0,0,", ",10000,200,50,");
  const next = importExposureCSV(csv, c);
  expect(next.wc[0].name).toBe("Smith, Alex");
  expect(next.wc[0].gross).toBe(10000);
  expect(next.wc[0].overtimePremium).toBe(200);
  expect(next.wc[0].coiVerified).toBe(false);
  expect(next.wc[0].recordsVerified).toBe(false);
  expect(next.wc[0].rate).toBeNull();
  expect(c.wc.length).toBe(2);
  expect(calculate(next).complete).toBe(false);
});
it("imports GL basis without copying WC verification or accepting blank zero by accident", () => {
  const c = sampleCase();
  c.line = "gl";
  const csv = exposureTemplate(c).replace(",sales,", ",subcost,");
  const next = importExposureCSV(csv, c);
  expect(next.gl[0].basis).toBe("subcost");
  expect(next.gl[0].evidenceVerified).toBe(false);
  expect(next.policy.elementsVerified).toBe(false);
  expect(() => importExposureCSV(csv.replace(",0,0,0,", ",,0,0,"), c)).toThrow(
    /Row 2/,
  );
});
it("rejects malformed, oversized and duplicate-header CSV without changing the case", () => {
  const c = sampleCase(),
    csv = exposureTemplate(c),
    original = JSON.stringify(c);
  expect(() =>
    importExposureCSV(csv.replace("name,classCode", "name,name"), c),
  ).toThrow(/headers/);
  expect(() => importExposureCSV(csv + '"unclosed', c)).toThrow(/quote/);
  expect(() => importExposureCSV("x".repeat(1024 * 1024 + 1), c)).toThrow(
    /1 MB/,
  );
  expect(JSON.stringify(c)).toBe(original);
});
