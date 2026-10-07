// A resume PDF's text, for AI apps scoring over MCP (a raw PDF doesn't
// pass through MCP reliably). Layout is lost; reading order is kept.

const MAX_CHARS = 40_000;

export async function pdfText(bytes: Uint8Array): Promise<string> {
  // Loading the worker module up front runs pdf.js in this thread (it
  // checks globalThis.pdfjsWorker) and keeps the file in the deploy bundle.
  // @ts-expect-error -- the worker build ships without types
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker ??= worker;
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    // pdf.js may detach the buffer it's given.
    data: bytes.slice(),
    useSystemFonts: true,
  });
  const document = await task.promise;
  try {
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
        }
      }
      if (line) lines.push(line);
      pages.push(lines.map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
    }
    const text = pages.join("\n\n").trim();
    return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n…(truncated)` : text;
  } finally {
    await task.destroy();
  }
}
