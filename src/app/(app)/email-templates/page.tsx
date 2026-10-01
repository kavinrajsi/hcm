import Link from "next/link";
import { requireRole } from "@/lib/rbac";
import { emailCatalog, type CatalogEmail } from "@/lib/email-catalog";
import { PageHeader, PageShell } from "@/components/page";

export const metadata = { title: "Email templates" };

const GROUPS: CatalogEmail["group"][] = ["Accounts", "Employees", "Reminders", "Letters", "Devices"];

// HR: every email HCM sends, when it goes out and to whom. Each opens a
// preview built by the real template with sample data.
export default async function EmailTemplatesPage() {
  await requireRole("HR_ADMIN");
  const emails = await emailCatalog();
  const subjects = await Promise.all(emails.map((email) => email.render().then((rendered) => rendered.subject)));
  const subjectOf = new Map(emails.map((email, index) => [email.key, subjects[index]]));

  return (
    <PageShell width="md">
      <PageHeader
        title="Email templates"
        description={`All ${emails.length} emails HCM sends, when they go out and who gets them. Open one to preview it.`}
      />
      <div className="mt-6 flex flex-col gap-8">
        {GROUPS.map((group) => {
          const rows = emails.filter((email) => email.group === group);
          if (rows.length === 0) return null;
          return (
            <section key={group}>
              <h2 className="text-base font-semibold">{group}</h2>
              <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {rows.map((email) => (
                  <li key={email.key}>
                    <Link
                      href={`/email-templates/${email.key}`}
                      className="flex flex-col gap-1 p-4 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <span className="font-medium">{email.name}</span>
                      <span className="text-zinc-600 dark:text-zinc-400">{email.trigger}</span>
                      <span className="text-xs text-zinc-500">
                        To: {email.to}
                        {email.cc ? ` · CC: ${email.cc}` : ""}
                      </span>
                      <span className="truncate text-xs text-zinc-500">Subject: {subjectOf.get(email.key)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
