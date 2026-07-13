"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EmployeeFormState } from "./actions";

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
  isFresher: boolean;
  pfNumber: string;
  uanNumber: string;
  linkedinId: string;
  managerId: string;
}>;

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
  children,
}: {
  label: string;
  name: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
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

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

export function EmployeeForm({
  action,
  defaults = {},
  masks = {},
  managers = [],
  submitLabel,
}: {
  action: (
    prev: EmployeeFormState,
    formData: FormData,
  ) => Promise<EmployeeFormState>;
  defaults?: EmployeeDefaults;
  masks?: SensitiveMasks;
  managers?: { id: string; name: string; empId: string }[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [isFresher, setIsFresher] = useState(defaults.isFresher ?? true);
  const errors = state.fieldErrors ?? {};

  const sensitivePlaceholder = (mask?: string) =>
    mask ? `${mask} — enter to replace` : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Section title="Identity">
        <Field label="Employee ID" name="empId" error={errors.empId}>
          <Input id="empId" name="empId" defaultValue={defaults.empId} required />
        </Field>
        <Field label="Full name" name="name" error={errors.name}>
          <Input id="name" name="name" defaultValue={defaults.name} required />
        </Field>
        <Field label="Gender" name="gender" error={errors.gender}>
          <select id="gender" name="gender" className={selectClass} defaultValue={defaults.gender ?? ""}>
            <option value="">—</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Date of birth" name="dateOfBirth" error={errors.dateOfBirth}>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={defaults.dateOfBirth} />
        </Field>
        <Field label="Blood group" name="bloodGroup" error={errors.bloodGroup}>
          <Input id="bloodGroup" name="bloodGroup" defaultValue={defaults.bloodGroup} />
        </Field>
        <Field label="T-shirt size" name="tshirtSize" error={errors.tshirtSize}>
          <select id="tshirtSize" name="tshirtSize" className={selectClass} defaultValue={defaults.tshirtSize ?? ""}>
            <option value="">—</option>
            {["XS", "S", "M", "L", "XL", "XXL"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Phone" name="phone" error={errors.phone}>
          <Input id="phone" name="phone" type="tel" defaultValue={defaults.phone} required />
        </Field>
        <Field label="Personal email" name="personalEmail" error={errors.personalEmail}>
          <Input id="personalEmail" name="personalEmail" type="email" defaultValue={defaults.personalEmail} required />
        </Field>
        <Field label="Work email" name="workEmail" error={errors.workEmail}>
          <Input id="workEmail" name="workEmail" type="email" defaultValue={defaults.workEmail} required />
        </Field>
        <Field label="Emergency contact" name="emergencyContact" error={errors.emergencyContact}>
          <Input id="emergencyContact" name="emergencyContact" type="tel" defaultValue={defaults.emergencyContact} />
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
          <Input id="department" name="department" defaultValue={defaults.department} required />
        </Field>
        <Field label="Designation" name="designation" error={errors.designation}>
          <Input id="designation" name="designation" defaultValue={defaults.designation} required />
        </Field>
        <Field label="Date of joining" name="dateOfJoining" error={errors.dateOfJoining}>
          <Input id="dateOfJoining" name="dateOfJoining" type="date" defaultValue={defaults.dateOfJoining} required />
        </Field>
        <Field label="Employment type" name="empType" error={errors.empType}>
          <select id="empType" name="empType" className={selectClass} defaultValue={defaults.empType ?? "PROBATION"}>
            <option value="INTERN">Intern</option>
            <option value="PROBATION">Probation</option>
            <option value="PERMANENT">Permanent</option>
          </select>
        </Field>
        <Field label="PF number" name="pfNumber" error={errors.pfNumber}>
          <Input id="pfNumber" name="pfNumber" defaultValue={defaults.pfNumber} />
        </Field>
        <Field label="UAN number" name="uanNumber" error={errors.uanNumber}>
          <Input id="uanNumber" name="uanNumber" defaultValue={defaults.uanNumber} />
        </Field>
        <Field label="Manager" name="managerId" error={errors.managerId}>
          <select id="managerId" name="managerId" className={selectClass} defaultValue={defaults.managerId ?? ""}>
            <option value="">—</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.empId} — {m.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-2 pt-6">
          <input
            id="isFresher"
            name="isFresher"
            type="checkbox"
            checked={isFresher}
            onChange={(e) => setIsFresher(e.target.checked)}
            className="size-4"
          />
          <Label htmlFor="isFresher">Fresher</Label>
        </div>
      </Section>

      <Section title="Statutory & bank (stored encrypted)">
        <Field label="PAN" name="pan" error={errors.pan}>
          <Input id="pan" name="pan" placeholder={sensitivePlaceholder(masks.pan)} autoComplete="off" />
        </Field>
        <Field label="Aadhaar" name="aadhaar" error={errors.aadhaar}>
          <Input id="aadhaar" name="aadhaar" placeholder={sensitivePlaceholder(masks.aadhaar)} autoComplete="off" />
        </Field>
        <Field label="Bank account number" name="bankAccount" error={errors.bankAccount}>
          <Input id="bankAccount" name="bankAccount" placeholder={sensitivePlaceholder(masks.bankAccount)} autoComplete="off" />
        </Field>
        <Field label="IFSC" name="ifsc" error={errors.ifsc}>
          <Input id="ifsc" name="ifsc" placeholder={sensitivePlaceholder(masks.ifsc)} autoComplete="off" />
        </Field>
      </Section>

      <Section title="Documents">
        <Field label="Passport-size photo" name="photo" error={errors.photo}>
          <Input id="photo" name="photo" type="file" accept="image/*" />
        </Field>
        <Field label="PAN upload" name="panDoc" error={errors.panDoc}>
          <Input id="panDoc" name="panDoc" type="file" accept="image/*,.pdf" />
        </Field>
        <Field label="Aadhaar upload" name="aadhaarDoc" error={errors.aadhaarDoc}>
          <Input id="aadhaarDoc" name="aadhaarDoc" type="file" accept="image/*,.pdf" />
        </Field>
      </Section>

      {!isFresher && (
        <Section title="Experience (non-fresher)">
          <Field label="LinkedIn ID" name="linkedinId" error={errors.linkedinId}>
            <Input id="linkedinId" name="linkedinId" defaultValue={defaults.linkedinId} />
          </Field>
          <Field label="Offer letter" name="offerLetter" error={errors.offerLetter}>
            <Input id="offerLetter" name="offerLetter" type="file" accept=".pdf,image/*" />
          </Field>
          <Field label="Experience letter" name="experienceLetter" error={errors.experienceLetter}>
            <Input id="experienceLetter" name="experienceLetter" type="file" accept=".pdf,image/*" />
          </Field>
          <Field label="Relieving letter" name="relievingLetter" error={errors.relievingLetter}>
            <Input id="relievingLetter" name="relievingLetter" type="file" accept=".pdf,image/*" />
          </Field>
        </Section>
      )}

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
