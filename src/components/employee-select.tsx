"use client";

import { useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Searchable employee picker: a bottom sheet with a search box on phones, a
// type-to-filter combobox on desktop. Both drive one hidden form field.

export type Employee = { id: string; empId: string; name: string };

/** Phones: searchable bottom-sheet picker instead of a long native select. */
function EmployeePicker({
  id,
  employees,
  selected,
  onSelect,
}: {
  id: string;
  employees: Employee[];
  selected: Employee | undefined;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchQuery = query.trim().toLowerCase();
  const matches = searchQuery
    ? employees.filter(
        (employee) =>
          employee.name.toLowerCase().includes(searchQuery) ||
          employee.empId.toLowerCase().includes(searchQuery),
      )
    : employees;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <SheetTrigger
        id={id}
        className={cn(
          "flex h-10 w-full items-center rounded-md border border-input bg-transparent px-3 text-left text-base dark:bg-input/30",
          !selected && "text-muted-foreground",
        )}
      >
        <span className="truncate">
          {selected
            ? `${selected.empId} — ${selected.name}`
            : "Select employee…"}
        </span>
      </SheetTrigger>
      {/* Tall: covers any sheet it opens from, and stays steady while typing. */}
      <SheetContent side="bottom" className="min-h-[85dvh]">
        <SheetHeader>
          <SheetTitle>Select employee</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4">
          <Input
            type="search"
            autoFocus
            placeholder="Search name or Emp ID…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11"
          />
          <ul className="max-h-[55dvh] overflow-y-auto overscroll-contain">
            {matches.length === 0 && (
              <li className="py-8 text-center text-zinc-500">No match.</li>
            )}
            {matches.map((employee) => (
              <li key={employee.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(employee.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-muted",
                    selected?.id === employee.id && "bg-muted font-medium",
                  )}
                >
                  <span className="w-16 shrink-0 text-sm text-zinc-500 tabular-nums">
                    {employee.empId}
                  </span>
                  <span className="truncate">{employee.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const employeeLabel = (employee: Employee) =>
  `${employee.empId} — ${employee.name}`;

/** Desktop: type to filter by name or Emp ID, then pick from the list. */
function EmployeeCombobox({
  id,
  employees,
  selected,
  onSelect,
}: {
  id: string;
  employees: Employee[];
  selected: Employee | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <Combobox.Root
      items={employees}
      value={selected ?? null}
      onValueChange={(employee: Employee | null) =>
        onSelect(employee?.id ?? "")
      }
      itemToStringLabel={employeeLabel}
      isItemEqualToValue={(left: Employee, right: Employee) =>
        left.id === right.id
      }
    >
      <Combobox.Input
        id={id}
        placeholder="Search name or Emp ID…"
        className="h-9 w-64 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
      />
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} align="start" className="z-50">
          <Combobox.Popup className="max-h-72 w-(--anchor-width) min-w-64 overflow-y-auto rounded-md border border-zinc-200 bg-popover p-1 text-sm text-popover-foreground shadow-md dark:border-zinc-800">
            <Combobox.Empty className="px-2 py-3 text-center text-zinc-500 empty:hidden">
              No match.
            </Combobox.Empty>
            <Combobox.List>
              {(employee: Employee) => (
                <Combobox.Item
                  key={employee.id}
                  value={employee}
                  className="flex cursor-default items-center gap-3 rounded px-2 py-1.5 outline-none select-none data-highlighted:bg-muted data-selected:font-medium"
                >
                  <span className="w-16 shrink-0 text-xs text-zinc-500 tabular-nums">
                    {employee.empId}
                  </span>
                  <span className="truncate">{employee.name}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

/**
 * Label with htmlFor={`${id}-phone`} on phones and {`${id}-desktop`} on
 * desktop; the selected id is posted as `name`.
 */
export function EmployeeSelect({
  id,
  name,
  employees,
  selectedId,
  onSelect,
}: {
  id: string;
  name: string;
  employees: Employee[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = employees.find((employee) => employee.id === selectedId);
  return (
    <>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <div className="md:hidden">
        <EmployeePicker
          id={`${id}-phone`}
          employees={employees}
          selected={selected}
          onSelect={onSelect}
        />
      </div>
      <div className="hidden md:block">
        <EmployeeCombobox
          id={`${id}-desktop`}
          employees={employees}
          selected={selected}
          onSelect={onSelect}
        />
      </div>
    </>
  );
}
