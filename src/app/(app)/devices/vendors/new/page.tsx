import { requireRole } from "@/lib/rbac";
import { PageHeader, PageShell } from "@/components/page";
import { EMPTY_VENDOR, VendorForm } from "../vendor-form";

export const metadata = { title: "Add vendor" };

export default async function NewVendorPage({
  searchParams,
}: {
  searchParams: Promise<{ back?: string }>;
}) {
  await requireRole("HR_ADMIN");
  const { back } = await searchParams;
  return (
    <PageShell width="md">
      <PageHeader title="Add vendor" description="A shop that sells devices or a service centre that repairs them." />
      <div className="mt-6">
        <VendorForm
          values={EMPTY_VENDOR}
          back={typeof back === "string" && back.startsWith("/devices") ? back : undefined}
        />
      </div>
    </PageShell>
  );
}
