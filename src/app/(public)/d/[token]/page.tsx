import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/rbac";
import { DEVICE_ACCESS_SELECT, deviceAccess } from "@/lib/devices/access";
import { DEVICE_TYPE_LABELS } from "@/lib/devices/devices";
import { publicDeviceView } from "@/lib/devices/public-view";

export const metadata = { title: "Madarth device", robots: { index: false } };

// Where a device's QR label lands. Anyone sees what the device is and who
// to return it to — never who holds it. Someone signed in with access
// goes straight to the full device page.

export default async function ScannedDevicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const device = await db.device.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      assetTag: true,
      type: true,
      brand: true,
      model: true,
      status: true,
      vendor: { select: { name: true } },
      holder: {
        select: {
          name: true,
          ...DEVICE_ACCESS_SELECT.holder.select,
        },
      },
    },
  });
  if (!device) notFound();

  const user = await currentUser();
  if (user && deviceAccess(user, device)) redirect(`/devices/${device.id}`);

  const view = publicDeviceView(device);
  const contact = process.env.DEVICE_CONTACT_EMAIL;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Madarth device</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {DEVICE_TYPE_LABELS[view.type]} · {view.brand} {view.model}
        </h1>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-500">Asset tag</dt>
          <dd className="font-mono">{view.assetTag}</dd>
          {view.holderName ? (
            <>
              <dt className="text-zinc-500">Assigned to</dt>
              <dd>{view.holderName}</dd>
            </>
          ) : null}
        </dl>
        <p className="mt-6 rounded-md bg-muted px-3 py-2 text-sm">
          Property of {view.owner}. If you found it, please return it to the Madarth office
          {contact ? (
            <>
              {" "}or write to{" "}
              <a href={`mailto:${contact}?subject=Found device ${view.assetTag}`} className="underline">
                {contact}
              </a>
            </>
          ) : null}
          .
        </p>
        {!user ? (
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/d/${token}`)}`}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Staff: sign in for details
          </Link>
        ) : (
          <p className="mt-6 text-xs text-zinc-500">
            You&rsquo;re signed in but this device isn&rsquo;t yours or your team&rsquo;s.
          </p>
        )}
      </div>
    </main>
  );
}
