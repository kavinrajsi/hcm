"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getConvertedEmployee } from "./actions";

type Converted = { id: string; empId: string; name: string };

/**
 * Details drawer: "Convert to employee" once a candidate reaches Offer,
 * or a link to the employee they were already converted to.
 */
export function ConvertToEmployee({
  candidateId,
  status,
}: {
  candidateId: string;
  status: string;
}) {
  // undefined = still loading; null = not converted.
  const [converted, setConverted] = useState<Converted | null | undefined>();

  useEffect(() => {
    let cancelled = false;
    getConvertedEmployee(candidateId).then(
      (employee) => !cancelled && setConverted(employee),
      () => !cancelled && setConverted(null),
    );
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  if (converted === undefined) return null;
  if (converted) {
    return (
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
        Converted to{" "}
        <Link
          href={`/employees/${converted.id}`}
          className="font-medium underline underline-offset-4"
        >
          {converted.empId} — {converted.name}
        </Link>
      </div>
    );
  }
  if (status !== "Offer") return null;
  return (
    <Link
      href={`/employees/new?candidate=${candidateId}`}
      className={buttonVariants({ className: "mb-4 w-full md:w-auto" })}
    >
      Convert to employee
    </Link>
  );
}
