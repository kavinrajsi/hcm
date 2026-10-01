import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { SALES_KINDS } from "@/lib/devices/vendors";
import { vendorCatalog } from "@/lib/devices/purchase";
import { PageHeader, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { OrderForm } from "../provision/order-form";
import { RequestList } from "../provision/request-list";
import { REQUEST_INCLUDE, toRequestRow } from "../provision/rows";

export const metadata = { title: "Device requests" };

export default async function RequestsPage() {
  await requireRole("HR_ADMIN");
  const [requests, vendors] = await Promise.all([
    db.devicePurchaseRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: REQUEST_INCLUDE,
    }),
    db.vendor.findMany({
      where: { active: true, kind: { in: SALES_KINDS } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        devices: { orderBy: { createdAt: "desc" }, take: 50, select: { type: true, brand: true, model: true } },
      },
    }),
  ]);
  const open = requests.filter((request) => request.status === "PENDING" || request.status === "SENT");
  const closed = requests.filter((request) => request.status === "RECEIVED" || request.status === "CANCELLED");

  return (
    <PageShell width="md">
      <PageHeader
        title="Device requests"
        description="Devices asked for from vendors by email. Mark one received to add the device."
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/devices/settings" />}>
              Email settings
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/devices" />}>
              Devices
            </Button>
          </>
        }
      />
      <section className="mt-6">
        <h2 className="text-base font-semibold">Waiting ({open.length})</h2>
        <div className="mt-3">
          <RequestList rows={open.map(toRequestRow)} showEmployee />
        </div>
      </section>
      <details className="mt-8">
        <summary className="cursor-pointer text-base font-semibold">New request (not for a joiner)</summary>
        <div className="mt-3">
          <OrderForm
            employeeId={null}
            defaultNeededBy=""
            vendors={vendors.map((vendor) => ({
              id: vendor.id,
              name: vendor.name,
              email: vendor.email,
              catalog: vendorCatalog(vendor.devices),
            }))}
          />
        </div>
      </details>
      {closed.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold">Done ({closed.length})</h2>
          <div className="mt-3">
            <RequestList rows={closed.map(toRequestRow)} showEmployee />
          </div>
        </section>
      )}
    </PageShell>
  );
}
