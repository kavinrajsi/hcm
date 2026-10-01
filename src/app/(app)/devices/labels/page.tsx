import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import {
  DEVICE_STATUS_LABELS,
  DEVICE_TYPE_LABELS,
  deviceScanUrl,
} from "@/lib/devices/devices";
import { qrSvg } from "@/lib/devices/qr";
import { PageHeader, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { DeviceLabel } from "../device-label";
import { PrintButton } from "./print-button";

export const metadata = { title: "Print labels" };

// A4 sticker sheet: 3 across × 8 down of 70 × 37 mm labels.
const PER_SHEET = 24;

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[]; layout?: string }>;
}) {
  await requireRole("HR_ADMIN");
  const params = await searchParams;
  const ids = (Array.isArray(params.ids) ? params.ids : (params.ids ?? "").split(","))
    .flatMap((value) => value.split(","))
    .filter(Boolean);
  const single = params.layout === "single";

  if (ids.length === 0) {
    const devices = await db.device.findMany({
      where: { status: { notIn: ["RETIRED", "LOST"] } },
      orderBy: { assetTag: "asc" },
      select: { id: true, assetTag: true, type: true, brand: true, model: true, status: true, holder: { select: { name: true } } },
    });
    return (
      <PageShell width="md">
        <PageHeader
          title="Print labels"
          description="Pick devices to print on an A4 sheet of 70 × 37 mm stickers (24 per sheet)."
          actions={
            <Button variant="outline" nativeButton={false} render={<Link href="/devices" />}>
              All devices
            </Button>
          }
        />
        {devices.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-500">No devices yet.</p>
        ) : (
          <form method="get" className="mt-6 flex flex-col gap-3">
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {devices.map((device) => (
                <li key={device.id}>
                  <label className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm">
                    <input type="checkbox" name="ids" value={device.id} className="size-4 accent-primary" />
                    <span className="font-mono">{device.assetTag}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {DEVICE_TYPE_LABELS[device.type]} · {device.brand} {device.model}
                    </span>
                    <span className="hidden text-xs text-zinc-500 md:inline">
                      {device.holder?.name ?? DEVICE_STATUS_LABELS[device.status]}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div>
              <Button type="submit">Show sheet</Button>
            </div>
          </form>
        )}
      </PageShell>
    );
  }

  const devices = await db.device.findMany({
    where: { id: { in: ids } },
    orderBy: { assetTag: "asc" },
    select: {
      id: true,
      assetTag: true,
      type: true,
      brand: true,
      model: true,
      publicToken: true,
      holder: { select: { name: true, empId: true } },
    },
  });
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const origin = host ? `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${host}` : undefined;
  const labels = await Promise.all(
    devices.map(async (device) => ({
      ...device,
      svg: await qrSvg(deviceScanUrl(device.publicToken, origin)),
    })),
  );

  return (
    <PageShell width="md">
      <PageHeader
        title={single || labels.length === 1 ? "Print label" : `Print ${labels.length} labels`}
        description={
          single
            ? "Prints one 70 × 37 mm label at the top-left of the page."
            : `${Math.ceil(labels.length / PER_SHEET)} A4 sheet(s). Print at 100% scale ("Actual size"), no margins added by the browser.`
        }
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/devices/labels" />}>
              Pick devices
            </Button>
            <PrintButton />
          </>
        }
      />
      <div className="mt-6 overflow-x-auto rounded-md bg-zinc-100 p-4 dark:bg-zinc-900">
        <div className="print-area mx-auto grid w-[210mm] grid-cols-[repeat(3,70mm)] content-start bg-white">
          {labels.map((label) => (
            <DeviceLabel
              key={label.id}
              svg={label.svg}
              assetTag={label.assetTag}
              type={label.type}
              brand={label.brand}
              model={label.model}
              holder={label.holder}
            />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
