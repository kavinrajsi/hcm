import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { parseTableParams, stringParam } from "@/lib/table-params";
import { instantRange } from "@/lib/date-filter";
import { formatDateTime } from "@/lib/format-date";
import { EMAIL_KINDS, isEmailKind } from "@/lib/email-log";
import { AddFilter } from "@/components/data-table/add-filter";
import { CountChips } from "@/components/data-table/count-chips";
import { TablePagination } from "@/components/data-table/pagination";
import { ListCard } from "@/components/list-card";
import { DesktopTable, MobileList, PageHeader, PageShell } from "@/components/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmailStatusBadge } from "./status";
import { WebhookUrl } from "./webhook-url";

export const metadata = { title: "Email log" };

type Search = Record<string, string | string[] | undefined>;

// Status filter: the send result, or (for sent mail) what ZeptoMail reported.
const STATUS_FILTERS: Record<string, { label: string; where: Prisma.EmailLogWhereInput }> = {
  SENT: { label: "Sent", where: { status: "SENT" } },
  OPENED: { label: "Opened", where: { delivery: "OPENED" } },
  BOUNCED: { label: "Bounced", where: { delivery: "BOUNCED" } },
  FAILED: { label: "Failed", where: { status: "FAILED" } },
  NOT_SENT: { label: "Not sent", where: { status: "NOT_SENT" } },
};

export default async function EmailLogPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("HR_ADMIN");
  const raw = await searchParams;
  const params = parseTableParams(raw);
  const kind = isEmailKind(raw.kind) ? raw.kind : undefined;
  const status = stringParam(raw.status);
  const sent = instantRange({ preset: stringParam(raw.sent), from: stringParam(raw.from), to: stringParam(raw.to) });

  const where: Prisma.EmailLogWhereInput = {
    ...(kind ? { kind } : {}),
    ...(status && STATUS_FILTERS[status] ? STATUS_FILTERS[status].where : {}),
    ...(sent ? { createdAt: sent } : {}),
    ...(params.q
      ? {
          OR: [
            { subject: { contains: params.q, mode: "insensitive" } },
            { to: { has: params.q.toLowerCase() } },
            { cc: { has: params.q.toLowerCase() } },
            { employee: { name: { contains: params.q, mode: "insensitive" } } },
            { employee: { empId: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rows, total, kinds, statuses, opened, bounced] = await Promise.all([
    db.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        kind: true,
        to: true,
        subject: true,
        status: true,
        delivery: true,
        createdAt: true,
        employee: { select: { id: true, name: true } },
      },
    }),
    db.emailLog.count({ where }),
    db.emailLog.groupBy({ by: ["kind"], _count: true }),
    db.emailLog.groupBy({ by: ["status"], _count: true }),
    db.emailLog.count({ where: { delivery: "OPENED" } }),
    db.emailLog.count({ where: { delivery: "BOUNCED" } }),
  ]);
  const kindCounts = new Map(kinds.map((group) => [group.kind, group._count]));
  const statusCounts = new Map<string, number>(statuses.map((group) => [group.status, group._count]));
  statusCounts.set("OPENED", opened);
  statusCounts.set("BOUNCED", bounced);
  const kindLabel = (value: string) => (isEmailKind(value) ? EMAIL_KINDS[value] : value);
  const recipients = (to: string[]) => (to.length > 1 ? `${to[0]} +${to.length - 1}` : (to[0] ?? "—"));

  return (
    <PageShell>
      <PageHeader
        title="Email log"
        description="Every email HCM sends: who got it, when, and whether it was delivered. Kept for a year; links in password emails are removed."
      />
      <CountChips
        items={Object.entries(STATUS_FILTERS).map(([key, filter]) => ({
          key,
          label: filter.label,
          count: statusCounts.get(key) ?? 0,
        }))}
      />
      <div className="mt-5 md:mt-6">
        <AddFilter
          search={{ param: "q", hint: "Recipient email, subject or employee" }}
          fields={[
            {
              param: "kind",
              label: "Email",
              options: Object.entries(EMAIL_KINDS).map(([value, label]) => ({
                value,
                label,
                count: kindCounts.get(value) ?? 0,
              })),
            },
            {
              param: "status",
              label: "Status",
              options: Object.entries(STATUS_FILTERS).map(([value, filter]) => ({
                value,
                label: filter.label,
                count: statusCounts.get(value) ?? 0,
              })),
            },
          ]}
          date={{ param: "sent", label: "Sent", presets: ["24h", "7d", "30d", "month"] }}
        />
      </div>
      <div className="mt-4">
        <DesktopTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-zinc-500">
                    No emails{params.q || kind || status || sent ? " match these filters." : " sent yet."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/email-log/${row.id}`} className="hover:underline">
                      {formatDateTime(row.createdAt)}
                    </Link>
                  </TableCell>
                  <TableCell>{kindLabel(row.kind)}</TableCell>
                  <TableCell>
                    {recipients(row.to)}
                    {row.employee && (
                      <Link href={`/employees/${row.employee.id}`} className="block text-xs text-zinc-500 hover:underline">
                        {row.employee.name}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    <Link href={`/email-log/${row.id}`} className="hover:underline">
                      {row.subject}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <EmailStatusBadge status={row.status} delivery={row.delivery} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DesktopTable>
        <MobileList empty="No emails." isEmpty={rows.length === 0}>
          {rows.map((row) => (
            <ListCard
              key={row.id}
              href={`/email-log/${row.id}`}
              title={row.subject}
              subtitle={recipients(row.to)}
              badge={<EmailStatusBadge status={row.status} delivery={row.delivery} />}
              meta={
                <>
                  <span>{kindLabel(row.kind)}</span>
                  <span>{formatDateTime(row.createdAt)}</span>
                </>
              }
            />
          ))}
        </MobileList>
      </div>
      <div className="mt-4">
        <TablePagination page={params.page} total={total} searchParams={raw} pathname="/email-log" />
      </div>
      <details className="mt-8 rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800" open={!process.env.ZEPTOMAIL_WEBHOOK_SECRET}>
        <summary className="cursor-pointer font-medium">
          Delivery tracking (opens and bounces){process.env.ZEPTOMAIL_WEBHOOK_SECRET ? " · on" : " · not set up yet"}
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
          <li>
            Pick a long random secret. On Vercel, add it to the hcm project as <code>ZEPTOMAIL_WEBHOOK_SECRET</code>{" "}
            (Production) and redeploy.
          </li>
          <li>
            In ZeptoMail, open the Mail Agent HCM sends from → <strong>Webhooks</strong> → <strong>Authentication Key</strong>,
            and enter the same secret.
          </li>
          <li>
            Add a webhook with this URL (it includes the secret as <code>?key=</code>), leave Authorization headers empty,
            and tick Soft bounce, Hard bounce, Email opens and Email clicks:
            {process.env.ZEPTOMAIL_WEBHOOK_SECRET ? <WebhookUrl /> : null}
          </li>
          <li>
            In the Mail Agent&apos;s settings, turn on <strong>open tracking</strong> (and click tracking if you want clicks).
          </li>
          <li>New emails then show Opened or Bounced here. Emails sent before this stay as Sent.</li>
        </ol>
      </details>
    </PageShell>
  );
}
