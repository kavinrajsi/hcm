import { db } from "@/lib/db";
import { SALES_KINDS } from "@/lib/devices/vendors";
import { requireRole } from "@/lib/rbac";
import { PageHeader, PageShell } from "@/components/page";
import { DeviceForm, EMPTY_DEVICE } from "../device-form";

export const metadata = { title: "Add device" };

export default async function NewDevicePage() {
  await requireRole("HR_ADMIN");
  const [employees, vendors] = await Promise.all([
    db.employee.findMany({
      where: { dateOfExit: null },
      orderBy: { name: "asc" },
      select: { id: true, empId: true, name: true },
    }),
    db.vendor.findMany({
      where: { active: true, kind: { in: SALES_KINDS } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return (
    <PageShell width="md">
      <PageHeader
        title="Add device"
        description="It gets an asset tag and a QR label to print on the next page."
      />
      <div className="mt-6">
        <DeviceForm
          values={EMPTY_DEVICE}
          employees={employees}
          vendors={vendors}
          addVendorHref="/devices/vendors/new?back=/devices/new"
        />
      </div>
    </PageShell>
  );
}
