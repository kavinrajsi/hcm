"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { istDayKey } from "@/lib/format-date";
import type { OpenTodo } from "@/lib/basecamp-todo-counts";
import { loadOpenTodos } from "./actions";


const formatDue = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** The avatar opens a bottom sheet of that person's open Basecamp to-dos. */
export function PersonTodos({
  employeeId,
  name,
  children,
}: {
  employeeId: string;
  name: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<
    { todos: OpenTodo[] } | { error: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const show = () => {
    setOpen(true);
    setResult(null);
    startTransition(async () => setResult(await loadOpenTodos(employeeId)));
  };
  const today = istDayKey(new Date());
  const overdueCount =
    result && "todos" in result
      ? result.todos.filter((todo) => todo.dueOn !== null && todo.dueOn < today)
          .length
      : 0;

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={`Open to-dos for ${name}`}
        className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {children}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85vh] w-full max-w-3xl gap-0 rounded-t-xl"
        >
          <SheetHeader>
            <SheetTitle>{name}</SheetTitle>
            <SheetDescription>
              {result && "todos" in result ? (
                <>
                  {result.todos.length} open Basecamp to-dos
                  {overdueCount > 0 && (
                    <>
                      {" · "}
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {overdueCount} overdue
                      </span>
                    </>
                  )}
                  {" · soonest due first"}
                </>
              ) : (
                "Open Basecamp to-dos"
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            {pending || !result ? (
              <p className="py-8 text-center text-zinc-500">Loading…</p>
            ) : "error" in result ? (
              <p className="py-8 text-center text-zinc-500">{result.error}</p>
            ) : result.todos.length === 0 ? (
              <p className="py-8 text-center text-zinc-500">
                No open to-dos.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {result.todos.map((todo) => {
                  const overdue = todo.dueOn !== null && todo.dueOn < today;
                  return (
                    <li
                      key={todo.id}
                      className={cn(
                        "flex items-start justify-between gap-3 py-2.5",
                        overdue && "border-l-2 border-l-red-500 pl-2",
                      )}
                    >
                      <div className="min-w-0">
                        <a
                          href={todo.url}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "inline-flex items-start gap-1 font-medium underline-offset-4 hover:underline",
                            overdue && "text-red-600 dark:text-red-400",
                          )}
                        >
                          {todo.title}
                          <ExternalLink className="mt-0.5 size-3 shrink-0 text-zinc-400" />
                        </a>
                        <p className="truncate text-xs text-zinc-500">
                          {todo.project}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-xs tabular-nums",
                          overdue
                            ? "font-medium text-red-600 dark:text-red-400"
                            : "text-zinc-500",
                        )}
                      >
                        {todo.dueOn
                          ? `${overdue ? "Overdue · " : ""}${formatDue(todo.dueOn)}`
                          : "No date"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
