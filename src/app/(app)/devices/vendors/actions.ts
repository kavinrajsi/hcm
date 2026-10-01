"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fieldError, FIX_FIELDS, invalid, type FormState } from "@/lib/form-state";
import { requireRole } from "@/lib/rbac";
import {
  parseContacts,
  vendorSchema,
  type ContactInput,
  type VendorInput,
} from "@/lib/devices/vendors";

export type VendorFormState = FormState;

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

/** The vendor and its contacts, or every problem with either at once. */
function parseAll(
  formData: FormData,
):
  | { vendor: VendorInput; contacts: (ContactInput & { position: number })[] }
  | { state: VendorFormState } {
  const parsed = parse(formData);
  const contacts = parseContacts(formData.get("contacts"));
  if (parsed.success && contacts.ok) return { vendor: parsed.data, contacts: contacts.contacts };
  const state: VendorFormState = parsed.success ? {} : invalid(parsed.error);
  if (!contacts.ok) {
    if (!contacts.fieldErrors) return { state: { ...state, error: contacts.error } };
    state.fieldErrors = { ...state.fieldErrors, ...contacts.fieldErrors };
    state.error = FIX_FIELDS;
  }
  return { state };
}

const NAME_TAKEN = "A vendor with that name already exists.";

function nameTaken(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createVendor(
  _prev: VendorFormState,
  formData: FormData,
): Promise<VendorFormState> {
  await requireRole("HR_ADMIN");
  const parsed = parseAll(formData);
  if ("state" in parsed) return parsed.state;
  let id: string;
  try {
    ({ id } = await db.vendor.create({
      data: { ...parsed.vendor, contacts: { create: parsed.contacts } },
      select: { id: true },
    }));
  } catch (error) {
    if (nameTaken(error)) return fieldError("name", NAME_TAKEN);
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
  const parsed = parseAll(formData);
  if ("state" in parsed) return parsed.state;
  try {
    // Contacts are replaced as a set; the vendor row is updated in place.
    await db.$transaction([
      db.vendor.update({ where: { id }, data: parsed.vendor }),
      db.vendorContact.deleteMany({ where: { vendorId: id } }),
      db.vendorContact.createMany({
        data: parsed.contacts.map((contact) => ({ ...contact, vendorId: id })),
      }),
    ]);
  } catch (error) {
    if (nameTaken(error)) return fieldError("name", NAME_TAKEN);
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
