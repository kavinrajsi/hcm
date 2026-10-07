import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { parseTableParams } from "@/lib/table-params";
import { FilterDateRange, FilterMultiSelect, FilterSearch } from "@/components/data-table/filter-bar";
import { CountChips } from "@/components/data-table/count-chips";
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
  WITH_SCORE,
  type CandidateFilters,
} from "./query";
import {
  CANDIDATE_STATUSES,
  CANDIDATE_STATUS_CLASSES,
  type CandidateStatus,
} from "./statuses";
import { formatDay } from "@/lib/format-date";
import { SCORE_BANDS, type ScoreBand } from "@/lib/candidates/score-bands";
import { ScoreBadge } from "./score-badge";
import { waitingForCreditWhere } from "@/lib/candidates/score";

export const metadata = { title: "Candidates" };

// Applications submitted through the madarth.com career form. The website
// writes rows directly; this page is HR's triage view — a paginated list,
// or a board with one column per status (?view=board).

export default async function CandidatesPage({
  searchParams,
}: PageProps<"/candidates">) {
  await requirePageRole("HR_ADMIN");
  const raw = await searchParams;
  const params = parseTableParams(raw);
  const view = raw.view === "board" ? "board" : "list";
  // Multi-selects arrive as repeated params (?role=a&role=b).
  const listParam = (value: unknown) =>
    (Array.isArray(value) ? value : [value])
      .filter((item): item is string => typeof item === "string" && item.trim() !== "")
      .map((item) => item.trim().slice(0, 200))
      .slice(0, 50);
  const trimmedParam = (value: unknown) =>
    typeof value === "string" && value.trim()
      ? value.trim().slice(0, 200)
      : undefined;
  const filters: CandidateFilters = {
    q: params.q,
    position: listParam(raw.position),
    role: listParam(raw.role),
    score: listParam(raw.score),
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

  // Score filter counts across all (non-spam) candidates.
  const [strong, fair, weak, scoredTotal, allTotal, waitingForCredit] = await Promise.all([
    ...(Object.keys(SCORE_BANDS) as ScoreBand[]).map((band) =>
      db.candidateScore.count({
        where: { score: { gte: SCORE_BANDS[band].min, lte: SCORE_BANDS[band].max }, candidate: NOT_SPAM },
      }),
    ),
    db.candidateScore.count({ where: { score: { not: null }, candidate: NOT_SPAM } }),
    db.candidate.count({ where: NOT_SPAM }),
    db.candidateScore.count({ where: { ...waitingForCreditWhere, candidate: NOT_SPAM } }),
  ]);
  const scoreCounts = { strong, fair, weak, none: allTotal - scoredTotal };

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
      if (paramKey === key || paramKey === "page" || paramValue === undefined) continue;
      // Keep every value of a multi-select (?role=a&role=b).
      for (const item of Array.isArray(paramValue) ? paramValue : [paramValue])
        queryString.append(paramKey, item);
    }
    if (value) queryString.set(key, value);
    return `/candidates${queryString.size ? `?${queryString}` : ""}`;
  };

  return (
    <PageShell width={view === "list" ? "lg" : "full"}>
      <PageHeader
        title="Candidates"
        description="Applications from the madarth.com career form."
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/candidates/criteria" />}>
              Role criteria
            </Button>
            <AddCandidate />
          </>
        }
      />

      {waitingForCredit > 0 && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {waitingForCredit.toLocaleString("en-IN")} resume
          {waitingForCredit === 1 ? " is" : "s are"} waiting for an AI score: the AI Gateway is out of
          credit. Top it up, or in Claude with HCM connected (
          <Link href="/mcp/instructions" className="underline underline-offset-4">
            Connect an AI
          </Link>
          ) ask: &ldquo;score the resumes waiting in HCM&rdquo;.
        </p>
      )}

      <CountChips
        items={CANDIDATE_STATUSES.map((candidateStatus) => ({
          key: candidateStatus,
          label: candidateStatus,
          count: countByStatus.get(candidateStatus) ?? 0,
          className: CANDIDATE_STATUS_CLASSES[candidateStatus],
        }))}
      />

      {/* Row 1: one search across everything. Row 2: the filters and the view. */}
      <div className="mt-5 flex flex-col gap-3 md:mt-6">
        <FilterSearch placeholder="Search name, email, phone, role or location" />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center [&>*]:md:min-w-0 [&>*]:md:flex-1">
            <FilterDateRange param="created" presets={["1h", "24h", "7d", "30d", "month"]} withTime />
            {/* Board columns are the statuses, so no status filter there. */}
            {view === "list" && (
              <FilterMultiSelect
                param="type"
                label="Status"
                plural="Statuses"
                options={CANDIDATE_STATUSES.map((candidateStatus) => ({
                  value: candidateStatus,
                  count: countByStatus.get(candidateStatus) ?? 0,
                }))}
              />
            )}
            <FilterMultiSelect
              param="position"
              label="Position"
              plural="Positions"
              options={POSITIONS.map((positionOption) => ({
                value: positionOption,
                count: countByPosition.get(positionOption) ?? 0,
              }))}
            />
            <FilterMultiSelect param="role" label="Job role" plural="Job roles" options={roles} searchable />
            <FilterMultiSelect
              param="score"
              label="Score"
              plural="Scores"
              options={[
                ...(Object.keys(SCORE_BANDS) as ScoreBand[]).map((band) => ({
                  value: band,
                  label: SCORE_BANDS[band].label,
                  count: scoreCounts[band],
                })),
                { value: "none", label: "Not scored", count: scoreCounts.none },
              ]}
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
      </div>

      <div className="mt-4">
        {view === "board" ? (
          <BoardView filters={filters} and={and} />
        ) : (
          <ListView
            and={and}
            types={listParam(raw.type)}
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
          include: WITH_SCORE,
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

const SORT_KEYS = ["applied", "type", "score"] as const;
type SortKey = (typeof SORT_KEYS)[number];
/** First click: newest applied, A→Z type, best score. */
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = { applied: "desc", type: "asc", score: "desc" };

async function ListView({
  and,
  types,
  page,
  skip,
  take,
  raw,
}: {
  and: ReturnType<typeof candidateWhere>;
  types: string[];
  page: number;
  skip: number;
  take: number;
  raw: Record<string, string | string[] | undefined>;
}) {
  // ?sort=applied|type|score&dir=asc|desc; default newest applied first.
  const sortKey: SortKey = SORT_KEYS.includes(raw.sort as SortKey) ? (raw.sort as SortKey) : "applied";
  const sortDir: "asc" | "desc" =
    raw.dir === "asc" || raw.dir === "desc" ? raw.dir : DEFAULT_DIR[sortKey];
  const statuses = CANDIDATE_STATUSES.filter((candidateStatus) => types.includes(candidateStatus));
  /** Link for a column header: sort by it, or flip the direction if it's already the sort. */
  const sortHref = (key: SortKey) => {
    const query = new URLSearchParams();
    for (const [param, value] of Object.entries(raw)) {
      if (param === "sort" || param === "dir" || param === "page" || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) query.append(param, item);
    }
    const dir = key === sortKey ? (sortDir === "asc" ? "desc" : "asc") : DEFAULT_DIR[key];
    if (key !== "applied" || dir !== "desc") {
      query.set("sort", key);
      query.set("dir", dir);
    }
    return `/candidates${query.size ? `?${query}` : ""}`;
  };
  const sortHeader = (key: SortKey, label: string) => (
    <Link
      href={sortHref(key)}
      aria-label={`Sort by ${label.toLowerCase()}`}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground",
        key === sortKey && "text-foreground",
      )}
    >
      {label}
      <span aria-hidden className="text-xs">
        {key === sortKey ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </Link>
  );
  const orderBy: Prisma.CandidateOrderByWithRelationInput[] =
    sortKey === "score"
      ? [{ score: { score: { sort: sortDir, nulls: "last" } } }, { createdAt: "desc" }]
      : sortKey === "type"
        ? [{ position: { sort: sortDir, nulls: "last" } }, { createdAt: "desc" }]
        : [{ createdAt: sortDir }];
  const where = {
    AND: statuses.length ? [...and, { OR: statuses.map((status) => statusWhere(status)) }] : and,
  };
  const [rows, total] = await Promise.all([
    db.candidate.findMany({
      where,
      orderBy,
      skip,
      take,
      include: WITH_SCORE,
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
              <TableHead>{sortHeader("type", "Type")}</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>{sortHeader("applied", "Applied")}</TableHead>
              <TableHead>{sortHeader("score", "Score")}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-zinc-500">
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
                    <ScoreBadge score={candidate.score} />
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
