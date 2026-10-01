import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { VENDOR_KIND_LABELS } from "@/lib/devices/vendors";
import { ListCard } from "@/components/list-card";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { DesktopTable, MobileList, PageHeader, PageShell } from "@/components/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Vendors" };

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  await requireRole("HR_ADMIN");
  const showInactive = (await searchParams).show === "inactive";
  const vendors = await db.vendor.findMany({
    where: { active: !showInactive },
    orderBy: { name: "asc" },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { position: "asc" }], take: 1 },
      _count: { select: { devices: true, serviceTickets: true, contacts: true } },
    },
  });

  const contact = (vendor: (typeof vendors)[number]) => (
    <>
      <a href={`tel:${vendor.phone.replace(/\s/g, "")}`} className="hover:underline">
        {vendor.phone || <span className="text-amber-600">add phone</span>}
      </a>
      {vendor.altPhone && (
        <>
          {" · "}
          <a href={`tel:${vendor.altPhone.replace(/\s/g, "")}`} className="hover:underline">
            {vendor.altPhone}
          </a>
        </>
      )}
    </>
  );

  return (
    <PageShell>
      <PageHeader
        title="Vendors"
        description="Shops that sell devices and service centres that repair them."
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/devices" />}>
              Devices
            </Button>
            <Button nativeButton={false} render={<Link href="/devices/vendors/new" />}>
              Add vendor
            </Button>
          </>
        }
      />
      <div className="mt-4">
        <Segmented
          label="Vendor status"
          items={[
            { key: "active", href: "/devices/vendors", label: "Active", active: !showInactive },
            { key: "inactive", href: "/devices/vendors?show=inactive", label: "Inactive", active: showInactive },
          ]}
        />
      </div>
      <div className="mt-4">
        <DesktopTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Devices / repairs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-zinc-500">
                    {showInactive ? "No inactive vendors." : "No vendors yet. Add the first one."}
                  </TableCell>
                </TableRow>
              )}
              {vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell>
                    <Link href={`/devices/vendors/${vendor.id}`} className="font-medium hover:underline">
                      {vendor.name}
                    </Link>
                    <p className="text-xs text-zinc-500">{VENDOR_KIND_LABELS[vendor.kind]}</p>
                  </TableCell>
                  <TableCell>
                    {vendor.contacts[0] ? (
                      <>
                        {vendor.contacts[0].name}
                        {vendor.contacts[0].role && (
                          <span className="text-xs text-zinc-500"> · {vendor.contacts[0].role}</span>
                        )}
                        {vendor._count.contacts > 1 && (
                          <span className="text-xs text-zinc-500"> +{vendor._count.contacts - 1} more</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{contact(vendor)}</TableCell>
                  <TableCell>
                    {vendor.email ? (
                      <a href={`mailto:${vendor.email}`} className="hover:underline">
                        {vendor.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {vendor._count.devices} / {vendor._count.serviceTickets}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DesktopTable>
        <MobileList empty="No vendors yet." isEmpty={vendors.length === 0}>
          {vendors.map((vendor) => (
            <ListCard
              key={vendor.id}
              href={`/devices/vendors/${vendor.id}`}
              title={vendor.name}
              subtitle={VENDOR_KIND_LABELS[vendor.kind]}
              meta={
                <>
                  {vendor.contacts[0] && (
                    <span>
                      {vendor.contacts[0].name}
                      {vendor._count.contacts > 1 ? ` +${vendor._count.contacts - 1}` : ""}
                    </span>
                  )}
                  <span>{vendor.phone || "add phone"}</span>
                  {vendor.email && <span>{vendor.email}</span>}
                </>
              }
            />
          ))}
        </MobileList>
      </div>
    </PageShell>
  );
}
