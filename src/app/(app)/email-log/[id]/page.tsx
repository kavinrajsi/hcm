import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { formatDateTime } from "@/lib/format-date";
import { EMAIL_KINDS, isEmailKind, type WebhookEvent } from "@/lib/email-log";
import { PageHeader, PageShell } from "@/components/page";
import { EmailStatusBadge } from "../status";
import { ResendButton } from "./resend-button";

export const metadata = { title: "Email · Email log" };

// HR: one logged email — recipients, outcome, delivery events and content.
export default async function EmailLogEntryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("HR_ADMIN");
  const { id } = await params;
  const row = await db.emailLog.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true, empId: true } },
      sentBy: { select: { name: true, email: true } },
    },
  });
  if (!row) notFound();
  const resends = await db.emailLog.findMany({
    where: { resendOfId: row.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, delivery: true, createdAt: true },
  });
  const events = (Array.isArray(row.events) ? row.events : []) as WebhookEvent[];
  const details: [string, React.ReactNode][] = [
    ["Email", isEmailKind(row.kind) ? EMAIL_KINDS[row.kind] : row.kind],
    ["Sent", formatDateTime(row.createdAt)],
    ["Status", <EmailStatusBadge key="status" status={row.status} delivery={row.delivery} />],
    ["From", row.from],
    ["To", row.to.join(", ")],
    ["CC", row.cc.join(", ")],
    ["Reply-to", row.replyTo],
    ["Attachments", row.attachmentNames.join(", ")],
    [
      "Employee",
      row.employee ? (
        <Link key="employee" href={`/employees/${row.employee.id}`} className="hover:underline">
          {row.employee.name} · {row.employee.empId}
        </Link>
      ) : null,
    ],
    ["Sent by", row.sentBy ? row.sentBy.name || row.sentBy.email : "HCM (automatic)"],
    [
      "Resend of",
      row.resendOfId ? (
        <Link key="resend" href={`/email-log/${row.resendOfId}`} className="hover:underline">
          the original attempt
        </Link>
      ) : null,
    ],
  ];

  return (
    <PageShell width="md">
      <PageHeader title={row.subject} description="One email from the Email log." />
      {row.error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{row.error}</p>
      )}
      {row.status !== "SENT" && (
        <div className="mt-4">
          {row.resendable ? (
            <ResendButton id={row.id} />
          ) : (
            <p className="text-sm text-zinc-500">
              This one can&apos;t be resent from here: it had a one-time link or an attachment. Send it again from where it
              started (e.g. Users &amp; roles, Letters).
            </p>
          )}
        </div>
      )}
      <dl className="mt-6 grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
        {details
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-zinc-500">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
      </dl>
      {resends.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Resent</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {resends.map((resend) => (
              <li key={resend.id}>
                <Link href={`/email-log/${resend.id}`} className="hover:underline">
                  {formatDateTime(resend.createdAt)}
                </Link>{" "}
                · <EmailStatusBadge status={resend.status} delivery={resend.delivery} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="mt-6">
        <h2 className="text-sm font-semibold">Delivery</h2>
        {events.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">
            {row.status === "SENT" ? "No opens or bounces reported by ZeptoMail yet." : "Not sent, so nothing to report."}
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {events.map((event, index) => (
              <li key={index}>
                <span className="font-medium">{event.type}</span>{" "}
                <span className="text-zinc-500">· {formatDateTime(new Date(event.at))}</span>
                {event.detail && <span className="block text-xs text-zinc-500">{event.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <iframe
        title="Email content"
        srcDoc={row.html}
        sandbox=""
        className="mt-6 h-[720px] w-full rounded-xl border border-zinc-200 bg-white dark:border-zinc-800"
      />
      <p className="mt-2 text-xs text-zinc-500">Password and invite links are removed before saving.</p>
    </PageShell>
  );
}
