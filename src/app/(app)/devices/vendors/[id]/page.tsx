import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import {
  DEVICE_STATUS_LABELS,
  DEVICE_TYPE_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/devices/devices";
import { VENDOR_KIND_LABELS } from "@/lib/devices/vendors";
import { formatDay } from "@/lib/format-date";
import { PageHeader, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { VendorForm } from "../vendor-form";
import { setVendorActive } from "../actions";

export const metadata = { title: "Vendor" };

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("HR_ADMIN");
  const { id } = await params;
  const vendor = await db.vendor.findUnique({
    where: { id },
    include: {
      devices: {
        orderBy: { assetTag: "asc" },
        select: { id: true, assetTag: true, type: true, brand: true, model: true, status: true, purchaseDate: true },
      },
      serviceTickets: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          sentAt: true,
          returnedAt: true,
          cost: true,
          device: { select: { id: true, assetTag: true } },
        },
      },
    },
  });
  if (!vendor) notFound();
  const serviceCost = vendor.serviceTickets.reduce((sum, ticket) => sum + Number(ticket.cost ?? 0), 0);

  return (
    <PageShell width="md">
      <PageHeader
        title={vendor.name}
        description={`${VENDOR_KIND_LABELS[vendor.kind]}${vendor.active ? "" : " · inactive"}`}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/devices/vendors" />}>
              All vendors
            </Button>
            <form action={setVendorActive}>
              <input type="hidden" name="id" value={vendor.id} />
              <input type="hidden" name="active" value={vendor.active ? "false" : "true"} />
              <Button type="submit" variant={vendor.active ? "destructive" : "outline"}>
                {vendor.active ? "Mark inactive" : "Make active"}
              </Button>
            </form>
          </>
        }
      />

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-zinc-500">Contact</dt>
        <dd>{vendor.contactPerson ?? "—"}</dd>
        <dt className="text-zinc-500">Phone</dt>
        <dd>
          {vendor.phone ? (
            <a href={`tel:${vendor.phone.replace(/\s/g, "")}`} className="hover:underline">
              {vendor.phone}
            </a>
          ) : (
            <span className="text-amber-600">Not set — add one below</span>
          )}
        </dd>
        <dt className="text-zinc-500">Alternative</dt>
        <dd>
          {vendor.altPhone ? (
            <a href={`tel:${vendor.altPhone.replace(/\s/g, "")}`} className="hover:underline">
              {vendor.altPhone}
            </a>
          ) : (
            "—"
          )}
        </dd>
        <dt className="text-zinc-500">Email</dt>
        <dd>
          {vendor.email ? (
            <a href={`mailto:${vendor.email}`} className="hover:underline">
              {vendor.email}
            </a>
          ) : (
            "—"
          )}
        </dd>
        {vendor.address && (
          <>
            <dt className="text-zinc-500">Address</dt>
            <dd className="whitespace-pre-wrap">{vendor.address}</dd>
          </>
        )}
      </dl>

      <section className="mt-8">
        <h2 className="text-base font-semibold">Devices bought ({vendor.devices.length})</h2>
        {vendor.devices.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">None.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {vendor.devices.map((device) => (
              <li key={device.id} className="flex justify-between gap-3 px-4 py-2">
                <Link href={`/devices/${device.id}`} className="hover:underline">
                  <span className="font-mono">{device.assetTag}</span> {DEVICE_TYPE_LABELS[device.type]} · {device.brand} {device.model}
                </Link>
                <span className="shrink-0 text-xs text-zinc-500">
                  {device.purchaseDate ? formatDay(device.purchaseDate) : ""} {DEVICE_STATUS_LABELS[device.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">
          Repairs ({vendor.serviceTickets.length})
          {serviceCost > 0 && (
            <span className="ml-2 text-sm font-normal text-zinc-500">₹{serviceCost.toLocaleString("en-IN")} spent</span>
          )}
        </h2>
        {vendor.serviceTickets.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">None.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {vendor.serviceTickets.map((ticket) => (
              <li key={ticket.id} className="flex justify-between gap-3 px-4 py-2">
                <Link href={`/devices/${ticket.device.id}`} className="hover:underline">
                  <span className="font-mono">{ticket.device.assetTag}</span> {ticket.title}
                </Link>
                <span className="shrink-0 text-xs text-zinc-500">
                  {ticket.sentAt ? formatDay(ticket.sentAt) : ""}
                  {ticket.returnedAt ? ` → ${formatDay(ticket.returnedAt)}` : ""} · {TICKET_STATUS_LABELS[ticket.status]}
                  {ticket.cost ? ` · ₹${Number(ticket.cost).toLocaleString("en-IN")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">Edit</h2>
        <div className="mt-3">
          <VendorForm
            values={{
              id: vendor.id,
              name: vendor.name,
              kind: vendor.kind,
              contactPerson: vendor.contactPerson ?? "",
              email: vendor.email ?? "",
              phone: vendor.phone,
              altPhone: vendor.altPhone ?? "",
              address: vendor.address ?? "",
              notes: vendor.notes ?? "",
            }}
          />
        </div>
      </section>
    </PageShell>
  );
}
