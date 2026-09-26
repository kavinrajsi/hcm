"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { markExit, type ExitFormState } from "./actions";

type Employee = { id: string; empId: string; name: string };

/** Phones: searchable bottom-sheet picker instead of a long native select. */
function EmployeePicker({
  employees,
  selected,
  onSelect,
}: {
  employees: Employee[];
  selected: Employee | undefined;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q
    ? employees.filter(
        (e) =>
          e.name.toLowerCase().includes(q) || e.empId.toLowerCase().includes(q),
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
        id="employeePicker"
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
      {/* Tall on phones: covers the Record exit sheet, steady while typing. */}
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
            onChange={(e) => setQuery(e.target.value)}
            className="h-11"
          />
          <ul className="max-h-[55dvh] overflow-y-auto overscroll-contain">
            {matches.length === 0 && (
              <li className="py-8 text-center text-zinc-500">No match.</li>
            )}
            {matches.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(e.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-muted",
                    selected?.id === e.id && "bg-muted font-medium",
                  )}
                >
                  <span className="w-16 shrink-0 text-sm text-zinc-500 tabular-nums">
                    {e.empId}
                  </span>
                  <span className="truncate">{e.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ExitForm({ activeEmployees }: { activeEmployees: Employee[] }) {
  const [state, formAction, pending] = useActionState<ExitFormState, FormData>(
    markExit,
    {},
  );
  // Shared by the phone picker and the desktop select. An employee who has
  // just exited drops out of the list, which clears the selection.
  const [selectedId, setSelectedId] = useState("");
  const selected = activeEmployees.find((e) => e.id === selectedId);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 md:flex-row md:flex-wrap md:items-end dark:border-zinc-800"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="employeeId"
          className="hidden text-sm font-medium md:block"
        >
          Employee
        </label>
        <label
          htmlFor="employeePicker"
          className="text-sm font-medium md:hidden"
        >
          Employee
        </label>
        <input type="hidden" name="employeeId" value={selected?.id ?? ""} />
        <div className="md:hidden">
          <EmployeePicker
            employees={activeEmployees}
            selected={selected}
            onSelect={setSelectedId}
          />
        </div>
        <select
          id="employeeId"
          value={selected?.id ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="hidden h-9 w-64 rounded-md border border-input bg-transparent px-2 text-sm md:block dark:bg-input/30"
        >
          <option value="">Select employee…</option>
          {activeEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.empId} — {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="dateOfExit" className="text-sm font-medium">
          Date of exit
        </label>
        <Input
          id="dateOfExit"
          name="dateOfExit"
          type="date"
          required
          className="md:w-44"
        />
      </div>
      <Button type="submit" disabled={pending || !selected}>
        {pending ? "Recording…" : "Record exit"}
      </Button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-green-600">
          Exit recorded — ID card flagged for return.
        </p>
      )}
    </form>
  );
}
