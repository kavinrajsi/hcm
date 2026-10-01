import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/rbac";
import { catalogEmail } from "@/lib/email-catalog";
import { PageHeader, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const email = await catalogEmail((await params).key);
  return { title: email ? `${email.name} · Email templates` : "Email templates" };
}

// HR: one email's details and a preview rendered with sample data.
export default async function EmailTemplatePage({ params }: { params: Promise<{ key: string }> }) {
  await requireRole("HR_ADMIN");
  const email = await catalogEmail((await params).key);
  if (!email) notFound();
  const rendered = await email.render();

  const details: [string, string | undefined][] = [
    ["When", email.trigger],
    ["From", email.from],
    ["To", email.to],
    ["CC", email.cc],
    ["Reply-to", email.replyTo],
    ["Subject", rendered.subject],
  ];

  return (
    <PageShell width="md">
      <PageHeader
        title={email.name}
        description="Preview with sample data. Real emails use the employee's or vendor's details."
        actions={
          email.editAt ? (
            <Button variant="outline" nativeButton={false} render={<Link href={email.editAt.href} />}>
              Edit in {email.editAt.label}
            </Button>
          ) : undefined
        }
      />
      <dl className="mt-6 grid grid-cols-[6rem_1fr] gap-x-4 gap-y-2 text-sm">
        {details
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-zinc-500">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
      </dl>
      <iframe
        title={`${email.name} preview`}
        srcDoc={rendered.html}
        sandbox=""
        className="mt-6 h-[720px] w-full rounded-xl border border-zinc-200 bg-white dark:border-zinc-800"
      />
      {!email.editAt && (
        <p className="mt-3 text-xs text-zinc-500">The wording of this email is set in code. Ask a developer to change it.</p>
      )}
    </PageShell>
  );
}
