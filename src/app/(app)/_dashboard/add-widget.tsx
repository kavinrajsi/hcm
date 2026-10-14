"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { addWidget, removeCatalogWidget } from "./actions";

// Dashboard: the catalogue — ready-made widgets, plus any HR added — and the
// way into the builder for anything else.

export type CatalogItem = {
  id: string;
  title: string;
  description: string;
  group: string;
  /** Added by HR from a custom widget (removable by HR). */
  published?: boolean;
};

export function AddWidget({
  dashboardId,
  items,
  isHr,
  onBuild,
}: {
  dashboardId: string;
  items: CatalogItem[];
  isHr: boolean;
  onBuild: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = [...new Set(items.map((item) => item.group))];

  function add(item: CatalogItem) {
    setBusyId(item.id);
    setError(null);
    startTransition(async () => {
      const result = await addWidget(dashboardId, item.published ? { catalogWidgetId: item.id } : { catalogId: item.id });
      setBusyId(null);
      if (!result.ok) return setError(result.error);
      setOpen(false);
      router.refresh();
    });
  }

  function remove(item: CatalogItem) {
    setBusyId(item.id);
    startTransition(async () => {
      await removeCatalogWidget(item.id);
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <PlusIcon /> Add widget
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Add a widget</SheetTitle>
            <SheetDescription>Pick a ready-made one, or build your own from any data you can see.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-6 px-4 pb-6">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onBuild();
              }}
              className="flex items-center gap-3 rounded-lg border border-dashed border-zinc-300 p-4 text-left hover:border-zinc-500 dark:border-zinc-700"
            >
              <PlusIcon className="size-5 shrink-0" />
              <span>
                <span className="block font-medium">Build your own</span>
                <span className="block text-sm text-zinc-500">Choose the data, how to split it, filters, dates and a chart.</span>
              </span>
            </button>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            {groups.map((group) => (
              <section key={group}>
                <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{group}</h3>
                <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {items
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <li key={item.id} className="flex items-center gap-3 p-3">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{item.title}</span>
                          <span className="block text-sm text-zinc-500">{item.description}</span>
                        </span>
                        {isHr && item.published && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${item.title} from the catalogue`}
                            title="Remove from the catalogue"
                            disabled={pending}
                            onClick={() => remove(item)}
                          >
                            <Trash2Icon />
                          </Button>
                        )}
                        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => add(item)}>
                          {busyId === item.id ? "Adding…" : "Add"}
                        </Button>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
