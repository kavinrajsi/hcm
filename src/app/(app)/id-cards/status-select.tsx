"use client";

import { useRef, useTransition } from "react";
import { updateIdCardStatus } from "./actions";

const STATUSES = [
  ["PHOTO_TAKEN", "Photo Taken"],
  ["CORRECTION", "Correction"],
  ["PENDING", "Pending"],
  ["ISSUED", "Issued"],
  ["RETURN_PENDING", "Return Pending"],
  ["RETURNED", "Returned"],
] as const;

export function IdCardStatusSelect({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={updateIdCardStatus}
      className="w-full md:w-auto"
    >
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        aria-label="ID card status"
        defaultValue={status}
        disabled={pending}
        onChange={() => startTransition(() => formRef.current?.requestSubmit())}
        className="h-10 w-full rounded-md border border-input bg-transparent px-2 text-base disabled:opacity-50 md:h-8 md:w-auto md:text-sm dark:bg-input/30"
      >
        {STATUSES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </form>
  );
}
