import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { listParam, optionsByCount, parseTableParams, stringParam } from "@/lib/table-params";
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
import { shownModel } from "@/lib/devices/devices";
import { FilterDateRange, FilterMultiSelect, FilterSearch } from "@/components/data-table/filter-bar";
import { DEVICE_OSES, DEVICE_OS_LABELS, isDeviceOs, osSuffix } from "@/lib/devices/os";
import { CountChips } from "@/components/data-table/count-chips";
import { DEVICE_CHIPS } from "@/lib/chip-tones";
import { TablePagination } from "@/components/data-table/pagination";
import { ListCard } from "@/components/list-card";
import { EmployeeAvatar } from "@/components/employee-avatar";
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
  // Multi-selects arrive as repeated params; enum values are validated, unknown ones ignored.
  const deviceTypes = listParam(raw.type).filter(isDeviceType);
  const statuses = listParam(raw.status).filter(isDeviceStatus);
  const brands = listParam(raw.brand);
  const vendors = listParam(raw.vendor);
  const oses = listParam(raw.os).filter(isDeviceOs);
  const ownerships = listParam(raw.ownership).filter(isDeviceOwnership);
  const purchased = dayRange({
    preset: stringParam(raw.purchased),
    from: stringParam(raw.from),
    to: stringParam(raw.to),
  });

  // Managers see only their direct reports' devices (filter options too).
  const scope: Prisma.DeviceWhereInput =
    user.role === "MANAGER" ? { holder: { manager: { userId: user.id } } } : {};
  // ?holder=left: devices still assigned to someone who has left (exit list links here).
  const heldByLeavers = listParam(raw.holder).includes("left");
  const where: Prisma.DeviceWhereInput = {
    ...scope,
    ...(heldByLeavers ? { AND: [{ holder: { dateOfExit: { not: null } } }] } : {}),
    ...(deviceTypes.length ? { type: { in: deviceTypes } } : {}),
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(brands.length ? { brand: { in: brands } } : {}),
    ...(oses.length ? { os: { in: oses } } : {}),
    ...(ownerships.length ? { ownership: { in: ownerships } } : {}),
    ...(vendors.length ? { vendor: { name: { in: vendors } } } : {}),
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
  const [devices, total, openTickets, typeGroups, statusGroups, brandGroups, vendorRows, osGroups, ownershipGroups, rent] = await Promise.all([
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
        holder: { select: { name: true, empId: true, dateOfExit: true, avatarBlobKey: true } },
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
  const ownershipCounts = new Map(ownershipGroups.map((group) => [group.ownership as string, group._count]));
  const monthlyRent = Number(rent._sum.monthlyRent ?? 0);
  const heldByLeaversCount = await leaverHeld;
  const osCounts = new Map(osGroups.map((group) => [group.os as string, group._count]));
  const typeCounts = new Map(typeGroups.map((group) => [group.type as string, group._count]));
  const statusCounts = new Map(statusGroups.map((group) => [group.status as string, group._count]));

  // Photo on the left, name with the grey Emp ID on the right.
  const holderText = (device: (typeof devices)[number]) =>
    device.holder ? (
      <span className="flex items-center gap-2">
        <EmployeeAvatar name={device.holder.name} avatarKey={device.holder.avatarBlobKey} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate">{device.holder.name}</span>
          <span className="block text-xs text-zinc-500">{device.holder.empId}</span>
        </span>
      </span>
    ) : (
      "—"
    );
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
            className: DEVICE_CHIPS[value],
          })),
          {
            key: "RENTED",
            label: "Rented",
            count: ownershipCounts.get("RENTED") ?? 0,
            className: DEVICE_CHIPS.RENTED,
          },
        ]}
      />

      {/* Row 1: one search across everything. Row 2: the filters. */}
      <div className="mt-5 flex flex-col gap-3 md:mt-6">
        <FilterSearch placeholder="Search asset tag, brand, model, serial, stock tag, holder or emp ID" />
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:items-center [&>*]:md:min-w-0 [&>*]:md:flex-1">
            <FilterDateRange param="purchased" presets={["30d", "month", "year"]} />
            <FilterMultiSelect
              param="type"
              label="Type"
              plural="Types"
              options={DEVICE_TYPES.map((type) => ({
                value: type,
                label: DEVICE_TYPE_LABELS[type],
                count: typeCounts.get(type) ?? 0,
              }))}
            />
            <FilterMultiSelect
              param="status"
              label="Status"
              plural="Statuses"
              options={DEVICE_STATUSES.map((value) => ({
                value,
                label: DEVICE_STATUS_LABELS[value],
                count: statusCounts.get(value) ?? 0,
              }))}
            />
            <FilterMultiSelect
              param="ownership"
              label="Owned / rented"
              plural="Owned / rented"
              options={DEVICE_OWNERSHIPS.map((value) => ({
                value,
                label: DEVICE_OWNERSHIP_LABELS[value],
                count: ownershipCounts.get(value) ?? 0,
              }))}
            />
            <FilterMultiSelect
              param="os"
              label="OS"
              plural="OSes"
              options={DEVICE_OSES.map((value) => ({
                value,
                label: DEVICE_OS_LABELS[value],
                count: osCounts.get(value) ?? 0,
              }))}
            />
            <FilterMultiSelect
              param="brand"
              label="Brand"
              plural="Brands"
              options={optionsByCount(brandGroups, (group) => group.brand)}
              searchable
            />
            <FilterMultiSelect
              param="vendor"
              label="Vendor"
              plural="Vendors"
              options={vendorRows.map((row) => ({ value: row.name, count: row._count.devices }))}
              searchable
            />
            <FilterMultiSelect
              param="holder"
              label="Holder"
              plural="Holders"
              options={[{ value: "left", label: "Has left (to collect)", count: heldByLeaversCount }]}
            />
          </div>
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
                    {osSuffix(device.os)} · {device.brand} {shownModel(device.model)}
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
              title={`${device.brand} ${shownModel(device.model)}`}
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
