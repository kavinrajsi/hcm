import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageRole } from "@/lib/rbac";
import { PURCHASE_EMAIL_SETTING, readPurchaseEmailSettings } from "@/lib/devices/purchase";
import { PageHeader, PageShell } from "@/components/page";
import { Button } from "@/components/ui/button";
import { PurchaseEmailSettingsForm } from "./settings-form";
import { LaptopOsMapForm } from "./os-map-form";
import { laptopOsMap } from "@/lib/devices/os-settings";

export const metadata = { title: "Device email settings" };

export default async function DeviceSettingsPage() {
  await requirePageRole("HR_ADMIN");
  const [row, osMap, designations] = await Promise.all([
    db.appSetting.findUnique({ where: { key: PURCHASE_EMAIL_SETTING } }),
    laptopOsMap(),
    db.employee.groupBy({ by: ["designation"], where: { dateOfExit: null }, _count: true }),
  ]);
  const settings = readPurchaseEmailSettings(row?.value);
  // Every current designation, plus any rule for one nobody holds now.
  const people = new Map(designations.map((group) => [group.designation, group._count]));
  const names = [...new Set([...people.keys(), ...Object.keys(osMap)])].sort((a, b) =>
    a.localeCompare(b),
  );
  const rows = names.map((designation) => ({
    designation,
    people: people.get(designation) ?? 0,
    os: osMap[designation] ?? null,
  }));
  return (
    <PageShell width="sm">
      <PageHeader
        title="Device settings"
        description="Vendor request emails, and which laptop each role usually gets."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/devices/requests" />}>
            Requests
          </Button>
        }
      />
      <section className="mt-6">
        <h2 className="text-base font-semibold">Vendor request emails</h2>
        <div className="mt-3">
          <PurchaseEmailSettingsForm replyTo={settings.replyTo} cc={settings.cc} />
        </div>
      </section>
      <section className="mt-10">
        <h2 className="text-base font-semibold">Laptop by designation</h2>
        <p className="mt-1 text-sm text-zinc-500">
          A recommendation on the new-joiner device step. HR can still give another laptop when the role needs it.
        </p>
        <div className="mt-3">
          <LaptopOsMapForm rows={rows} />
        </div>
      </section>
    </PageShell>
  );
}
