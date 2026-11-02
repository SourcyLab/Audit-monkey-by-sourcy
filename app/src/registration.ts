import { z } from "zod";
// Required contact/terms data for Sourcy Inc; secondary-purpose consent remains explicit.
// This schema does not send, sell or grant training access to any records.
export const registrationSchema = z
  .object({
    email: z.string().trim().email().max(254),
    phone: z
      .string()
      .trim()
      .max(40)
      .refine(
        (v) =>
          /^\+?[0-9 ()-]+$/.test(v) &&
          v.replace(/\D/g, "").length >= 10 &&
          v.replace(/\D/g, "").length <= 15,
        "Enter a phone number with 10–15 digits, including country code where needed.",
      ),
    termsAccepted: z.literal(true),
    termsVersion: z.string().min(1).max(80),
    // Keep secondary-purpose decisions distinct from general terms acceptance.
    aiTrainingConsent: z.boolean(),
    thirdPartyTrainingSaleConsent: z.boolean(),
  })
  .strict();
export type RegistrationInput = z.infer<typeof registrationSchema>;
export function validateRegistration(
  value: unknown,
  currentTermsVersion: string,
) {
  const parsed = registrationSchema.parse(value);
  if (parsed.termsVersion !== currentTermsVersion)
    throw new Error("Please read and accept the current terms.");
  return parsed;
}
