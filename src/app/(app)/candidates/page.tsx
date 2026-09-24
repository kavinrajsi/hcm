import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { datePartsToRange, parseTableParams } from "@/lib/table-params";
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
import { CandidateDialog } from "./candidate-dialog";
import {
  CANDIDATE_STATUSES,
  CANDIDATE_STATUS_CLASSES,
  type CandidateStatus,
} from "./statuses";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Candidates" };

// Applications submitted through the madarth.com career form. The website
// writes rows directly; this page is HR's read/triage view.

const POSITIONS = ["Full Time", "Intern"] as const;

/** Only link user-supplied URLs that are plain http(s). */
function safeUrl(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  return /^https?:\/\//i.test(v) ? v : null;
}

function statusOf(value: string | null): CandidateStatus {
  return CANDIDATE_STATUSES.find((s) => s === value) ?? "New";
}

export default async function CandidatesPage({
  searchParams,
}: PageProps<"/candidates">) {
  await requireRole("HR_ADMIN");
  const raw = await searchParams;
  const params = parseTableParams(raw);
  const position = POSITIONS.find((p) => p === raw.position);

  // Non-empty honeypot = bot submission; never shown.
  const base: Prisma.CandidateWhereInput = {
    OR: [{ honeypot: null }, { honeypot: "" }],
  };
  const and: Prisma.CandidateWhereInput[] = [base];
  if (params.q) {
    and.push({
      OR: [
        { firstName: { contains: params.q, mode: "insensitive" } },
        { lastName: { contains: params.q, mode: "insensitive" } },
        { email: { contains: params.q, mode: "insensitive" } },
        { jobRole: { contains: params.q, mode: "insensitive" } },
        { location: { contains: params.q, mode: "insensitive" } },
      ],
    });
  }
  if (CANDIDATE_STATUSES.includes(params.type as CandidateStatus)) {
    and.push({ status: params.type });
  }
  if (position) and.push({ position });
  const range = datePartsToRange(params);
  if (range) and.push({ createdAt: range });
  const where: Prisma.CandidateWhereInput = { AND: and };

  const [candidates, total, statusCounts] = await Promise.all([
    db.candidate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: params.skip,
      take: params.take,
    }),
    db.candidate.count({ where }),
    db.candidate.groupBy({ by: ["status"], where: base, _count: true }),
  ]);
  const countByStatus = new Map(statusCounts.map((s) => [s.status, s._count]));

  const positionHref = (p?: string) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && k !== "position" && k !== "page")
        qs.set(k, v);
    }
    if (p) qs.set("position", p);
    return `/candidates${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Applications from the madarth.com career form.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {CANDIDATE_STATUSES.map((s) => (
          <span
            key={s}
            className={cn(
              "rounded-md px-2.5 py-1 text-sm",
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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <TableFilters
          typeLabel="Status"
          typeOptions={CANDIDATE_STATUSES.map((s) => ({ value: s, label: s }))}
        />
        <nav
          className="inline-flex rounded-lg border border-zinc-200 p-0.5 text-sm dark:border-zinc-800"
          aria-label="Position"
        >
          {([undefined, ...POSITIONS] as const).map((p) => (
            <Link
              key={p ?? "all"}
              href={positionHref(p)}
              aria-current={position === p ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1",
                position === p
                  ? "bg-muted font-medium"
                  : "text-zinc-500 hover:text-foreground",
              )}
            >
              {p ?? "All"}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-zinc-500">
                  No candidates.
                </TableCell>
              </TableRow>
            )}
            {candidates.map((c) => {
              const name =
                [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
              const status = statusOf(c.status);
              const resumeHref = c.fileUrl
                ? `/api/files/${c.fileUrl.split("/").map(encodeURIComponent).join("/")}`
                : null;
              return (
                <TableRow key={String(c.id)}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell>{c.jobRole ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.position ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{c.email ?? "—"}</div>
                    <div className="text-zinc-500">{c.mobileNumber}</div>
                  </TableCell>
                  <TableCell>{c.location ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {c.createdAt.toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium",
                        CANDIDATE_STATUS_CLASSES[status],
                      )}
                    >
                      {status}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {resumeHref && (
                        <a
                          href={resumeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-zinc-400 hover:text-foreground"
                        >
                          Resume
                        </a>
                      )}
                      <CandidateDialog
                        candidate={{
                          id: String(c.id),
                          name,
                          email: c.email,
                          mobileNumber: c.mobileNumber,
                          position: c.position,
                          jobRole: c.jobRole,
                          location: c.location,
                          portfolio: safeUrl(c.portfolio),
                          resumeHref,
                          status,
                          notes: c.notes,
                          appliedOn: c.createdAt.toISOString().slice(0, 10),
                          pageUrl: c.pageUrl,
                          referrer: c.referrer,
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4">
        <TablePagination
          page={params.page}
          total={total}
          searchParams={raw}
          pathname="/candidates"
        />
      </div>
    </main>
  );
}
