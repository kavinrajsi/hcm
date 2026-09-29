"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EmployeeFormState } from "./actions";
import { istDay } from "@/lib/date-filter";
import { PREVIOUS_EMPLOYMENT_DOCUMENTS } from "@/lib/employee-documents";
import {
  TYPE_END_DEFAULT_DAYS,
  TYPE_END_LABELS,
  addDaysToDay,
  type EmpTypeValue,
} from "./type-end";

export type EmployeeDefaults = Partial<{
  empId: string;
  name: string;
  gender: string;
  dateOfBirth: string;
  bloodGroup: string;
  tshirtSize: string;
  phone: string;
  personalEmail: string;
  workEmail: string;
  emergencyContact: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  department: string;
  designation: string;
  dateOfJoining: string;
  empType: string;
  /** Saved end date for the current type (YYYY-MM-DD), edit mode. */
  typeEndDate: string;
  isFresher: boolean;
  pfNumber: string;
  uanNumber: string;
  linkedinId: string;
  managerId: string;
  /** Saved previous companies with their letter blob keys (edit mode). */
  previousEmployments: PreviousEmploymentDefault[];
}>;

type LetterColumn = (typeof PREVIOUS_EMPLOYMENT_DOCUMENTS)[number][0];

export type PreviousEmploymentDefault = {
  id: string;
  companyName: string;
} & Partial<Record<LetterColumn, string | null>>;

/** A company row in the form; `key` is stable across add / remove. */
type PreviousEmploymentRow = Partial<PreviousEmploymentDefault> & {
  key: string;
};

/** Masked display values for already-stored sensitive fields (edit mode). */
export type SensitiveMasks = Partial<{
  pan: string;
  aadhaar: string;
  bankAccount: string;
  ifsc: string;
}>;

function Field({
  label,
  name,
  error,
  className,
  children,
}: {
  label: string;
  name: string;
  error?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error[0]}</p>}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

/**
 * Experienced hire's previous companies: a name and the three letters per
 * company. Posted as prevCount + prev.{i}.* (see previous-employments.ts).
 */
function PreviousCompanies({
  rows,
  errors,
  onAdd,
  onRemove,
}: {
  rows: PreviousEmploymentRow[];
  errors: Record<string, string[]>;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Previous companies</p>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          + Add company
        </Button>
      </div>
      <input type="hidden" name="prevCount" value={rows.length} />
      {errors.previousEmployments && (
        <p className="text-xs text-red-600">{errors.previousEmployments[0]}</p>
      )}
      {rows.length === 0 && (
        <p className="text-sm text-zinc-500">No previous companies added.</p>
      )}
      {rows.map((row, index) => {
        const prefix = `prev.${index}`;
        return (
          <div
            key={row.key}
            className="grid gap-4 rounded-md border border-zinc-200 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800"
          >
            <input type="hidden" name={`${prefix}.id`} value={row.id ?? ""} />
            <Field
              label="Company name"
              name={`${prefix}.companyName`}
              error={errors[`${prefix}.companyName`]}
            >
              <Input
                id={`${prefix}.companyName`}
                name={`${prefix}.companyName`}
                defaultValue={row.companyName}
              />
            </Field>
            {PREVIOUS_EMPLOYMENT_DOCUMENTS.map(([column, field, label]) => {
              const current = row[column];
              return (
                <Field
                  key={field}
                  label={label}
                  name={`${prefix}.${field}`}
                  error={errors[`${prefix}.${field}`]}
                >
                  <Input
                    id={`${prefix}.${field}`}
                    name={`${prefix}.${field}`}
                    type="file"
                    accept=".pdf,image/*"
                  />
                  {current && (
                    <a
                      href={`/api/files/${current}?inline=1`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-zinc-500 underline underline-offset-4"
                    >
                      View current — upload to replace
                    </a>
                  )}
                </Field>
              );
            })}
            <div className="sm:col-span-2 lg:col-span-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(row.key)}
              >
                Remove company
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

export function EmployeeForm({
  action,
  defaults = {},
  masks = {},
  managers = [],
  submitLabel,
  hidden = {},
  typeEndBase = "joining",
}: {
  action: (
    prev: EmployeeFormState,
    formData: FormData,
  ) => Promise<EmployeeFormState>;
  defaults?: EmployeeDefaults;
  masks?: SensitiveMasks;
  managers?: { id: string; name: string; empId: string }[];
  submitLabel: string;
  /** Extra hidden fields posted with the form (e.g. candidateId). */
  hidden?: Record<string, string>;
  /** Default end date counts from the joining date (add) or today (edit). */
  typeEndBase?: "joining" | "today";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [isFresher, setIsFresher] = useState(defaults.isFresher ?? true);
  const [previousRows, setPreviousRows] = useState<PreviousEmploymentRow[]>(
    () =>
      (defaults.previousEmployments ?? []).map((row) => ({
        ...row,
        key: row.id,
      })),
  );
  const nextRowKey = useRef(0);
  const newRow = (): PreviousEmploymentRow => ({
    key: `new-${nextRowKey.current++}`,
  });
  const [empType, setEmpType] = useState(defaults.empType ?? "PROBATION");
  const [joiningDate, setJoiningDate] = useState(defaults.dateOfJoining ?? "");
  const defaultTypeEnd = (joining: string) =>
    addDaysToDay(
      typeEndBase === "today" ? istDay() : joining,
      TYPE_END_DEFAULT_DAYS,
    );
  const [typeEndDate, setTypeEndDate] = useState(
    defaults.typeEndDate ?? defaultTypeEnd(joiningDate),
  );
  // Until HR picks a date, the add form's default follows the joining date.
  const [typeEndTouched, setTypeEndTouched] = useState(
    defaults.typeEndDate !== undefined,
  );
  const typeEndLabel = TYPE_END_LABELS[empType as EmpTypeValue];
  const errors = state.fieldErrors ?? {};

  const sensitivePlaceholder = (mask?: string) =>
    mask ? `${mask} — enter to replace` : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Section title="Identity">
        <Field label="Employee ID" name="empId" error={errors.empId}>
          <Input
            id="empId"
            name="empId"
            defaultValue={defaults.empId}
            required
          />
        </Field>
        <Field label="Full name" name="name" error={errors.name}>
          <Input id="name" name="name" defaultValue={defaults.name} required />
        </Field>
        <Field label="Gender" name="gender" error={errors.gender}>
          <select
            id="gender"
            name="gender"
            className={selectClass}
            defaultValue={defaults.gender ?? ""}
          >
            <option value="">—</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field
          label="Date of birth"
          name="dateOfBirth"
          error={errors.dateOfBirth}
        >
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            defaultValue={defaults.dateOfBirth}
          />
        </Field>
        <Field label="Blood group" name="bloodGroup" error={errors.bloodGroup}>
          <Input
            id="bloodGroup"
            name="bloodGroup"
            defaultValue={defaults.bloodGroup}
          />
        </Field>
        <Field label="T-shirt size" name="tshirtSize" error={errors.tshirtSize}>
          <select
            id="tshirtSize"
            name="tshirtSize"
            className={selectClass}
            defaultValue={defaults.tshirtSize ?? ""}
          >
            <option value="">—</option>
            {["XS", "S", "M", "L", "XL", "XXL"].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Phone" name="phone" error={errors.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={defaults.phone}
          />
        </Field>
        <Field
          label="Personal email"
          name="personalEmail"
          error={errors.personalEmail}
        >
          <Input
            id="personalEmail"
            name="personalEmail"
            type="email"
            defaultValue={defaults.personalEmail}
          />
        </Field>
        <Field label="Work email" name="workEmail" error={errors.workEmail}>
          <Input
            id="workEmail"
            name="workEmail"
            type="email"
            defaultValue={defaults.workEmail}
            required
          />
        </Field>
        <Field
          label="Emergency contact"
          name="emergencyContact"
          error={errors.emergencyContact}
        >
          <Input
            id="emergencyContact"
            name="emergencyContact"
            type="tel"
            defaultValue={defaults.emergencyContact}
          />
        </Field>
      </Section>

      <Section title="Address">
        <Field label="Address" name="address" error={errors.address}>
          <Input id="address" name="address" defaultValue={defaults.address} />
        </Field>
        <Field label="City" name="city" error={errors.city}>
          <Input id="city" name="city" defaultValue={defaults.city} />
        </Field>
        <Field label="State" name="state" error={errors.state}>
          <Input id="state" name="state" defaultValue={defaults.state} />
        </Field>
        <Field label="Pincode" name="pincode" error={errors.pincode}>
          <Input id="pincode" name="pincode" defaultValue={defaults.pincode} />
        </Field>
      </Section>

      <Section title="Employment">
        <Field label="Department" name="department" error={errors.department}>
          <Input
            id="department"
            name="department"
            defaultValue={defaults.department}
            required
          />
        </Field>
        <Field
          label="Designation"
          name="designation"
          error={errors.designation}
        >
          <Input
            id="designation"
            name="designation"
            defaultValue={defaults.designation}
            required
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="managerId">Manager</Label>
            <div className="flex items-center gap-2">
              <input
                id="isFresher"
                name="isFresher"
                type="checkbox"
                checked={isFresher}
                onChange={(event) => {
                  setIsFresher(event.target.checked);
                  // An experienced hire starts with one company to fill in.
                  if (!event.target.checked && previousRows.length === 0) {
                    setPreviousRows([newRow()]);
                  }
                }}
                className="size-4"
              />
              <Label htmlFor="isFresher">Fresher</Label>
            </div>
          </div>
          <select
            id="managerId"
            name="managerId"
            className={selectClass}
            defaultValue={defaults.managerId ?? ""}
          >
            <option value="">—</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.empId} — {manager.name}
              </option>
            ))}
          </select>
          {errors.managerId && (
            <p className="text-xs text-red-600">{errors.managerId[0]}</p>
          )}
        </div>
        <Field
          label="Date of joining"
          name="dateOfJoining"
          error={errors.dateOfJoining}
          className="sm:col-start-1"
        >
          <Input
            id="dateOfJoining"
            name="dateOfJoining"
            type="date"
            defaultValue={defaults.dateOfJoining}
            onChange={(event) => {
              setJoiningDate(event.target.value);
              if (!typeEndTouched && typeEndBase === "joining") {
                setTypeEndDate(defaultTypeEnd(event.target.value));
              }
            }}
            required
          />
        </Field>
        <Field label="Employment type" name="empType" error={errors.empType}>
          <select
            id="empType"
            name="empType"
            className={selectClass}
            value={empType}
            onChange={(event) => {
              // A new type starts from the default end date.
              setEmpType(event.target.value);
              setTypeEndDate(defaultTypeEnd(joiningDate));
              setTypeEndTouched(false);
            }}
          >
            <option value="INTERN">Intern</option>
            <option value="PROBATION">Probation</option>
            <option value="PERMANENT">Permanent</option>
            <option value="CONTRACT">Contract</option>
          </select>
        </Field>
        {typeEndLabel && (
          <Field
            label={typeEndLabel}
            name="typeEndDate"
            error={errors.typeEndDate}
          >
            <Input
              id="typeEndDate"
              name="typeEndDate"
              type="date"
              value={typeEndDate}
              min={joiningDate || undefined}
              onChange={(event) => {
                setTypeEndDate(event.target.value);
                setTypeEndTouched(true);
              }}
              required
            />
          </Field>
        )}
        {!isFresher && (
          <>
            <Field
              label="LinkedIn ID"
              name="linkedinId"
              error={errors.linkedinId}
              className="sm:col-start-1"
            >
              <Input
                id="linkedinId"
                name="linkedinId"
                defaultValue={defaults.linkedinId}
              />
            </Field>
            <PreviousCompanies
              rows={previousRows}
              errors={errors}
              onAdd={() => setPreviousRows((rows) => [...rows, newRow()])}
              onRemove={(key) =>
                setPreviousRows((rows) => rows.filter((row) => row.key !== key))
              }
            />
          </>
        )}
      </Section>

      <Section title="Statutory & bank (stored encrypted)">
        <Field label="PAN" name="pan" error={errors.pan}>
          <Input
            id="pan"
            name="pan"
            placeholder={sensitivePlaceholder(masks.pan)}
            autoComplete="off"
          />
        </Field>
        <Field label="Aadhaar" name="aadhaar" error={errors.aadhaar}>
          <Input
            id="aadhaar"
            name="aadhaar"
            placeholder={sensitivePlaceholder(masks.aadhaar)}
            autoComplete="off"
          />
        </Field>
        <Field label="PF number" name="pfNumber" error={errors.pfNumber}>
          <Input
            id="pfNumber"
            name="pfNumber"
            defaultValue={defaults.pfNumber}
          />
        </Field>
        <Field label="UAN number" name="uanNumber" error={errors.uanNumber}>
          <Input
            id="uanNumber"
            name="uanNumber"
            defaultValue={defaults.uanNumber}
          />
        </Field>
        <Field
          label="Bank account number"
          name="bankAccount"
          error={errors.bankAccount}
        >
          <Input
            id="bankAccount"
            name="bankAccount"
            placeholder={sensitivePlaceholder(masks.bankAccount)}
            autoComplete="off"
          />
        </Field>
        <Field label="IFSC" name="ifsc" error={errors.ifsc}>
          <Input
            id="ifsc"
            name="ifsc"
            placeholder={sensitivePlaceholder(masks.ifsc)}
            autoComplete="off"
          />
        </Field>
      </Section>

      <Section title="Documents">
        <Field label="Passport-size photo" name="photo" error={errors.photo}>
          <Input id="photo" name="photo" type="file" accept="image/*" />
        </Field>
        <Field label="PAN upload" name="panDoc" error={errors.panDoc}>
          <Input id="panDoc" name="panDoc" type="file" accept="image/*,.pdf" />
        </Field>
        <Field
          label="Aadhaar upload"
          name="aadhaarDoc"
          error={errors.aadhaarDoc}
        >
          <Input
            id="aadhaarDoc"
            name="aadhaarDoc"
            type="file"
            accept="image/*,.pdf"
          />
        </Field>
      </Section>

      {state.error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
