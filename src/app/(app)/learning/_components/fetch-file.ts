// Downloads a whole course file from /api/learning/files in ranges: each
// response there is capped at a few MB (Vercel's 4.5 MB response limit),
// so bigger PDFs come in several requests.

export async function fetchWholeFile(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Blob> {
  const parts: ArrayBuffer[] = [];
  let start = 0;
  let total = Infinity;
  let type = "application/octet-stream";
  while (start < total) {
    const response = await fetch(url, { headers: { Range: `bytes=${start}-` } });
    if (!response.ok) throw new Error(`Couldn't load the file (${response.status})`);
    type = response.headers.get("content-type") ?? type;
    const buffer = await response.arrayBuffer();
    parts.push(buffer);
    // 206: "bytes a-b/total"; 200: the whole file in one go.
    const contentRange = response.headers.get("content-range");
    total = contentRange ? Number(contentRange.split("/")[1]) : buffer.byteLength;
    start += buffer.byteLength;
    onProgress?.(start, total);
    if (buffer.byteLength === 0) break;
  }
  return new Blob(parts, { type });
}

/** Saves a course file to the device under its own name. */
export async function downloadFile(url: string, name: string) {
  const blob = await fetchWholeFile(url);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
}
