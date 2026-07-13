"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { useRef } from "react";

// URL-driven filter bar shared by Onboarding, Exit, Employees, Freelance.
// Filters live in searchParams so the Server Component page does the actual
// DB-side WHERE — this component only writes the URL.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function TableFilters({
  typeOptions,
  typeLabel = "Type",
}: {
  typeOptions?: { value: string; label: string }[];
  typeLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page"); // any filter change resets pagination
    router.replace(`${pathname}?${params.toString()}`);
  }

  function setSearchDebounced(value: string) {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam("q", value), 300);
  }

  const selectClass =
    "h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        placeholder="Search by name…"
        defaultValue={searchParams.get("q") ?? ""}
        onChange={(e) => setSearchDebounced(e.target.value)}
        className="w-56"
      />
      <select
        aria-label="Day"
        className={selectClass}
        defaultValue={searchParams.get("day") ?? ""}
        onChange={(e) => setParam("day", e.target.value)}
      >
        <option value="">Day</option>
        {Array.from({ length: 31 }, (_, i) => (
          <option key={i + 1} value={String(i + 1)}>
            {i + 1}
          </option>
        ))}
      </select>
      <select
        aria-label="Month"
        className={selectClass}
        defaultValue={searchParams.get("month") ?? ""}
        onChange={(e) => setParam("month", e.target.value)}
      >
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1)}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label="Year"
        className={selectClass}
        defaultValue={searchParams.get("year") ?? ""}
        onChange={(e) => setParam("year", e.target.value)}
      >
        <option value="">Year</option>
        {Array.from({ length: 10 }, (_, i) => {
          const y = new Date().getFullYear() - i;
          return (
            <option key={y} value={String(y)}>
              {y}
            </option>
          );
        })}
      </select>
      {typeOptions && (
        <select
          aria-label={typeLabel}
          className={selectClass}
          defaultValue={searchParams.get("type") ?? ""}
          onChange={(e) => setParam("type", e.target.value)}
        >
          <option value="">{typeLabel}</option>
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
