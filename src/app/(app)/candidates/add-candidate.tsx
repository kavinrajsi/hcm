"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { createCandidate, type CandidateFormState } from "./actions";
import { POSITIONS } from "./query";
import { CANDIDATE_STATUSES } from "./statuses";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

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

/** "Add candidate" button + drawer form for HR-entered candidates. */
export function AddCandidate() {
  const [open, setOpen] = useState(false);
  // Bumped after a successful save so the next open starts with a blank form.
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState<
    CandidateFormState,
    FormData
  >(async (prev, formData) => {
    const result = await createCandidate(prev, formData);
    if (result.ok) {
      setOpen(false);
      setFormKey((k) => k + 1);
      return {};
    }
    return result;
  }, {});
  const errors = state.fieldErrors ?? {};

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" />}>
        Add candidate
      </SheetTrigger>
      <SheetContent side="right" className="w-full data-[side=right]:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add candidate</SheetTitle>
          <SheetDescription>
            For referrals, walk-ins and other applications outside the career
            form.
          </SheetDescription>
        </SheetHeader>

        <form
          key={formKey}
          action={formAction}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" name="firstName" error={errors.firstName}>
              <Input id="firstName" name="firstName" required />
            </Field>
            <Field label="Last name" name="lastName" error={errors.lastName}>
              <Input id="lastName" name="lastName" />
            </Field>
            <Field label="Email" name="email" error={errors.email}>
              <Input id="email" name="email" type="email" />
            </Field>
            <Field
              label="Mobile"
              name="mobileNumber"
              error={errors.mobileNumber}
            >
              <Input id="mobileNumber" name="mobileNumber" type="tel" />
            </Field>
            <Field label="Type" name="position" error={errors.position}>
              <select
                id="position"
                name="position"
                defaultValue={POSITIONS[0]}
                className={selectClass}
              >
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Role" name="jobRole" error={errors.jobRole}>
              <Input id="jobRole" name="jobRole" />
            </Field>
            <Field label="Location" name="location" error={errors.location}>
              <Input id="location" name="location" />
            </Field>
            <Field label="Status" name="status" error={errors.status}>
              <select
                id="status"
                name="status"
                defaultValue="New"
                className={selectClass}
              >
                {CANDIDATE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Portfolio" name="portfolio" error={errors.portfolio}>
            <Input
              id="portfolio"
              name="portfolio"
              type="url"
              placeholder="https://"
            />
          </Field>
          <Field
            label="Resume (PDF, DOC, DOCX · max 4 MB)"
            name="resume"
            error={errors.resume}
          >
            <Input
              id="resume"
              name="resume"
              type="file"
              accept=".pdf,.doc,.docx"
            />
          </Field>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add candidate"}
            </Button>
            {state.error && <p className="text-red-600">{state.error}</p>}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
