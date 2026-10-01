import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import type { DeviceStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { parseTableParams } from "@/lib/table-params";
import {
  DEVICE_STATUSES,
  DEVICE_STATUS_CLASSES,
  DEVICE_STATUS_LABELS,
  DEVICE_TYPES,
  DEVICE_TYPE_LABELS,
  isDeviceStatus,
  isDeviceType,
} from "@/lib/devices/devices";
import { TableFilters } from "@/components/data-table/filters";
import { TablePagination } from "@/components/data-table/pagination";
import { ListCard } from "@/components/list-card";
import { Segmented } from "@/components/segmented";
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
  const user = await requireRole("HR_ADMIN", "MANAGER");
  const raw = await searchParams;
  const params = parseTableParams(raw);
  const status: DeviceStatus | "ALL" = isDeviceStatus(raw.status) ? raw.status : "ALL";

  const where: Prisma.DeviceWhereInput = {
    // Managers see only their direct reports' devices.
    ...(user.role === "MANAGER" ? { holder: { manager: { userId: user.id } } } : {}),
    ...(isDeviceType(params.type) ? { type: params.type } : {}),
    ...(status !== "ALL" ? { status } : {}),
    ...(params.q
      ? {
          OR: [
            { assetTag: { contains: params.q, mode: "insensitive" } },
            { brand: { contains: params.q, mode: "insensitive" } },
            { model: { contains: params.q, mode: "insensitive" } },
            { serialNumber: { contains: params.q, mode: "insensitive" } },
            { holder: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [devices, total, openTickets] = await Promise.all([
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
        status: true,
        holder: { select: { name: true, empId: true } },
        _count: { select: { tickets: { where: { status: { in: ["OPEN", "SENT_FOR_SERVICE"] } } } } },
      },
    }),
    db.device.count({ where }),
    db.deviceTicket.count({
      where: {
        status: { in: ["OPEN", "SENT_FOR_SERVICE"] },
        ...(user.role === "MANAGER" ? { device: { holder: { manager: { userId: user.id } } } } : {}),
      },
    }),
  ]);

  const statusHref = (value: string) => {
    const next = new URLSearchParams();
    for (const [key, item] of Object.entries(raw))
      if (typeof item === "string" && key !== "status" && key !== "page") next.set(key, item);
    if (value !== "ALL") next.set("status", value);
    const query = next.toString();
    return query ? `/devices?${query}` : "/devices";
  };
  const holderText = (device: (typeof devices)[number]) =>
    device.holder ? `${device.holder.name} · ${device.holder.empId}` : "—";

  return (
    <PageShell>
      <PageHeader
        title="Devices"
        description={`Laptops, mice, iPads and hubs, who has them, and their repairs. ${openTickets} open issue${openTickets === 1 ? "" : "s"}.`}
        actions={
          user.role === "HR_ADMIN" ? (
            <>
              <Button variant="outline" nativeButton={false} render={<Link href="/devices/labels" />}>
                Print labels
              </Button>
              <Button nativeButton={false} render={<Link href="/devices/new" />}>Add device</Button>
            </>
          ) : undefined
        }
      />

      <div className="mt-4 flex flex-col gap-3">
        <Segmented
          label="Status"
          items={(["ALL", ...DEVICE_STATUSES] as const).map((value) => ({
            key: value,
            href: statusHref(value),
            label: value === "ALL" ? "All" : DEVICE_STATUS_LABELS[value],
            active: status === value,
          }))}
        />
        <TableFilters
          typeOptions={DEVICE_TYPES.map((type) => ({ value: type, label: DEVICE_TYPE_LABELS[type] }))}
          typeLabel="Type"
          dateFilters={false}
          searchPlaceholder="Search tag, model, serial or person…"
        />
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
                    {DEVICE_TYPE_LABELS[device.type]} · {device.brand} {device.model}
                  </TableCell>
                  <TableCell>{holderText(device)}</TableCell>
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
                  <span>{DEVICE_TYPE_LABELS[device.type]}</span>
                  <span>{holderText(device)}</span>
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
