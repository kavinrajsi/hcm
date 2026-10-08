import Link from "next/link";
import { db } from "@/lib/db";
import {
  DEVICE_STATUS_CLASSES,
  DEVICE_STATUS_LABELS,
  DEVICE_TYPE_LABELS,
} from "@/lib/devices/devices";
import { shownModel } from "@/lib/devices/devices";
import { formatDay } from "@/lib/format-date";

/**
 * Devices someone holds now, plus (with `history`) what they held before.
 * Used on My Profile (their own) and on the employee page for HR. Callers
 * do their own access check; the device links re-check on open.
 */
export async function EmployeeDevices({
  employeeId,
  title,
  history = false,
  provision = false,
}: {
  employeeId: string;
  title: string;
  history?: boolean;
  /** HR: link to give or order a device. */
  provision?: boolean;
}) {
  const [current, past] = await Promise.all([
    db.device.findMany({
      where: { holderId: employeeId },
      orderBy: { assetTag: "asc" },
      select: {
        id: true,
        assetTag: true,
        type: true,
        brand: true,
        model: true,
        status: true,
        _count: { select: { tickets: { where: { status: { in: ["OPEN", "SENT_FOR_SERVICE"] } } } } },
      },
    }),
    history
      ? db.deviceAssignment.findMany({
          where: { employeeId, returnedAt: { not: null } },
          orderBy: { assignedAt: "desc" },
          select: {
            id: true,
            assignedAt: true,
            returnedAt: true,
            device: { select: { id: true, assetTag: true, brand: true, model: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const openRequests = provision
    ? await db.devicePurchaseRequest.count({
        where: { employeeId, status: { in: ["PENDING", "SENT"] } },
      })
    : 0;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        {provision && (
          <Link href={`/devices/provision/${employeeId}`} className="text-sm underline-offset-4 hover:underline">
            {current.length ? "Give another device" : "Get a device"}
            {openRequests > 0 && ` · ${openRequests} on order`}
          </Link>
        )}
      </div>
      {current.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No company devices.</p>
      ) : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {current.map((device) => (
            <li key={device.id}>
              <Link
                href={`/devices/${device.id}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-muted dark:border-zinc-800"
              >
                <span className="min-w-0">
                  <span className="font-medium">
                    {device.brand} {shownModel(device.model)}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    <span className="font-mono">{device.assetTag}</span> · {DEVICE_TYPE_LABELS[device.type]}
                    {device._count.tickets > 0 && ` · ${device._count.tickets} open issue(s)`}
                  </span>
                </span>
                <span className={`shrink-0 text-xs ${DEVICE_STATUS_CLASSES[device.status]}`}>
                  {DEVICE_STATUS_LABELS[device.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {current.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500">Something wrong with one? Open it to report an issue.</p>
      )}
      {past.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-zinc-500">Previously held ({past.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {past.map((row) => (
              <li key={row.id}>
                <Link href={`/devices/${row.device.id}`} className="hover:underline">
                  <span className="font-mono">{row.device.assetTag}</span> {row.device.brand} {shownModel(row.device.model)}
                </Link>
                <span className="text-zinc-500">
                  {" "}· {formatDay(row.assignedAt)} → {formatDay(row.returnedAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
