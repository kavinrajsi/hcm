"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookPlusIcon, GripVerticalIcon, PencilIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SourceMeta } from "@/lib/dashboard/sources";
import { WIDGET_SIZES, sizeKey, type WidgetSize, type WidgetSpec } from "@/lib/dashboard/spec";
import { cn } from "@/lib/utils";
import { publishWidget, removeWidget, reorderWidgets, resizeWidget } from "./actions";
import { AddWidget, type CatalogItem } from "./add-widget";
import { WidgetBuilder, type BuilderTarget } from "./widget-builder";

// Dashboard grid: 4 columns on desktop, 2 on tablets, 1 on phones. In edit
// mode widgets drag to a new place (long-press on touch screens, Space then
// arrow keys on a keyboard), change size, and open in the builder.

export type GridWidget = {
  id: string;
  title: string;
  width: number;
  height: number;
  href: string | null;
  /** Saved spec for custom widgets; null for built-ins. */
  spec: WidgetSpec | null;
  content: React.ReactNode;
};

const WIDTH_CLASS: Record<number, string> = {
  1: "",
  2: "sm:col-span-2",
  4: "sm:col-span-2 lg:col-span-4",
};
const HEIGHT_CLASS: Record<number, string> = {
  1: "",
  2: "sm:row-span-2",
  3: "sm:row-span-3",
};

export function DashboardGrid({
  dashboardId,
  widgets: initial,
  editing,
  isHr,
  sources,
  catalog,
}: {
  dashboardId: string;
  widgets: GridWidget[];
  editing: boolean;
  isHr: boolean;
  sources: SourceMeta[];
  catalog: CatalogItem[];
}) {
  const router = useRouter();
  const [widgets, setWidgets] = useState(initial);
  // Re-sync when the server re-renders (refresh, add, edit…).
  const [previous, setPrevious] = useState(initial);
  if (previous !== initial) {
    setPrevious(initial);
    setWidgets(initial);
  }
  const [builder, setBuilder] = useState<BuilderTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Long-press on phones so the page still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = widgets.findIndex((widget) => widget.id === active.id);
    const to = widgets.findIndex((widget) => widget.id === over.id);
    const next = arrayMove(widgets, from, to);
    const snapshot = widgets;
    setWidgets(next);
    startTransition(async () => {
      const result = await reorderWidgets(dashboardId, next.map((widget) => widget.id));
      if (!result.ok) {
        setWidgets(snapshot);
        setError(result.error);
      }
    });
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, optimistic?: () => void) {
    setError(null);
    optimistic?.();
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  const cards = widgets.map((widget) => (
    <WidgetCard
      key={widget.id}
      widget={widget}
      editing={editing}
      isHr={isHr}
      onResize={(size) =>
        run(
          () => resizeWidget(widget.id, size),
          () =>
            setWidgets((current) =>
              current.map((item) => (item.id === widget.id ? { ...item, ...WIDGET_SIZES[size] } : item)),
            ),
        )
      }
      onRemove={() =>
        run(
          () => removeWidget(widget.id),
          () => setWidgets((current) => current.filter((item) => item.id !== widget.id)),
        )
      }
      onEdit={() => widget.spec && setBuilder({ mode: "edit", widgetId: widget.id, title: widget.title, spec: widget.spec })}
      onPublish={(description) => run(() => publishWidget(widget.id, description))}
    />
  ));

  return (
    <>
      {editing && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <AddWidget dashboardId={dashboardId} items={catalog} isHr={isHr} onBuild={() => setBuilder({ mode: "add", dashboardId })} />
          <p className="text-sm text-zinc-500">
            <span className="hidden pointer-fine:inline">Drag the handle to move a widget.</span>
            <span className="pointer-fine:hidden">Press and hold the handle, then drag to move a widget.</span>
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {widgets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {editing ? "No widgets yet. Add one to get started." : "This dashboard is empty."}
        </p>
      ) : (
        <DndContext id={`dashboard-${dashboardId}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={widgets.map((widget) => widget.id)} strategy={rectSortingStrategy} disabled={!editing}>
            <div className="grid grid-flow-row-dense auto-rows-[minmax(9rem,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <WidgetBuilder target={builder} sources={sources} onClose={() => setBuilder(null)} />
    </>
  );
}

function WidgetCard({
  widget,
  editing,
  isHr,
  onResize,
  onRemove,
  onEdit,
  onPublish,
}: {
  widget: GridWidget;
  editing: boolean;
  isHr: boolean;
  onResize: (size: WidgetSize) => void;
  onRemove: () => void;
  onEdit: () => void;
  onPublish: (description: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !editing,
  });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [description, setDescription] = useState("");

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={widget.title}
      className={cn(
        "flex min-w-0 flex-col rounded-lg border border-zinc-200 bg-background p-4 dark:border-zinc-800",
        WIDTH_CLASS[widget.width] ?? "",
        HEIGHT_CLASS[widget.height] ?? "",
        editing && "border-dashed",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      {/* Edit controls get their own row so even small tiles keep their title. */}
      {editing && (
        <div className="-mt-1 mb-1 flex items-center justify-between gap-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Move ${widget.title}`}
            className="-ml-1 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-zinc-400 hover:bg-muted hover:text-foreground active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-4" />
          </button>
          <div className="flex min-w-0 items-center gap-0.5">
            <select
              aria-label={`Size of ${widget.title}`}
              value={sizeKey(widget.width, widget.height)}
              onChange={(event) => onResize(event.target.value as WidgetSize)}
              className="h-8 rounded-md border border-input bg-transparent px-1 text-xs dark:bg-input/30"
            >
              {(Object.keys(WIDGET_SIZES) as WidgetSize[]).map((size) => (
                <option key={size} value={size}>
                  {WIDGET_SIZES[size].label}
                </option>
              ))}
            </select>
            {widget.spec && (
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${widget.title}`} title="Edit" onClick={onEdit}>
                <PencilIcon />
              </Button>
            )}
            {widget.spec && isHr && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Add ${widget.title} to the catalogue`}
                title="Add to the catalogue for everyone"
                onClick={() => setPublishing(!publishing)}
              >
                <BookPlusIcon />
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${widget.title}`} title="Remove" onClick={() => setConfirmRemove(true)}>
              <XIcon />
            </Button>
          </div>
        </div>
      )}
      <header>
        <h2 className="truncate text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {widget.href && !editing ? (
            <Link href={widget.href} className="hover:underline">
              {widget.title}
            </Link>
          ) : (
            widget.title
          )}
        </h2>
      </header>

      {confirmRemove && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-sm">
          <span className="flex-1">Remove this widget?</span>
          <Button type="button" size="sm" variant="destructive" onClick={onRemove}>
            Remove
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmRemove(false)}>
            Keep
          </Button>
        </div>
      )}
      {publishing && (
        <div className="mt-2 flex flex-col gap-2 rounded-md bg-muted p-2 text-sm">
          <span>Add to the catalogue so everyone can add it. Each person sees it with their own access.</span>
          <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short description (optional)" maxLength={200} />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onPublish(description);
                setPublishing(false);
              }}
            >
              Add to catalogue
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setPublishing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className={cn("mt-3 min-h-0 flex-1 overflow-auto", editing && "pointer-events-none select-none")}>{widget.content}</div>
    </section>
  );
}
