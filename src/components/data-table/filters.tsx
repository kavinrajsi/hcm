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
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function TableFilters({
  typeOptions,
  typeLabel = "Type",
  dateFilters = true,
  searchPlaceholder = "Search by name…",
  mobileSummary = false,
}: {
  typeOptions?: { value: string; label: string }[];
  typeLabel?: string;
  dateFilters?: boolean;
  searchPlaceholder?: string;
  /** Phones: one "All types, Anyone · Filter" line instead of the search bar. */
  mobileSummary?: boolean;
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
    .filter((paramKey) => searchParams.get(paramKey)).length;

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
            onChange={(event) => setParam("day", event.target.value)}
          >
            <option value="">Day</option>
            {Array.from({ length: 31 }, (_, dayIndex) => (
              <option key={dayIndex + 1} value={String(dayIndex + 1)}>
                {dayIndex + 1}
              </option>
            ))}
          </select>
          <select
            aria-label="Month"
            className={selectClass}
            defaultValue={searchParams.get("month") ?? ""}
            onChange={(event) => setParam("month", event.target.value)}
          >
            <option value="">Month</option>
            {MONTHS.map((monthName, monthIndex) => (
              <option key={monthName} value={String(monthIndex + 1)}>
                {monthName}
              </option>
            ))}
          </select>
          <select
            aria-label="Year"
            className={selectClass}
            defaultValue={searchParams.get("year") ?? ""}
            onChange={(event) => setParam("year", event.target.value)}
          >
            <option value="">Year</option>
            {Array.from({ length: 10 }, (_, yearOffset) => {
              const year = new Date().getFullYear() - yearOffset;
              return (
                <option key={year} value={String(year)}>
                  {year}
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
          onChange={(event) => setParam("type", event.target.value)}
        >
          <option value="">{typeLabel}</option>
          {typeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </>
  );

  const searchInput = (className: string) => (
    <Input
      type="search"
      placeholder={searchPlaceholder}
      value={search}
      onChange={(event) => {
        setSearch(event.target.value);
        setSearchDebounced(event.target.value);
      }}
      className={className}
    />
  );

  if (mobileSummary) {
    const type = searchParams.get("type");
    const searchQuery = searchParams.get("q");
    const summary = [
      type
        ? (typeOptions?.find((option) => option.value === type)?.label ?? type)
        : `All ${typeLabel.toLowerCase()}s`,
      dateFilters &&
        ["day", "month", "year"]
          .map((paramKey) => searchParams.get(paramKey))
          .filter(Boolean)
          .join("/"),
      searchQuery ? `“${searchQuery}”` : "Anyone",
    ]
      .filter(Boolean)
      .join(", ");

    return (
      <>
        <div className="flex items-center justify-between gap-3 md:hidden">
          <p className="min-w-0 truncate">{summary}</p>
          <Sheet>
            <SheetTrigger
              render={
                <button
                  type="button"
                  className="min-h-10 shrink-0 text-blue-600 underline underline-offset-4 dark:text-blue-400"
                />
              }
            >
              Filter
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <SheetHeader>
                <SheetTitle>Filter</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-3 px-4 [&_select]:h-11 [&_select]:w-full">
                {searchInput("h-11")}
                {selects}
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {searchInput("h-8 w-56")}
          {selects}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {searchInput("h-10 min-w-0 flex-1 md:h-8 md:w-56 md:flex-none")}
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
