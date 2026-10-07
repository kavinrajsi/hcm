import { requirePageRole } from "@/lib/rbac";
import { PageHeader, PageShell } from "@/components/page";
import { BasecampSyncButton } from "./people-sync-button";

export const metadata = { title: "Basecamp sync" };

export default async function BasecampSyncPage() {
  await requirePageRole("HR_ADMIN");
  return (
    <PageShell width="md">
      <PageHeader
        title="Basecamp sync"
        description="Runs automatically every night at 3:30 am IST. Use this to run it now."
      />
      <section className="mt-6 flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <div className="min-w-0">
          <h2 className="font-medium">People &amp; profile pictures</h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Links Basecamp people to employees by email and refreshes their
            photos.
          </p>
        </div>
        <BasecampSyncButton />
      </section>
    </PageShell>
  );
}
