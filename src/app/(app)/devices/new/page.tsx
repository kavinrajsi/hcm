import { db } from "@/lib/db";
import { SALES_KINDS } from "@/lib/devices/vendors";
import { requirePageRole } from "@/lib/rbac";
import { PageHeader, PageShell } from "@/components/page";
import { DeviceForm, EMPTY_DEVICE } from "../device-form";

export const metadata = { title: "Add device" };

/** "Dell Latitude 5440" → brand "Dell", model "Latitude 5440". */
function splitItemName(name: string) {
  const [brand, ...rest] = name.trim().split(/\s+/);
  return rest.length ? { brand, model: rest.join(" ") } : { brand: "", model: name.trim() };
}

export default async function NewDevicePage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  await requirePageRole("HR_ADMIN");
  const requestId = (await searchParams).request;
  const request =
    typeof requestId === "string"
      ? await db.devicePurchaseRequest.findFirst({
          where: { id: requestId, status: { in: ["PENDING", "SENT"] } },
          select: { id: true, type: true, os: true, itemName: true, vendorId: true, employeeId: true, notes: true },
        })
      : null;
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
        description={
          request
            ? `Received: ${request.itemName}. Check the details, add the serial number, and save to close the request.`
            : "It gets an asset tag and a QR label to print on the next page."
        }
      />
      <div className="mt-6">
        <DeviceForm
          values={
            request
              ? {
                  ...EMPTY_DEVICE,
                  type: request.type,
                  os: request.os ?? "",
                  ...splitItemName(request.itemName),
                  vendorId: request.vendorId,
                  purchaseDate: new Date().toISOString().slice(0, 10),
                  notes: request.notes ?? "",
                }
              : EMPTY_DEVICE
          }
          employees={employees}
          vendors={vendors}
          addVendorHref="/devices/vendors/new?back=/devices/new"
          initialHolder={request?.employeeId ?? ""}
          requestId={request?.id}
        />
      </div>
    </PageShell>
  );
}
