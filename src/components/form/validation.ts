// Turns the browser's built-in checks (required, type=email, min/max,
// pattern…) into short inline messages, keyed by input name. Pure so it
// can be tested without a DOM.

type Validity = Pick<
  ValidityState,
  | "valueMissing"
  | "typeMismatch"
  | "patternMismatch"
  | "tooShort"
  | "tooLong"
  | "rangeUnderflow"
  | "rangeOverflow"
  | "stepMismatch"
  | "badInput"
  | "valid"
>;

export type CheckableControl = {
  name: string;
  type?: string;
  min?: string;
  max?: string;
  minLength?: number;
  maxLength?: number;
  title?: string;
  validationMessage?: string;
  willValidate: boolean;
  validity: Validity;
};

export function messageFor(control: CheckableControl): string {
  const { validity } = control;
  if (validity.valueMissing) return control.type === "checkbox" ? "Tick this to continue" : "Required";
  if (validity.typeMismatch)
    return control.type === "email" ? "Enter a valid email" : control.type === "url" ? "Enter a valid web address" : "Enter a valid value";
  if (validity.badInput) return control.type === "date" ? "Enter a valid date" : "Enter a valid value";
  if (validity.rangeUnderflow) return `Must be at least ${control.min}`;
  if (validity.rangeOverflow) return `Must be at most ${control.max}`;
  if (validity.tooShort) return `At least ${control.minLength} characters`;
  if (validity.tooLong) return `At most ${control.maxLength} characters`;
  if (validity.patternMismatch) return control.title || "Wrong format";
  if (validity.stepMismatch) return "Enter a valid amount";
  return control.validationMessage || "Invalid";
}

/** Invalid named controls → { name: [message] }, in document order. */
export function collectInvalid(controls: Iterable<CheckableControl>): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const control of controls) {
    if (!control.name || !control.willValidate || control.validity.valid) continue;
    if (errors[control.name]) continue; // radio groups report once
    errors[control.name] = [messageFor(control)];
  }
  return errors;
}
