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
    <form ref={formRef} action={updateIdCardStatus}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        disabled={pending}
        onChange={() =>
          startTransition(() => formRef.current?.requestSubmit())
        }
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-50 dark:bg-input/30"
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
