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

// Career-form resumes live in a separate store ("madarth-resume", shared with
// the madarth website project), connected to this project with the env
// prefix RESUMES → RESUMES_READ_WRITE_TOKEN.
function tokenFor(pathname: string): string | undefined {
  return pathname.startsWith("resumes/")
    ? process.env.RESUMES_READ_WRITE_TOKEN
    : undefined;
}

/**
 * HR-added candidate resumes go to the resumes store with the website's
 * naming (`resumes/<first-name>-<ISO time>.<ext>`) so both apps read them.
 */
export async function uploadResume(
  firstName: string,
  file: File,
): Promise<string> {
  const slug =
    firstName
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "candidate";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
  const pathname = `resumes/${slug}-${stamp}.${ext}`;
  const result = await put(pathname, file, {
    access: "private",
    addRandomSuffix: false,
    token: tokenFor(pathname),
  });
  return result.pathname;
}

export async function readDocument(pathname: string) {
  return get(pathname, { access: "private", token: tokenFor(pathname) });
}

export async function deleteDocument(pathname: string) {
  await del(pathname);
}
