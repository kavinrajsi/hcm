import { del, get, put } from "@vercel/blob";

// Private Vercel Blob storage for employee documents (PAN, Aadhaar, photos,
// letters). Blobs are never public — the DB stores the pathname, and reads
// stream through an RBAC-guarded route handler (app/api/files/[...path]).

export async function uploadDocument(
  pathname: string,
  file: File | Buffer,
): Promise<string> {
  const result = await put(pathname, file, {
    access: "private",
    addRandomSuffix: true,
  });
  return result.pathname;
}

export async function readDocument(pathname: string) {
  return get(pathname, { access: "private" });
}

export async function deleteDocument(pathname: string) {
  await del(pathname);
}
