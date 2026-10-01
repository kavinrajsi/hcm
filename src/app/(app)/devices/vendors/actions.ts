"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { parseContacts, vendorSchema } from "@/lib/devices/vendors";

export type VendorFormState = { error?: string; ok?: string };

function parse(formData: FormData) {
  const value = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" ? raw : undefined;
  };
  return vendorSchema.safeParse({
    name: value("name"),
    kind: value("kind"),
    email: value("email"),
    phone: value("phone"),
    altPhone: value("altPhone"),
    address: value("address"),
    notes: value("notes"),
  });
}

function nameTaken(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createVendor(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  await requireRole("HR_ADMIN");
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid vendor" };
  const contacts = parseContacts(formData.get("contacts"));
  if (!contacts.ok) return { error: contacts.error };
  let id: string;
  try {
    ({ id } = await db.vendor.create({
      data: { ...parsed.data, contacts: { create: contacts.contacts } },
      select: { id: true },
    }));
  } catch (error) {
    if (nameTaken(error)) return { error: "A vendor with that name already exists." };
    throw error;
  }
  revalidatePath("/devices/vendors");
  // Back to where it was added from (e.g. the add-device form), else the vendor.
  const back = formData.get("back");
  redirect(typeof back === "string" && back.startsWith("/devices") ? back : `/devices/vendors/${id}`);
}

export async function updateVendor(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  await requireRole("HR_ADMIN");
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "Missing vendor" };
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid vendor" };
  const contacts = parseContacts(formData.get("contacts"));
  if (!contacts.ok) return { error: contacts.error };
  try {
    // Contacts are replaced as a set; the vendor row is updated in place.
    await db.$transaction([
      db.vendor.update({ where: { id }, data: parsed.data }),
      db.vendorContact.deleteMany({ where: { vendorId: id } }),
      db.vendorContact.createMany({
        data: contacts.contacts.map((contact) => ({ ...contact, vendorId: id })),
      }),
    ]);
  } catch (error) {
    if (nameTaken(error)) return { error: "A vendor with that name already exists." };
    throw error;
  }
  revalidatePath("/devices/vendors");
  revalidatePath(`/devices/vendors/${id}`);
  return { ok: "Saved." };
}

/** Hide a vendor from pickers (or bring it back). Their history stays. */
export async function setVendorActive(formData: FormData) {
  await requireRole("HR_ADMIN");
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await db.vendor.update({
    where: { id },
    data: { active: formData.get("active") === "true" },
  });
  revalidatePath("/devices/vendors");
  revalidatePath(`/devices/vendors/${id}`);
}
