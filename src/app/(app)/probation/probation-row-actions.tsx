"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmProbation, extendProbation } from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
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
      <form action={extendProbation} className="flex items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <Input name="extendedTo" type="date" required className="h-8 w-38" />
        <Input name="notes" placeholder="Reason" className="h-8 w-36" />
        <SubmitButton label="Save" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setExtending(false)}
        >
          Cancel
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <form action={confirmProbation}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton label="Confirm" />
      </form>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setExtending(true)}
      >
        Extend
      </Button>
    </div>
  );
}
