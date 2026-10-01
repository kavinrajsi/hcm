"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DEVICE_TYPE_LABELS } from "@/lib/devices/devices";
import type { DeviceOs, DeviceType, PurchaseRequestStatus } from "@/generated/prisma/enums";
import { osSuffix } from "@/lib/devices/os";
import { cancelPurchaseRequest, retryPurchaseRequest } from "./actions";

export type RequestRow = {
  id: string;
  type: DeviceType;
  os: DeviceOs | null;
  itemName: string;
  quantity: number;
  vendorName: string;
  emailTo: string;
  status: PurchaseRequestStatus;
  sendError: string | null;
  createdAt: string; // formatted
  sentAt: string | null; // formatted
  neededBy: string | null; // formatted
  employee: { id: string; name: string } | null;
  deviceId: string | null;
};

const STATUS: Record<PurchaseRequestStatus, { label: string; className: string }> = {
  PENDING: { label: "Not sent", className: "text-amber-600 dark:text-amber-400" },
  SENT: { label: "Emailed", className: "text-sky-600 dark:text-sky-400" },
  RECEIVED: { label: "Received", className: "text-emerald-600 dark:text-emerald-400" },
  CANCELLED: { label: "Cancelled", className: "text-zinc-400" },
};

/** Purchase requests with their next step: retry, mark received or cancel. */
export function RequestList({ rows, showEmployee }: { rows: RequestRow[]; showEmployee?: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  const [confirmRetry, setConfirmRetry] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (rows.length === 0) return <p className="text-sm text-zinc-500">No requests yet.</p>;

  function retry(id: string) {
    const data = new FormData();
    data.set("id", id);
    data.set("confirmed", "yes");
    setConfirmRetry(null);
    startTransition(async () => {
      const state = await retryPurchaseRequest(data);
      setMessage(typeof state.ok === "string" ? state.ok : (state.error ?? null));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {message && <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p>}
      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
        {rows.map((row) => {
          const status = STATUS[row.status];
          const open = row.status === "PENDING" || row.status === "SENT";
          return (
            <li key={row.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p>
                  <span className="font-medium">
                    {row.quantity} × {row.itemName}
                  </span>
                  <span className="text-zinc-500">
                    {" "}
                    · {DEVICE_TYPE_LABELS[row.type]}
                    {osSuffix(row.os)} · {row.vendorName}
                  </span>
                </p>
                <p className="text-xs text-zinc-500">
                  <span className={status.className}>{status.label}</span>
                  {row.sentAt ? ` ${row.sentAt} to ${row.emailTo}` : ` · saved ${row.createdAt}`}
                  {row.neededBy && ` · needed by ${row.neededBy}`}
                  {showEmployee && row.employee && (
                    <>
                      {" · for "}
                      <Link href={`/employees/${row.employee.id}`} className="hover:underline">
                        {row.employee.name}
                      </Link>
                    </>
                  )}
                  {row.deviceId && (
                    <>
                      {" · "}
                      <Link href={`/devices/${row.deviceId}`} className="hover:underline">
                        view device
                      </Link>
                    </>
                  )}
                </p>
                {row.sendError && row.status === "PENDING" && (
                  <p className="text-xs text-red-600">Email failed: {row.sendError}</p>
                )}
              </div>
              {open && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  {row.status === "PENDING" && row.sendError && confirmRetry !== row.id && (
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirmRetry(row.id)}>
                      Retry email
                    </Button>
                  )}
                  {confirmRetry === row.id && (
                    <span className="flex flex-wrap items-center gap-2 text-xs">
                      Send again to {row.emailTo}?
                      <Button type="button" size="sm" disabled={pending} onClick={() => retry(row.id)}>
                        Yes, send
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRetry(null)}>
                        No
                      </Button>
                    </span>
                  )}
                  <Button
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/devices/new?request=${row.id}`} />}
                  >
                    Mark received
                  </Button>
                  <form action={cancelPurchaseRequest}>
                    <input type="hidden" name="id" value={row.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Cancel
                    </Button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
