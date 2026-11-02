import { it, expect } from "vitest";
import { validateRegistration } from "./registration";
const sample = {
  email: "fictional@example.test",
  phone: "+1 (202) 555-0123",
  termsAccepted: true,
  termsVersion: "draft-v1",
  aiTrainingConsent: false,
  thirdPartyTrainingSaleConsent: false,
};
it("requires email, phone and an affirmative current-terms decision", () => {
  expect(validateRegistration(sample, "draft-v1").email).toBe(sample.email);
  for (const key of ["email", "phone", "termsAccepted"])
    expect(() =>
      validateRegistration(
        { ...sample, [key]: key === "termsAccepted" ? false : "" },
        "draft-v1",
      ),
    ).toThrow();
});
it("does not treat the old disclaimer acknowledgment as registration or consent", () => {
  expect(() => validateRegistration("accepted", "draft-v1")).toThrow();
  expect(() =>
    validateRegistration({ ...sample, termsVersion: "old" }, "draft-v1"),
  ).toThrow();
});
it("does not infer training or sale permission from accepting general terms", () => {
  const r = validateRegistration(sample, "draft-v1");
  expect(r.aiTrainingConsent).toBe(false);
  expect(r.thirdPartyTrainingSaleConsent).toBe(false);
});
