"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TuneIcon } from "@/components/icons";
import { useRef, useState } from "react";

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
  dateFilters = true,
  searchPlaceholder = "Search by name…",
}: {
  typeOptions?: { value: string; label: string }[];
  typeLabel?: string;
  dateFilters?: boolean;
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // Controlled: Base UI warns if an uncontrolled input's defaultValue
  // changes, which happens every time the debounced search rewrites ?q.
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

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

  const active = (dateFilters ? ["day", "month", "year"] : [])
    .concat(typeOptions ? ["type"] : [])
    .filter((k) => searchParams.get(k)).length;

  // Rendered twice (inline on desktop, in a sheet on phones); only one is
  // visible, and both just write the URL.
  const selects = (
    <>
      {dateFilters && (
        <>
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
        </>
      )}
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
    </>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setSearchDebounced(e.target.value);
        }}
        className="h-10 min-w-0 flex-1 md:h-8 md:w-56 md:flex-none"
      />
      <div className="hidden md:contents">{selects}</div>
      {(dateFilters || typeOptions) && (
        <Sheet>
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="outline"
                className="h-10 md:hidden"
              />
            }
          >
            <TuneIcon className="size-5" />
            Filters
            {active > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-[11px] text-background">
                {active}
              </span>
            )}
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-4 [&_select]:h-11 [&_select]:w-full">
              {selects}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
