"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CandidateDialog, type CandidateDetail } from "./candidate-dialog";
import { loadMoreCandidates, setCandidateStatus } from "./actions";
import type { CandidateFilters } from "./query";
import {
  CANDIDATE_STATUSES,
  CANDIDATE_STATUS_CLASSES,
  type CandidateStatus,
} from "./statuses";
import { formatDay } from "@/lib/format-date";
import { ScoreBadge } from "./score-badge";

type Columns = Record<CandidateStatus, CandidateDetail[]>;
type Counts = Record<CandidateStatus, number>;

/** Insert keeping the column newest-first (appliedOn desc). */
function insertSorted(list: CandidateDetail[], card: CandidateDetail) {
  const insertIndex = list.findIndex(
    (candidate) => candidate.appliedOn < card.appliedOn,
  );
  return insertIndex === -1
    ? [...list, card]
    : [...list.slice(0, insertIndex), card, ...list.slice(insertIndex)];
}

function CardBody({ candidate }: { candidate: CandidateDetail }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium leading-snug">{candidate.name}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {candidate.score?.value != null && <ScoreBadge score={candidate.score} />}
          {candidate.resumeHref && (
            <FileText
              className="mt-0.5 size-3.5 shrink-0 text-zinc-400"
              aria-label="Has resume"
            />
          )}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">
        {candidate.jobRole ?? "—"}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
        <span>{candidate.position ?? "—"}</span>
        <span className="tabular-nums">{formatDay(candidate.appliedOn)}</span>
      </div>
    </>
  );
}

const cardClass =
  "rounded-lg border border-zinc-200 bg-background p-2.5 text-sm shadow-xs dark:border-zinc-800";

function BoardCard({
  candidate,
  onOpen,
  onMove,
}: {
  candidate: CandidateDetail;
  onOpen: () => void;
  onMove: (status: CandidateStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: candidate.id,
  });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${candidate.name}, ${candidate.jobRole ?? "no role"}. Space to move, Enter to open.`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
        else listeners?.onKeyDown?.(event);
      }}
      className={cn(
        cardClass,
        "group cursor-grab touch-none outline-none hover:border-zinc-300 focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-zinc-700",
        isDragging && "opacity-40",
      )}
    >
      <CardBody candidate={candidate} />
      {/* Non-drag fallback (touch / keyboard users). */}
      <select
        aria-label="Move to"
        value=""
        onChange={(event) => onMove(event.target.value as CandidateStatus)}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className="mt-2 hidden h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-xs group-has-focus-visible:block pointer-coarse:block dark:bg-input/30"
      >
        <option value="" disabled>
          Move to…
        </option>
        {CANDIDATE_STATUSES.filter((status) => status !== candidate.status).map(
          (status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ),
        )}
      </select>
    </li>
  );
}

function BoardColumn({
  status,
  cards,
  count,
  loading,
  onLoadMore,
  children,
}: {
  status: CandidateStatus;
  cards: CandidateDetail[];
  count: number;
  loading: boolean;
  onLoadMore: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${status} column`}
      className={cn(
        "flex max-h-[calc(100dvh-20rem)] min-h-40 w-[85vw] max-w-80 shrink-0 snap-start flex-col rounded-xl md:max-h-[calc(100vh-18rem)] md:w-72 border border-zinc-200 bg-muted/30 dark:border-zinc-800",
        isOver && "border-primary/60 bg-muted/60",
      )}
    >
      <header className="flex items-center justify-between px-3 py-2">
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-medium",
            CANDIDATE_STATUS_CLASSES[status],
          )}
        >
          {status}
        </span>
        <span className="text-xs tabular-nums text-zinc-500">{count}</span>
      </header>
      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {children}
        {cards.length === 0 && (
          <li className="px-1 py-6 text-center text-xs text-zinc-400">
            Drop candidates here
          </li>
        )}
        {cards.length < count && (
          <li>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={loading}
              onClick={onLoadMore}
            >
              {loading ? "Loading…" : `Load more (${count - cards.length})`}
            </Button>
          </li>
        )}
      </ul>
    </section>
  );
}

export function CandidateBoard({
  initialColumns,
  initialCounts,
  filters,
}: {
  initialColumns: Columns;
  initialCounts: Counts;
  filters: CandidateFilters;
}) {
  const [columns, setColumns] = useState(initialColumns);
  const [counts, setCounts] = useState(initialCounts);
  // Re-sync when the server re-renders (filters changed, drawer save, …).
  const [prev, setPrev] = useState(initialColumns);
  if (prev !== initialColumns) {
    setPrev(initialColumns);
    setColumns(initialColumns);
    setCounts(initialCounts);
  }

  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingCol, setLoadingCol] = useState<CandidateStatus | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    // Small threshold so a plain click still opens the drawer.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  const all = Object.values(columns).flat();
  const find = (id: string | null) =>
    all.find((candidate) => candidate.id === id) ?? null;
  const active = find(activeId);
  const open = find(openId);

  function move(id: string, to: CandidateStatus) {
    const card = find(id);
    if (!card || card.status === to) return;
    const from = card.status as CandidateStatus;
    const snapshot = { columns, counts };
    const moved = { ...card, status: to };
    setColumns({
      ...columns,
      [from]: columns[from].filter((candidate) => candidate.id !== id),
      [to]: insertSorted(columns[to], moved),
    });
    setCounts({ ...counts, [from]: counts[from] - 1, [to]: counts[to] + 1 });
    setError(null);
    startTransition(async () => {
      try {
        await setCandidateStatus(id, to);
      } catch {
        setColumns(snapshot.columns);
        setCounts(snapshot.counts);
        setError(`Couldn't move ${card.name} to ${to}. Try again.`);
      }
    });
  }

  async function loadMore(status: CandidateStatus) {
    setLoadingCol(status);
    try {
      const more = await loadMoreCandidates(
        status,
        columns[status].length,
        filters,
      );
      setColumns((currentColumns) => {
        const seen = new Set(
          currentColumns[status].map((candidate) => candidate.id),
        );
        return {
          ...currentColumns,
          [status]: [
            ...currentColumns[status],
            ...more.filter((candidate) => !seen.has(candidate.id)),
          ],
        };
      });
    } catch {
      setError(`Couldn't load more ${status} candidates.`);
    } finally {
      setLoadingCol(null);
    }
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (event.over)
      move(String(event.active.id), event.over.id as CandidateStatus);
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <DndContext
        id="candidate-board"
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:snap-none md:px-0">
          {CANDIDATE_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              cards={columns[status]}
              count={counts[status]}
              loading={loadingCol === status}
              onLoadMore={() => loadMore(status)}
            >
              {columns[status].map((candidate) => (
                <BoardCard
                  key={candidate.id}
                  candidate={candidate}
                  onOpen={() => setOpenId(candidate.id)}
                  onMove={(to) => move(candidate.id, to)}
                />
              ))}
            </BoardColumn>
          ))}
        </div>
        <DragOverlay>
          {active && (
            <div className={cn(cardClass, "w-68 cursor-grabbing shadow-lg")}>
              <CardBody candidate={active} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {open && (
        <CandidateDialog
          key={open.id}
          candidate={open}
          open
          onOpenChange={(isOpen) => !isOpen && setOpenId(null)}
        />
      )}
    </>
  );
}
