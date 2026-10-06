import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import type { DeviceStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { optionsByCount, parseTableParams, stringParam } from "@/lib/table-params";
import { dayRange } from "@/lib/date-filter";
import {
  DEVICE_STATUSES,
  DEVICE_STATUS_CLASSES,
  DEVICE_STATUS_LABELS,
  DEVICE_TYPES,
  DEVICE_TYPE_LABELS,
  isDeviceStatus,
  isDeviceType,
  DEVICE_OWNERSHIPS,
  DEVICE_OWNERSHIP_LABELS,
  formatRupees,
  isDeviceOwnership,
} from "@/lib/devices/devices";
import { AddFilter } from "@/components/data-table/add-filter";
import { DEVICE_OSES, DEVICE_OS_LABELS, isDeviceOs, osSuffix } from "@/lib/devices/os";
import { CountChips } from "@/components/data-table/count-chips";
import { TablePagination } from "@/components/data-table/pagination";
import { ListCard } from "@/components/list-card";
import { Button } from "@/components/ui/button";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Devices" };

type Search = Record<string, string | string[] | undefined>;

export default async function DevicesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePageRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);
  const status: DeviceStatus | undefined = isDeviceStatus(raw.status) ? raw.status : undefined;
  const brand = stringParam(raw.brand);
  const vendor = stringParam(raw.vendor);
  const os = isDeviceOs(raw.os) ? raw.os : undefined;
  const ownership = isDeviceOwnership(raw.ownership) ? raw.ownership : undefined;
  const purchased = dayRange({
    preset: stringParam(raw.purchased),
    from: stringParam(raw.from),
    to: stringParam(raw.to),
  });

  // Managers see only their direct reports' devices (filter options too).
  const scope: Prisma.DeviceWhereInput =
    user.role === "MANAGER" ? { holder: { manager: { userId: user.id } } } : {};
  // ?holder=left: devices still assigned to someone who has left (exit list links here).
  const heldByLeavers = raw.holder === "left";
  const where: Prisma.DeviceWhereInput = {
    ...scope,
    ...(heldByLeavers ? { AND: [{ holder: { dateOfExit: { not: null } } }] } : {}),
    ...(isDeviceType(params.type) ? { type: params.type } : {}),
    ...(status ? { status } : {}),
    ...(brand ? { brand } : {}),
    ...(os ? { os } : {}),
    ...(ownership ? { ownership } : {}),
    ...(vendor ? { vendor: { name: vendor } } : {}),
    ...(purchased ? { purchaseDate: purchased } : {}),
    ...(params.q
      ? {
          OR: [
            { assetTag: { contains: params.q, mode: "insensitive" } },
            { brand: { contains: params.q, mode: "insensitive" } },
            { model: { contains: params.q, mode: "insensitive" } },
            { serialNumber: { contains: params.q, mode: "insensitive" } },
            { holder: { name: { contains: params.q, mode: "insensitive" } } },
            { holder: { empId: { contains: params.q, mode: "insensitive" } } },
            { stockTag: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const leaverHeld = db.device.count({ where: { ...scope, AND: [{ holder: { dateOfExit: { not: null } } }] } });
  const [devices, total, openTickets, types, statuses, brands, vendors, oses, ownerships, rent] = await Promise.all([
    db.device.findMany({
      where,
      orderBy: { assetTag: "asc" },
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        assetTag: true,
        type: true,
        brand: true,
        model: true,
        os: true,
        ownership: true,
        status: true,
        holder: { select: { name: true, empId: true, dateOfExit: true } },
        _count: { select: { tickets: { where: { status: { in: ["OPEN", "SENT_FOR_SERVICE"] } } } } },
      },
    }),
    db.device.count({ where }),
    db.deviceTicket.count({
      where: { status: { in: ["OPEN", "SENT_FOR_SERVICE"] }, device: scope },
    }),
    db.device.groupBy({ by: ["type"], where: scope, _count: true }),
    db.device.groupBy({ by: ["status"], where: scope, _count: true }),
    db.device.groupBy({ by: ["brand"], where: scope, _count: true }),
    db.vendor.findMany({
      where: { devices: { some: scope } },
      orderBy: { name: "asc" },
      select: { name: true, _count: { select: { devices: { where: scope } } } },
    }),
    db.device.groupBy({ by: ["os"], where: scope, _count: true }),
    db.device.groupBy({ by: ["ownership"], where: scope, _count: true }),
    // Monthly rent of the rented devices in the current filter (HR only).
    db.device.aggregate({
      where: { AND: [where, { ownership: "RENTED", status: { notIn: ["RETIRED", "LOST"] } }] },
      _sum: { monthlyRent: true },
    }),
  ]);
  const ownershipCounts = new Map(ownerships.map((group) => [group.ownership as string, group._count]));
  const monthlyRent = Number(rent._sum.monthlyRent ?? 0);
  const heldByLeaversCount = await leaverHeld;
  const osCounts = new Map(oses.map((group) => [group.os as string, group._count]));
  const typeCounts = new Map(types.map((group) => [group.type as string, group._count]));
  const statusCounts = new Map(statuses.map((group) => [group.status as string, group._count]));

  const holderText = (device: (typeof devices)[number]) =>
    device.holder ? `${device.holder.name} · ${device.holder.empId}` : "—";
  // Assigned to someone who has left: still to be collected.
  const holderLeft = (device: (typeof devices)[number]) =>
    device.holder?.dateOfExit ? (
      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        Holder left
      </span>
    ) : null;

  return (
    <PageShell>
      <PageHeader
        title="Devices"
        description={`Laptops, mobiles, iPads, mice and hubs, who has them, and their repairs. ${openTickets} open issue${openTickets === 1 ? "" : "s"}.${
          user.role === "HR_ADMIN" && monthlyRent > 0 ? ` Rent: ${formatRupees(monthlyRent)}/month.` : ""
        }`}
        actions={
          user.role === "HR_ADMIN" ? (
            <Button nativeButton={false} render={<Link href="/devices/new" />}>Add device</Button>
          ) : undefined
        }
      />

      <CountChips
        items={[
          ...DEVICE_STATUSES.map((value) => ({
            key: value,
            label: DEVICE_STATUS_LABELS[value],
            count: statusCounts.get(value) ?? 0,
          })),
          { key: "RENTED", label: "Rented", count: ownershipCounts.get("RENTED") ?? 0 },
        ]}
      />

      <div className="mt-5 flex flex-col gap-3 md:mt-6 md:flex-row md:items-center">
        <div className="min-w-0 md:flex-1">
          <AddFilter
            search={{ param: "q", hint: "Asset tag, model, serial, holder or emp ID" }}
            fields={[
              {
                param: "holder",
                label: "Holder",
                options: [{ value: "left", label: "Has left (to collect)", count: heldByLeaversCount }],
              },
              {
                param: "type",
                label: "Type",
                options: DEVICE_TYPES.map((type) => ({
                  value: type,
                  label: DEVICE_TYPE_LABELS[type],
                  count: typeCounts.get(type) ?? 0,
                })),
              },
              {
                param: "status",
                label: "Status",
                options: DEVICE_STATUSES.map((value) => ({
                  value,
                  label: DEVICE_STATUS_LABELS[value],
                  count: statusCounts.get(value) ?? 0,
                })),
              },
              {
                param: "ownership",
                label: "Owned / rented",
                options: DEVICE_OWNERSHIPS.map((value) => ({
                  value,
                  label: DEVICE_OWNERSHIP_LABELS[value],
                  count: ownershipCounts.get(value) ?? 0,
                })),
              },
              {
                param: "os",
                label: "OS",
                options: DEVICE_OSES.map((value) => ({
                  value,
                  label: DEVICE_OS_LABELS[value],
                  count: osCounts.get(value) ?? 0,
                })),
              },
              {
                param: "brand",
                label: "Brand",
                options: optionsByCount(brands, (group) => group.brand),
              },
              {
                param: "vendor",
                label: "Vendor",
                options: vendors.map((row) => ({ value: row.name, count: row._count.devices })),
              },
            ]}
            date={{
              param: "purchased",
              label: "Purchased",
              presets: ["30d", "month", "year"],
            }}
          />
        </div>
      </div>

      <div className="mt-4">
        <DesktopTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset tag</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Open issues</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-zinc-500">
                    No devices{user.role === "HR_ADMIN" ? " yet. Add the first one." : " for your team."}
                  </TableCell>
                </TableRow>
              )}
              {devices.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>
                    <Link href={`/devices/${device.id}`} className="font-mono font-medium hover:underline">
                      {device.assetTag}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {DEVICE_TYPE_LABELS[device.type]}
                    {osSuffix(device.os)} · {device.brand} {device.model}
                    {device.ownership === "RENTED" && <span className="ml-2 text-xs text-zinc-500">Rented</span>}
                  </TableCell>
                  <TableCell>
                    {holderText(device)}
                    {holderLeft(device)}
                  </TableCell>
                  <TableCell className={DEVICE_STATUS_CLASSES[device.status]}>
                    {DEVICE_STATUS_LABELS[device.status]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {device._count.tickets || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DesktopTable>
        <MobileList empty="No devices." isEmpty={devices.length === 0}>
          {devices.map((device) => (
            <ListCard
              key={device.id}
              href={`/devices/${device.id}`}
              title={`${device.brand} ${device.model}`}
              subtitle={<span className="font-mono">{device.assetTag}</span>}
              badge={
                <span className={`text-xs ${DEVICE_STATUS_CLASSES[device.status]}`}>
                  {DEVICE_STATUS_LABELS[device.status]}
                </span>
              }
              meta={
                <>
                  <span>
                    {DEVICE_TYPE_LABELS[device.type]}
                    {osSuffix(device.os)}
                  </span>
                  <span>
                    {holderText(device)}
                    {holderLeft(device)}
                  </span>
                  {device._count.tickets > 0 && <span>{device._count.tickets} open issue(s)</span>}
                </>
              }
            />
          ))}
        </MobileList>
      </div>

      <div className="mt-4">
        <TablePagination page={params.page} total={total} searchParams={raw} pathname="/devices" />
      </div>
    </PageShell>
  );
}
