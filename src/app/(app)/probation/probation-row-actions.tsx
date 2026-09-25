"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmProbation, extendProbation } from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      disabled={pending}
      className="h-10 w-full md:h-7 md:w-auto"
    >
      {pending ? "…" : label}
    </Button>
  );
}

export function ProbationRowActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [extending, setExtending] = useState(false);

  if (status === "CONFIRMED") return null;

  if (extending) {
    return (
      <form
        action={extendProbation}
        className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center"
      >
        <input type="hidden" name="id" value={id} />
        <Input
          name="extendedTo"
          type="date"
          required
          aria-label="Extend to"
          className="md:h-8 md:w-38"
        />
        <Input name="notes" placeholder="Reason" className="md:h-8 md:w-36" />
        <div className="flex items-center gap-2">
          <div className="flex-1 md:flex-none">
            <SubmitButton label="Save" />
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-10 flex-1 md:h-7 md:flex-none"
            onClick={() => setExtending(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex w-full items-center gap-2 md:w-auto">
      <form action={confirmProbation} className="flex-1 md:flex-none">
        <input type="hidden" name="id" value={id} />
        <SubmitButton label="Confirm" />
      </form>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-10 flex-1 md:h-7 md:flex-none"
        onClick={() => setExtending(true)}
      >
        Extend
      </Button>
    </div>
  );
}
