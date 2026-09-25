import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { parseTableParams } from "@/lib/table-params";
import { TableFilters } from "@/components/data-table/filters";
import { TablePagination } from "@/components/data-table/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { Segmented } from "@/components/segmented";
import { CandidateDialog, type CandidateDetail } from "./candidate-dialog";
import { CandidateBoard } from "./candidate-board";
import { AddCandidate } from "./add-candidate";
import { CandidateCard } from "./candidate-card";
import { FileOpenIcon } from "@/components/icons";
import {
  BOARD_PAGE_SIZE,
  NOT_SPAM,
  POSITIONS,
  candidateWhere,
  statusOf,
  statusWhere,
  toCandidateDetail,
  type CandidateFilters,
} from "./query";
import {
  CANDIDATE_STATUSES,
  CANDIDATE_STATUS_CLASSES,
  type CandidateStatus,
} from "./statuses";

export const metadata = { title: "Candidates" };

// Applications submitted through the madarth.com career form. The website
// writes rows directly; this page is HR's triage view — a paginated list,
// or a board with one column per status (?view=board).

export default async function CandidatesPage({
  searchParams,
}: PageProps<"/candidates">) {
  await requireRole("HR_ADMIN");
  const raw = await searchParams;
  const params = parseTableParams(raw);
  const view = raw.view === "board" ? "board" : "list";
  const position = POSITIONS.find((p) => p === raw.position);
  const filters: CandidateFilters = {
    q: params.q,
    position,
  };
  const and = candidateWhere(filters);

  // Totals across everything (not filtered); null/unknown statuses count as New.
  const statusCounts = await db.candidate.groupBy({
    by: ["status"],
    where: NOT_SPAM,
    _count: true,
  });
  const countByStatus = new Map<CandidateStatus, number>();
  for (const s of statusCounts) {
    const k = statusOf(s.status);
    countByStatus.set(k, (countByStatus.get(k) ?? 0) + s._count);
  }

  const hrefWith = (key: string, value?: string) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && k !== key && k !== "page") qs.set(k, v);
    }
    if (value) qs.set(key, value);
    return `/candidates${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <PageShell width={view === "list" ? "lg" : "full"}>
      <PageHeader
        title="Candidates"
        description="Applications from the madarth.com career form."
        actions={<AddCandidate />}
      />

      {/* One swipeable row on phones, wrapping chips on desktop. */}
      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:mt-6 md:flex-wrap md:px-0">
        {CANDIDATE_STATUSES.map((s) => (
          <span
            key={s}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-sm",
              CANDIDATE_STATUS_CLASSES[s],
            )}
          >
            {s}{" "}
            <span className="font-medium tabular-nums">
              {countByStatus.get(s) ?? 0}
            </span>
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 md:mt-6 md:flex-row md:flex-wrap md:items-center md:justify-between">
        {/* Board columns are the statuses, so no status filter there. */}
        <TableFilters
          dateFilters={false}
          searchPlaceholder="Name, email, phone, role…"
          typeLabel="Status"
          typeOptions={
            view === "list"
              ? CANDIDATE_STATUSES.map((s) => ({ value: s, label: s }))
              : undefined
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Position"
            items={([undefined, ...POSITIONS] as const).map((p) => ({
              key: p ?? "all",
              href: hrefWith("position", p),
              label: p ?? "All",
              active: position === p,
            }))}
          />
          <Segmented
            label="View"
            items={(["list", "board"] as const).map((v) => ({
              key: v,
              href: hrefWith("view", v === "board" ? "board" : undefined),
              label: v === "list" ? "List" : "Board",
              active: view === v,
            }))}
          />
        </div>
      </div>

      <div className="mt-4">
        {view === "board" ? (
          <BoardView filters={filters} and={and} />
        ) : (
          <ListView
            and={and}
            type={params.type}
            page={params.page}
            skip={params.skip}
            take={params.take}
            raw={raw}
          />
        )}
      </div>
    </PageShell>
  );
}

async function BoardView({
  filters,
  and,
}: {
  filters: CandidateFilters;
  and: ReturnType<typeof candidateWhere>;
}) {
  const results = await Promise.all(
    CANDIDATE_STATUSES.map(async (status) => {
      const where = { AND: [...and, statusWhere(status)] };
      const [rows, count] = await Promise.all([
        db.candidate.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: BOARD_PAGE_SIZE,
        }),
        db.candidate.count({ where }),
      ]);
      return [status, rows.map(toCandidateDetail), count] as const;
    }),
  );
  const columns = Object.fromEntries(results.map(([s, rows]) => [s, rows]));
  const counts = Object.fromEntries(results.map(([s, , n]) => [s, n]));

  return (
    <CandidateBoard
      initialColumns={columns as Record<CandidateStatus, CandidateDetail[]>}
      initialCounts={counts as Record<CandidateStatus, number>}
      filters={filters}
    />
  );
}

async function ListView({
  and,
  type,
  page,
  skip,
  take,
  raw,
}: {
  and: ReturnType<typeof candidateWhere>;
  type?: string;
  page: number;
  skip: number;
  take: number;
  raw: Record<string, string | string[] | undefined>;
}) {
  const status = CANDIDATE_STATUSES.find((s) => s === type);
  const where = { AND: status ? [...and, statusWhere(status)] : and };
  const [rows, total] = await Promise.all([
    db.candidate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    db.candidate.count({ where }),
  ]);

  const details = rows.map(toCandidateDetail);

  return (
    <>
      <MobileList isEmpty={details.length === 0} empty="No candidates.">
        {details.map((c) => (
          <CandidateCard key={c.id} candidate={c} />
        ))}
      </MobileList>
      <DesktopTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-zinc-500">
                  No candidates.
                </TableCell>
              </TableRow>
            )}
            {details.map((c) => {
              const st = c.status as CandidateStatus;
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.name}</div>
                    {c.jobRole && (
                      <div className="text-sm text-zinc-500">{c.jobRole}</div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.position ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{c.email ?? "—"}</div>
                    <div className="text-zinc-500">{c.mobileNumber}</div>
                  </TableCell>
                  <TableCell>{c.location ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {c.appliedOn}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium",
                        CANDIDATE_STATUS_CLASSES[st],
                      )}
                    >
                      {st}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <CandidateDialog candidate={c} />
                      {c.resumeHref && (
                        <a
                          href={`${c.resumeHref}?inline=1`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-foreground"
                        >
                          <FileOpenIcon className="size-4" />
                          Resume
                        </a>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DesktopTable>

      <div className="mt-4">
        <TablePagination
          page={page}
          total={total}
          searchParams={raw}
          pathname="/candidates"
        />
      </div>
    </>
  );
}
