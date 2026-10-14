"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon, Share2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Option } from "@/lib/dashboard/sources";
import { cn } from "@/lib/utils";
import { createDashboard, deleteDashboard, moveDashboard, renameDashboard, setShares, shareOptions } from "./actions";

// Dashboard tabs: one per dashboard, then any shared with you. In edit mode
// the active tab can be renamed, moved, deleted or shared, and new ones added.

export type TabItem = { id: string; name: string; href: string; sharedBy?: string };

export function DashboardTabs({
  tabs,
  activeId,
  editing,
  defaultsRole,
  canShare,
}: {
  tabs: TabItem[];
  activeId: string;
  editing: boolean;
  /** Set when HR is editing a role's defaults. */
  defaultsRole: string | null;
  canShare: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState<"new" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [sharing, setSharing] = useState(false);
  const active = tabs.find((tab) => tab.id === activeId);
  const own = tabs.filter((tab) => !tab.sharedBy);
  const index = own.findIndex((tab) => tab.id === activeId);

  function go(id: string | undefined) {
    const query = new URLSearchParams();
    if (editing) query.set("edit", "1");
    if (defaultsRole) query.set("defaults", defaultsRole);
    if (id) query.set("tab", id);
    router.push(`/?${query}`);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string; id?: string }>, then?: (id?: string) => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setError(result.error ?? "Something went wrong.");
      setNaming(null);
      if (then) then(result.id);
      else router.refresh();
    });
  }

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Dashboards" className="flex max-w-full items-center gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={tab.id === activeId ? "page" : undefined}
              className={cn(
                "-mb-px flex min-h-10 shrink-0 items-center border-b-2 px-3 text-sm whitespace-nowrap",
                tab.id === activeId ? "border-foreground font-medium" : "border-transparent text-zinc-500 hover:text-foreground",
              )}
            >
              {tab.name}
              {tab.sharedBy && <span className="ml-1.5 text-xs font-normal text-zinc-400">· {tab.sharedBy}</span>}
            </Link>
          ))}
        </nav>
        {editing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setName("");
              setNaming("new");
            }}
          >
            <PlusIcon /> New dashboard
          </Button>
        )}
      </div>

      {editing && active && !active.sharedBy && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setName(active.name);
              setNaming("rename");
            }}
          >
            <PencilIcon /> Rename
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Move this tab left"
            disabled={pending || index <= 0}
            onClick={() => run(() => moveDashboard(activeId, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Move this tab right"
            disabled={pending || index < 0 || index >= own.length - 1}
            onClick={() => run(() => moveDashboard(activeId, 1))}
          >
            <ChevronRightIcon />
          </Button>
          {canShare && (
            <Button type="button" variant="outline" size="sm" onClick={() => setSharing(true)}>
              <Share2Icon /> Share
            </Button>
          )}
          {own.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => deleteDashboard(activeId), () => go(own.find((tab) => tab.id !== activeId)?.id))}
            >
              <Trash2Icon /> Delete dashboard
            </Button>
          )}
        </div>
      )}

      {naming && (
        <form
          className="mt-3 flex max-w-md flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (naming === "new") run(() => createDashboard({ name, defaults: defaultsRole }), (id) => go(id));
            else run(() => renameDashboard(activeId, name));
          }}
        >
          <Input
            autoFocus
            aria-label="Dashboard name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Hiring"
            maxLength={60}
            className="min-w-0 flex-1"
          />
          <Button type="submit" size="sm" disabled={pending}>
            {naming === "new" ? "Create" : "Save"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setNaming(null)}>
            Cancel
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {canShare && active && <ShareSheet open={sharing} onOpenChange={setSharing} dashboardId={active.id} name={active.name} />}
    </div>
  );
}

function ShareSheet({
  open,
  onOpenChange,
  dashboardId,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  name: string;
}) {
  const router = useRouter();
  const [people, setPeople] = useState<Option[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Who can see it now, loaded each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    shareOptions(dashboardId)
      .then((result) => {
        if (cancelled) return;
        setPeople(result.people);
        setPicked(result.sharedWith);
      })
      .catch(() => !cancelled && setError("Couldn't load people."));
    return () => {
      cancelled = true;
    };
  }, [open, dashboardId]);

  const shown = (people ?? []).filter((person) => person.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setPeople(null);
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Share “{name}”</SheetTitle>
          <SheetDescription>
            They can view it, not change it. Each person sees only the data their own access allows.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people" />
          {people === null ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {shown.map((person) => (
                <li key={person.value}>
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={picked.includes(person.value)}
                      onChange={() =>
                        setPicked((current) =>
                          current.includes(person.value) ? current.filter((id) => id !== person.value) : [...current, person.value],
                        )
                      }
                    />
                    {person.label}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || people === null}
            onClick={() =>
              startTransition(async () => {
                const result = await setShares(dashboardId, picked);
                if (!result.ok) return setError(result.error);
                onOpenChange(false);
                setPeople(null);
                router.refresh();
              })
            }
          >
            {pending ? "Saving…" : `Share with ${picked.length} ${picked.length === 1 ? "person" : "people"}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
