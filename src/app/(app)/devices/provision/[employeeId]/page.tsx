import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { DEVICE_STATUS_LABELS, DEVICE_TYPE_LABELS } from "@/lib/devices/devices";
import { SALES_KINDS } from "@/lib/devices/vendors";
import { vendorCatalog, vendorRecipients } from "@/lib/devices/purchase";
import { DEVICE_OS_LABELS, osSuffix, recommendedOs } from "@/lib/devices/os";
import { laptopOsMap } from "@/lib/devices/os-settings";
import { ONBOARD_MESSAGES } from "@/lib/basecamp-onboard";
import { formatDay } from "@/lib/format-date";
import { PageHeader, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { StandbyAssign } from "../standby-list";
import { OrderForm } from "../order-form";
import { RequestList } from "../request-list";
import { REQUEST_INCLUDE, toRequestRow } from "../rows";

export const metadata = { title: "Device for new joiner" };

// After adding an employee: give them a standby device if there is one,
// otherwise ask a vendor for one by email.

export default async function ProvisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ new?: string; basecamp?: string }>;
}) {
  await requireRole("HR_ADMIN");
  const { employeeId } = await params;
  const query = await searchParams;
  const isNew = query.new === "1";
  const basecampStatus = query.basecamp as keyof typeof ONBOARD_MESSAGES | undefined;
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true, empId: true, designation: true, dateOfJoining: true },
  });
  if (!employee) notFound();

  const [held, standbyRows, vendors, requests, osMap] = await Promise.all([
    db.device.findMany({
      where: { holderId: employee.id },
      orderBy: { assetTag: "asc" },
      select: { id: true, assetTag: true, type: true, brand: true, model: true, status: true },
    }),
    db.device.findMany({
      where: { status: "IN_STOCK" },
      orderBy: [{ type: "asc" }, { assetTag: "asc" }],
      select: { id: true, assetTag: true, type: true, os: true, brand: true, model: true, specs: true },
    }),
    db.vendor.findMany({
      where: { active: true, kind: { in: SALES_KINDS } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        contacts: {
          select: { id: true, name: true, role: true, email: true, isPrimary: true, position: true },
        },
        devices: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { type: true, brand: true, model: true },
        },
      },
    }),
    db.devicePurchaseRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: "desc" },
      include: REQUEST_INCLUDE,
    }),
    laptopOsMap(),
  ]);
  const wantOs = recommendedOs(employee.designation, osMap);
  // Laptops with the role's usual OS first; others stay available.
  const fit = (device: (typeof standbyRows)[number]) =>
    device.type === "LAPTOP" && wantOs ? (device.os === wantOs ? 0 : 1) : 0;
  const standby = [...standbyRows].sort((a, b) => fit(a) - fit(b));
  const joining = employee.dateOfJoining.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageShell width="md">
      <PageHeader
        title={`Device for ${employee.name}`}
        description={`${employee.empId} · ${employee.designation} · joins ${formatDay(employee.dateOfJoining)}`}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href={`/employees/${employee.id}`} />}>
            {isNew ? "Skip for now" : "Back to employee"}
          </Button>
        }
      />
      {isNew && (
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">
          {employee.name} has been added. Give them a standby device, or ask a vendor for one.
        </p>
      )}
      {basecampStatus && basecampStatus in ONBOARD_MESSAGES && (
        <p
          className={
            basecampStatus === "failed" || basecampStatus === "skipped"
              ? "mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              : "mt-2 rounded-md bg-muted px-3 py-2 text-sm"
          }
        >
          Basecamp: {ONBOARD_MESSAGES[basecampStatus]}
          {(basecampStatus === "failed" || basecampStatus === "skipped") && (
            <>
              {" "}
              <Link href={`/employees/${employee.id}`} className="underline">
                Try again from their page
              </Link>
            </>
          )}
        </p>
      )}

      <p className="mt-4 text-sm">
        {wantOs ? (
          <>
            <span className="font-medium">{employee.designation}</span> usually gets a{" "}
            <span className="font-medium">{DEVICE_OS_LABELS[wantOs]}</span> laptop. Pick another if the role needs it.
          </>
        ) : (
          <span className="text-zinc-500">
            No usual laptop OS set for {employee.designation}.{" "}
            <Link href="/devices/settings" className="underline">
              Set one
            </Link>
          </span>
        )}
      </p>

      {held.length > 0 && (
        <section className="mt-6">
          <h2 className="text-base font-semibold">Already has</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {held.map((device) => (
              <li key={device.id}>
                <Link href={`/devices/${device.id}`} className="hover:underline">
                  <span className="font-mono">{device.assetTag}</span> {DEVICE_TYPE_LABELS[device.type]} · {device.brand}{" "}
                  {device.model}
                </Link>
                <span className="text-zinc-500"> · {DEVICE_STATUS_LABELS[device.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-base font-semibold">1. Standby devices ({standby.length})</h2>
        {standby.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Nothing in stock. Order one from a vendor below.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {standby.map((device) => (
              <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0">
                  <Link href={`/devices/${device.id}`} className="hover:underline">
                    <span className="font-mono">{device.assetTag}</span> {DEVICE_TYPE_LABELS[device.type]}
                    {osSuffix(device.os)} · {device.brand} {device.model}
                  </Link>
                  {device.type === "LAPTOP" && wantOs && (
                    <span
                      className={
                        device.os === wantOs
                          ? "ml-2 text-xs text-emerald-600 dark:text-emerald-400"
                          : "ml-2 text-xs text-zinc-500"
                      }
                    >
                      {device.os === wantOs ? "Recommended" : "Other OS: OK if the role needs it"}
                    </span>
                  )}
                  {device.specs && <span className="block text-xs text-zinc-500">{device.specs}</span>}
                </span>
                <StandbyAssign deviceId={device.id} employeeId={employee.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">
          2. {standby.length ? "None of these fit? " : ""}Order from a vendor
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Emails the vendor from noreply@madarth.com. You&rsquo;ll see the email before it goes.{" "}
          <Link href="/devices/settings" className="underline">
            Change reply-to and CC
          </Link>
        </p>
        <div className="mt-3">
          <OrderForm
            recommendedOs={wantOs}
            designation={employee.designation}
            employeeId={employee.id}
            defaultNeededBy={joining >= today ? joining : ""}
            vendors={vendors.map((vendor) => ({
              id: vendor.id,
              name: vendor.name,
              recipients: vendorRecipients(vendor).map(({ key, label }) => ({ key, label })),
              catalog: vendorCatalog(vendor.devices),
            }))}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">Requests for {employee.name}</h2>
        <div className="mt-3">
          <RequestList rows={requests.map(toRequestRow)} />
        </div>
      </section>
    </PageShell>
  );
}
