import type { z } from "zod";

// What a form's server action returns: a message for the whole form
// (shown by the submit button), per-field messages (shown under each
// input), and/or success. Field keys are input names; nested inputs use
// dotted paths, e.g. "contacts.1.email".

export type FormState = {
  error?: string;
  ok?: string | boolean;
  fieldErrors?: Record<string, string[]>;
};

export const FIX_FIELDS = "Fix the highlighted fields.";

/** Every zod issue under its input name; form-level issues become `error`. */
export function invalid(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (!key) {
      formErrors.push(issue.message);
      continue;
    }
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return {
    fieldErrors,
    error: formErrors[0] ?? (Object.keys(fieldErrors).length ? FIX_FIELDS : "Invalid input"),
  };
}

/** One field's error, for checks done outside zod (duplicates, lookups). */
export function fieldError(name: string, message: string): FormState {
  return { fieldErrors: { [name]: [message] }, error: FIX_FIELDS };
}
