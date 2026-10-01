import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/rbac";
import { DEVICE_ACCESS_SELECT, deviceAccess } from "@/lib/devices/access";
import { deviceScanUrl } from "@/lib/devices/devices";
import { qrPng } from "@/lib/devices/qr";

// A device's QR code as a PNG download, for printing outside HCM.

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { id } = await ctx.params;
  const device = await db.device.findUnique({
    where: { id },
    select: { assetTag: true, publicToken: true, ...DEVICE_ACCESS_SELECT },
  });
  if (!device) return new Response("Not found", { status: 404 });
  if (!deviceAccess(user, device)) return new Response("Forbidden", { status: 403 });

  const png = await qrPng(deviceScanUrl(device.publicToken, request.nextUrl.origin));
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${device.assetTag}.png"`,
      "Cache-Control": "private, no-store",
    },
  });
}
