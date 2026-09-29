// Employment types in display order (lists, filters and chips).
export const EMP_TYPE_OPTIONS = [
  { value: "INTERN", label: "Intern" },
  { value: "PROBATION", label: "Probation" },
  { value: "CONTRACT", label: "Contract" },
  { value: "PERMANENT", label: "Permanent" },
] as const;

export const EMP_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  EMP_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);
