"use server";

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/rbac";
import { deleteDocument } from "@/lib/blob";
import { fieldError, type FormState } from "@/lib/form-state";
import { getShotMap, isGuideShot, saveShotMap } from "@/lib/mcp-guide-store";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

function refresh() {
  revalidatePath("/mcp-access");
  revalidatePath("/mcp/instructions");
}

/** HR: adds or replaces one guide screenshot. */
export async function uploadGuideShot(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("HR_ADMIN");
  const file = String(formData.get("file") ?? "");
  if (!isGuideShot(file)) return { error: "Unknown screenshot." };
  const image = formData.get("image");
  if (!(image instanceof File) || image.size === 0) return fieldError("image", "Choose a screenshot");
  if (!TYPES[image.type]) return fieldError("image", "Use a PNG, JPG or WebP image");
  if (image.size > MAX_BYTES) return fieldError("image", "Keep it under 5 MB");
  const result = await put(`mcp-guide/${file.replace(/\.png$/, "")}.${TYPES[image.type]}`, image, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: image.type,
  });
  const map = await getShotMap();
  const previous = map[file]?.pathname;
  map[file] = { pathname: result.pathname, version: Date.now() };
  await saveShotMap(map);
  if (previous && previous !== result.pathname) await deleteDocument(previous).catch(() => {});
  refresh();
  return { ok: true };
}

/** HR: removes one guide screenshot. */
export async function removeGuideShot(formData: FormData): Promise<void> {
  await requireRole("HR_ADMIN");
  const file = String(formData.get("file") ?? "");
  const map = await getShotMap();
  const entry = map[file];
  if (!entry) return;
  delete map[file];
  await saveShotMap(map);
  await deleteDocument(entry.pathname).catch(() => {});
  refresh();
}
