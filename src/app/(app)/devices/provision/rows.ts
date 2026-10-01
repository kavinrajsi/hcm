import type { Prisma } from "@/generated/prisma/client";
import { formatDateTime, formatDay } from "@/lib/format-date";
import type { RequestRow } from "./request-list";

/** Prisma include for a request row. */
export const REQUEST_INCLUDE = {
  vendor: { select: { name: true } },
  employee: { select: { id: true, name: true } },
} satisfies Prisma.DevicePurchaseRequestInclude;

type RequestWithIncludes = Prisma.DevicePurchaseRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

export function toRequestRow(request: RequestWithIncludes): RequestRow {
  return {
    id: request.id,
    type: request.type,
    os: request.os,
    itemName: request.itemName,
    quantity: request.quantity,
    vendorName: request.vendor.name,
    emailTo: request.emailTo,
    status: request.status,
    sendError: request.sendError,
    createdAt: formatDateTime(request.createdAt),
    sentAt: request.sentAt ? formatDateTime(request.sentAt) : null,
    neededBy: request.neededBy ? formatDay(request.neededBy) : null,
    employee: request.employee,
    deviceId: request.deviceId,
  };
}
