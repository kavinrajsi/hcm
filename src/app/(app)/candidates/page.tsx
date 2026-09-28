import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { parseTableParams } from "@/lib/table-params";
import { AddFilter } from "@/components/data-table/add-filter";
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
import { formatDay } from "@/lib/format-date";

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
  const position = POSITIONS.find(
    (positionOption) => positionOption === raw.position,
  );
  const trimmedParam = (value: unknown) =>
    typeof value === "string" && value.trim()
      ? value.trim().slice(0, 200)
      : undefined;
  const filters: CandidateFilters = {
    q: params.q,
    position,
    role: trimmedParam(raw.role),
    created: trimmedParam(raw.created),
    from: trimmedParam(raw.from),
    to: trimmedParam(raw.to),
  };
  const and = candidateWhere(filters);

  // Totals across everything (not filtered); null/unknown statuses count as New.
  const statusCounts = await db.candidate.groupBy({
    by: ["status"],
    where: NOT_SPAM,
    _count: true,
  });
  // Role menu options: distinct job roles, case-insensitively merged under
  // the most common spelling, most applications first.
  const roleGroups = await db.candidate.groupBy({
    by: ["jobRole"],
    where: { AND: [NOT_SPAM, { jobRole: { not: null } }] },
    _count: true,
  });
  const roleMap = new Map<
    string,
    { value: string; count: number; top: number }
  >();
  for (const group of roleGroups) {
    const value = group.jobRole?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    const existingRole = roleMap.get(key);
    if (!existingRole)
      roleMap.set(key, { value, count: group._count, top: group._count });
    else {
      existingRole.count += group._count;
      if (group._count > existingRole.top)
        Object.assign(existingRole, { value, top: group._count });
    }
  }
  const roles = [...roleMap.values()]
    .sort(
      (left, right) =>
        right.count - left.count || left.value.localeCompare(right.value),
    )
    .map(({ value, count }) => ({ value, count }));

  const positionCounts = await db.candidate.groupBy({
    by: ["position"],
    where: NOT_SPAM,
    _count: true,
  });
  const countByPosition = new Map(
    positionCounts.map((positionCount) => [
      positionCount.position,
      positionCount._count,
    ]),
  );

  const countByStatus = new Map<CandidateStatus, number>();
  for (const statusCount of statusCounts) {
    const statusKey = statusOf(statusCount.status);
    countByStatus.set(
      statusKey,
      (countByStatus.get(statusKey) ?? 0) + statusCount._count,
    );
  }

  const hrefWith = (key: string, value?: string) => {
    const queryString = new URLSearchParams();
    for (const [paramKey, paramValue] of Object.entries(raw)) {
      if (
        typeof paramValue === "string" &&
        paramKey !== key &&
        paramKey !== "page"
      )
        queryString.set(paramKey, paramValue);
    }
    if (value) queryString.set(key, value);
    return `/candidates${queryString.size ? `?${queryString}` : ""}`;
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
        {CANDIDATE_STATUSES.map((candidateStatus) => (
          <span
            key={candidateStatus}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-sm",
              CANDIDATE_STATUS_CLASSES[candidateStatus],
            )}
          >
            {candidateStatus}{" "}
            <span className="font-medium tabular-nums">
              {countByStatus.get(candidateStatus) ?? 0}
            </span>
          </span>
        ))}
      </div>

      {/* Phones: stacked. Desktop: filters (incl. search) and view in one row. */}
      <div className="mt-5 flex flex-col gap-3 md:mt-6 md:flex-row md:items-center">
        <div className="min-w-0 md:flex-1">
          <AddFilter
            search={{ param: "q", hint: "Name, email, phone or role" }}
            fields={[
              // Board columns are the statuses, so no status filter there.
              ...(view === "list"
                ? [
                    {
                      param: "type",
                      label: "Status",
                      options: CANDIDATE_STATUSES.map((candidateStatus) => ({
                        value: candidateStatus,
                        count: countByStatus.get(candidateStatus) ?? 0,
                      })),
                    },
                  ]
                : []),
              {
                param: "position",
                label: "Position",
                options: POSITIONS.map((positionOption) => ({
                  value: positionOption,
                  count: countByPosition.get(positionOption) ?? 0,
                })),
              },
              { param: "role", label: "Role", options: roles },
            ]}
            date={{
              param: "created",
              label: "Created",
              presets: ["1h", "24h", "7d", "30d", "month"],
              withTime: true,
            }}
          />
        </div>
        <Segmented
          label="View"
          items={(["list", "board"] as const).map((viewOption) => ({
            key: viewOption,
            href: hrefWith(
              "view",
              viewOption === "board" ? "board" : undefined,
            ),
            label: viewOption === "list" ? "List" : "Board",
            active: view === viewOption,
          }))}
        />
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
  const columns = Object.fromEntries(
    results.map(([columnStatus, rows]) => [columnStatus, rows]),
  );
  const counts = Object.fromEntries(
    results.map(([columnStatus, , columnCount]) => [columnStatus, columnCount]),
  );

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
  const status = CANDIDATE_STATUSES.find(
    (candidateStatus) => candidateStatus === type,
  );
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
        {details.map((candidate) => (
          <CandidateCard key={candidate.id} candidate={candidate} />
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
            {details.map((candidate) => {
              const candidateStatus = candidate.status as CandidateStatus;
              return (
                <TableRow key={candidate.id}>
                  <TableCell>
                    <div className="font-medium">{candidate.name}</div>
                    {candidate.jobRole && (
                      <div className="text-sm text-zinc-500">
                        {candidate.jobRole}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {candidate.position ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{candidate.email ?? "—"}</div>
                    <div className="text-zinc-500">
                      {candidate.mobileNumber}
                    </div>
                  </TableCell>
                  <TableCell>{candidate.location ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatDay(candidate.appliedOn)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium",
                        CANDIDATE_STATUS_CLASSES[candidateStatus],
                      )}
                    >
                      {candidateStatus}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <CandidateDialog candidate={candidate} />
                      {candidate.resumeHref && (
                        <a
                          href={`${candidate.resumeHref}?inline=1`}
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
