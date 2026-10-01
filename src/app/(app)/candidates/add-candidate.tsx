"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
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
      setFormKey((previousKey) => previousKey + 1);
      return {};
    }
    return result;
  }, {});

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" />}>
        Add candidate
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full data-[side=right]:w-full sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>Add candidate</SheetTitle>
          <SheetDescription>
            For referrals, walk-ins and other applications outside the career
            form.
          </SheetDescription>
        </SheetHeader>

        <ValidatedForm
          key={formKey}
          action={formAction}
          fieldErrors={state.fieldErrors}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 text-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" name="firstName">
              <Input id="firstName" name="firstName" required />
            </FormField>
            <FormField label="Last name" name="lastName">
              <Input id="lastName" name="lastName" />
            </FormField>
            <FormField label="Email" name="email">
              <Input id="email" name="email" type="email" />
            </FormField>
            <FormField
              label="Mobile"
              name="mobileNumber"
            >
              <Input id="mobileNumber" name="mobileNumber" type="tel" />
            </FormField>
            <FormField label="Type" name="position">
              <select
                id="position"
                name="position"
                defaultValue={POSITIONS[0]}
                className={selectClass}
              >
                {POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Role" name="jobRole">
              <Input id="jobRole" name="jobRole" />
            </FormField>
            <FormField label="Location" name="location">
              <Input id="location" name="location" />
            </FormField>
            <FormField label="Status" name="status">
              <select
                id="status"
                name="status"
                defaultValue="New"
                className={selectClass}
              >
                {CANDIDATE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField label="Portfolio" name="portfolio">
            <Input
              id="portfolio"
              name="portfolio"
              type="url"
              placeholder="https://"
            />
          </FormField>
          <FormField
            label="Resume (PDF, DOC, DOCX · max 4 MB)"
            name="resume"
          >
            <Input
              id="resume"
              name="resume"
              type="file"
              accept=".pdf,.doc,.docx"
            />
          </FormField>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add candidate"}
            </Button>
            <FormMessage error={state.error} />
          </div>
        </ValidatedForm>
      </SheetContent>
    </Sheet>
  );
}
