import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { AuthorizationError, requireUser } from "@/lib/rbac";
import { deviceAccess } from "@/lib/devices/access";
import {
  DEVICE_STATUS_CLASSES,
  DEVICE_STATUS_LABELS,
  DEVICE_TYPE_LABELS,
  TICKET_STATUS_LABELS,
  canAssign,
  deviceScanUrl,
  formatRupees,
} from "@/lib/devices/devices";
import { qrSvg } from "@/lib/devices/qr";
import { SALES_KINDS, SERVICE_KINDS } from "@/lib/devices/vendors";
import { osSuffix } from "@/lib/devices/os";
import { formatDateTime, formatDay } from "@/lib/format-date";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { PageHeader, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { DeviceLabel } from "../device-label";
import { DeviceForm } from "../device-form";
import { cancelTicket, setDeviceStatus } from "../actions";
import {
  AssignForm,
  ReportIssueForm,
  ResolveForm,
  ReturnForm,
  SendForServiceForm,
} from "./device-actions";

export const metadata = { title: "Device" };

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const device = await db.device.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, name: true, phone: true } },
      holder: {
        select: {
          id: true,
          name: true,
          empId: true,
          designation: true,
          avatarBlobKey: true,
          userId: true,
          manager: { select: { userId: true } },
        },
      },
      assignments: {
        orderBy: { assignedAt: "desc" },
        include: {
          employee: { select: { name: true, empId: true } },
          assignedBy: { select: { name: true, email: true } },
        },
      },
      tickets: {
        orderBy: { createdAt: "desc" },
        include: {
          serviceVendor: { select: { name: true, phone: true, altPhone: true } },
          reportedBy: { select: { name: true, email: true } },
          events: {
            orderBy: { changedAt: "asc" },
            include: { changedBy: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });
  if (!device) notFound();
  const access = deviceAccess(user, device);
  if (!access) throw new AuthorizationError();
  const manage = access === "manage";

  // AUTH_URL wins (deviceScanUrl); the request host is the fallback.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const scanUrl = deviceScanUrl(device.publicToken, host ? `${proto}://${host}` : undefined);
  const svg = await qrSvg(scanUrl);
  const [employees, salesVendors, serviceVendors] = await Promise.all([
    manage
      ? db.employee.findMany({
          where: { dateOfExit: null },
          orderBy: { name: "asc" },
          select: { id: true, empId: true, name: true },
        })
      : [],
    manage
      ? db.vendor.findMany({
          // Keep the current vendor selectable even if it's since gone inactive.
          where: {
            OR: [{ active: true, kind: { in: SALES_KINDS } }, ...(device.vendorId ? [{ id: device.vendorId }] : [])],
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [],
    device.tickets.some((ticket) => ticket.status === "OPEN")
      ? db.vendor.findMany({
          where: { active: true, kind: { in: SERVICE_KINDS } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, phone: true },
        })
      : [],
  ]);
  const who = (person: { name: string | null; email: string } | null) =>
    person ? person.name || person.email : "someone";

  return (
    <PageShell width="md">
      <PageHeader
        title={`${device.brand} ${device.model}`}
        description={
          <>
            <span className="font-mono">{device.assetTag}</span> · {DEVICE_TYPE_LABELS[device.type]}
            {osSuffix(device.os)} ·{" "}
            <span className={DEVICE_STATUS_CLASSES[device.status]}>{DEVICE_STATUS_LABELS[device.status]}</span>
          </>
        }
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href={manage ? "/devices" : "/profile"} />}>
            {manage ? "All devices" : "My profile"}
          </Button>
        }
      />

      <section className="mt-6 grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-2">
          <DeviceLabel
            svg={svg}
            assetTag={device.assetTag}
            type={device.type}
            brand={device.brand}
            model={device.model}
            holder={device.holder}
            stockTag={device.stockTag}
            className="rounded-md border border-zinc-200"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/devices/labels?ids=${device.id}&layout=single`} />}>
              Print label
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<a href={`/api/devices/${device.id}/qr`} />}>
              Download PNG
            </Button>
          </div>
          <p className="max-w-[70mm] text-xs text-zinc-500">
            The tag follows the holder ({device.stockTag ?? device.assetTag} when in stock). Reprint after each
            handover.
          </p>
          <p className="max-w-[70mm] text-xs break-all text-zinc-500">{scanUrl}</p>
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-500">Serial</dt>
          <dd>{device.serialNumber ?? "—"}</dd>
          <dt className="text-zinc-500">Specs</dt>
          <dd className="whitespace-pre-wrap">{device.specs ?? "—"}</dd>
          {device.ownership === "RENTED" && (
            <>
              <dt className="text-zinc-500">Rented</dt>
              <dd>
                {device.vendor ? (
                  manage ? (
                    <Link href={`/devices/vendors/${device.vendor.id}`} className="hover:underline">
                      {device.vendor.name}
                    </Link>
                  ) : (
                    device.vendor.name
                  )
                ) : (
                  "Vendor not set"
                )}
                {manage && device.monthlyRent ? ` · ${formatRupees(Number(device.monthlyRent))}/month` : ""}
                {device.vendorRef ? ` · their ref ${device.vendorRef}` : ""}
              </dd>
            </>
          )}
          <dt className="text-zinc-500">{device.ownership === "RENTED" ? "Rented since" : "Purchased"}</dt>
          <dd>
            {device.purchaseDate ? formatDay(device.purchaseDate) : "—"}
            {device.vendor && device.ownership !== "RENTED" && (
              <>
                {" from "}
                {manage ? (
                  <Link href={`/devices/vendors/${device.vendor.id}`} className="hover:underline">
                    {device.vendor.name}
                  </Link>
                ) : (
                  device.vendor.name
                )}
              </>
            )}
            {manage && device.purchasePrice ? ` · ₹${Number(device.purchasePrice).toLocaleString("en-IN")}` : ""}
          </dd>
          <dt className="text-zinc-500">Warranty</dt>
          <dd>
            {device.warrantyEndsOn
              ? `${device.warrantyEndsOn < new Date() ? "ended" : "until"} ${formatDay(device.warrantyEndsOn)}`
              : "—"}
          </dd>
          {device.notes && (
            <>
              <dt className="text-zinc-500">Notes</dt>
              <dd className="whitespace-pre-wrap">{device.notes}</dd>
            </>
          )}
        </dl>
      </section>

      <Section title="Holder">
        {device.holder ? (
          <div className="flex items-center gap-3">
            <EmployeeAvatar name={device.holder.name} avatarKey={device.holder.avatarBlobKey} />
            <div>
              <p className="font-medium">
                {manage ? (
                  <Link href={`/employees/${device.holder.id}`} className="hover:underline">
                    {device.holder.name}
                  </Link>
                ) : (
                  device.holder.name
                )}
              </p>
              <p className="text-xs text-zinc-500">
                {device.holder.empId} · {device.holder.designation}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Nobody — {DEVICE_STATUS_LABELS[device.status].toLowerCase()}.</p>
        )}
        {manage && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {canAssign(device.status) && (
              <AssignForm
                key={`assign-${device.assetTag}`}
                deviceId={device.id}
                employees={employees}
                reassign={Boolean(device.holder)}
              />
            )}
            {device.holder && device.status !== "IN_SERVICE" && <ReturnForm key={`return-${device.assetTag}`} deviceId={device.id} />}
          </div>
        )}
      </Section>

      <Section title="Issues & service">
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="mb-2 text-sm font-medium">Report an issue</h3>
          <ReportIssueForm deviceId={device.id} />
        </div>
        {device.tickets.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">No issues reported.</p>
        ) : (
          <ol className="mt-4 flex flex-col gap-3">
            {device.tickets.map((ticket) => {
              const live = ticket.status === "OPEN" || ticket.status === "SENT_FOR_SERVICE";
              return (
                <li key={ticket.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{ticket.title}</p>
                    <span className="text-xs text-zinc-500">{TICKET_STATUS_LABELS[ticket.status]}</span>
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{ticket.description}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Reported by {who(ticket.reportedBy)} on {formatDateTime(ticket.createdAt)}
                    {ticket.serviceVendor &&
                      ` · service: ${ticket.serviceVendor.name}${
                        ticket.serviceVendor.phone ? ` (${ticket.serviceVendor.phone}` : ""
                      }${ticket.serviceVendor.altPhone ? `, ${ticket.serviceVendor.altPhone}` : ""}${
                        ticket.serviceVendor.phone ? ")" : ""
                      }`}
                    {ticket.expectedBackOn && ` · expected back ${formatDay(ticket.expectedBackOn)}`}
                    {ticket.cost && ` · cost ₹${Number(ticket.cost).toLocaleString("en-IN")}`}
                  </p>
                  <ul className="mt-2 border-l border-zinc-200 pl-3 text-xs text-zinc-500 dark:border-zinc-800">
                    {ticket.events.map((event) => (
                      <li key={event.id}>
                        {formatDateTime(event.changedAt)} · {TICKET_STATUS_LABELS[event.toStatus as keyof typeof TICKET_STATUS_LABELS] ?? event.toStatus}
                        {" by "}
                        {who(event.changedBy)}
                        {event.note ? ` — ${event.note}` : ""}
                      </li>
                    ))}
                  </ul>
                  {live && (
                    <div className="mt-3 flex flex-col gap-2">
                      {ticket.status === "OPEN" && (
                        <SendForServiceForm ticketId={ticket.id} vendors={serviceVendors} />
                      )}
                      <ResolveForm ticketId={ticket.id} outForService={ticket.status === "SENT_FOR_SERVICE"} />
                      {ticket.status === "OPEN" && (
                        <form action={cancelTicket}>
                          <input type="hidden" name="ticketId" value={ticket.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Cancel issue
                          </Button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <Section title="Who has had it">
        {device.assignments.length === 0 ? (
          <p className="text-sm text-zinc-500">Never assigned.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {device.assignments.map((assignment) => (
              <li key={assignment.id} className="px-4 py-2">
                <p>
                  <span className="font-medium">{assignment.employee.name}</span>
                  <span className="text-zinc-500"> · {assignment.employee.empId}</span>
                </p>
                <p className="text-xs text-zinc-500">
                  {formatDay(assignment.assignedAt)} → {assignment.returnedAt ? formatDay(assignment.returnedAt) : "now"}
                  {assignment.conditionOut && ` · out: ${assignment.conditionOut}`}
                  {assignment.conditionIn && ` · back: ${assignment.conditionIn}`}
                  {assignment.assignedBy && ` · by ${who(assignment.assignedBy)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {manage && (
        <Section title="Edit">
          <DeviceForm
            vendors={salesVendors}
            addVendorHref={`/devices/vendors/new?back=/devices/${device.id}`}
            values={{
              id: device.id,
              type: device.type,
              brand: device.brand,
              model: device.model,
              serialNumber: device.serialNumber ?? "",
              specs: device.specs ?? "",
              os: device.os ?? "",
              purchaseDate: day(device.purchaseDate),
              purchasePrice: device.purchasePrice ? String(device.purchasePrice) : "",
              ownership: device.ownership,
              monthlyRent: device.monthlyRent ? String(device.monthlyRent) : "",
              vendorRef: device.vendorRef ?? "",
              vendorId: device.vendorId ?? "",
              warrantyEndsOn: day(device.warrantyEndsOn),
              notes: device.notes ?? "",
            }}
          />
          {device.status !== "IN_SERVICE" && (
            <div className="mt-4 flex flex-wrap gap-2">
              {(device.status === "RETIRED" || device.status === "LOST"
                ? (["IN_STOCK"] as const)
                : (["RETIRED", "LOST"] as const)
              ).map((status) => (
                <form key={status} action={setDeviceStatus}>
                  <input type="hidden" name="deviceId" value={device.id} />
                  <input type="hidden" name="status" value={status} />
                  <Button type="submit" variant={status === "IN_STOCK" ? "outline" : "destructive"} size="sm">
                    {status === "IN_STOCK" ? "Back to stock" : status === "RETIRED" ? "Retire device" : "Mark lost"}
                  </Button>
                </form>
              ))}
            </div>
          )}
        </Section>
      )}
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
