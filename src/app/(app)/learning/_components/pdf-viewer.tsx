"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWholeFile } from "./fetch-file";

// Draws a course PDF with PDF.js. The browser's own PDF viewer can't be
// used: Vercel Blob serves files with `Content-Security-Policy:
// default-src 'none'`, which leaves Chrome's viewer blank. The file comes
// from HCM in capped ranges (fetchWholeFile) and is handed to PDF.js whole.

type Status = { state: "loading" } | { state: "ready"; pages: number } | { state: "error" };

export function PdfViewer({ src, title }: { src: string; title: string }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const container = pagesRef.current;
    if (!container) return;
    let destroy: (() => void) | undefined;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const data = new Uint8Array(await (await fetchWholeFile(src)).arrayBuffer());
        if (cancelled) return;
        const task = pdfjs.getDocument({ data });
        destroy = () => void task.destroy();
        const pdf = await task.promise;
        if (cancelled) return;
        container.replaceChildren();
        const width = container.clientWidth - 16;
        const ratio = window.devicePixelRatio || 1;
        for (let number = 1; number <= pdf.numPages; number++) {
          const page = await pdf.getPage(number);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * zoom });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = "mx-auto mb-3 block bg-white shadow";
          canvas.setAttribute("aria-label", `${title}, page ${number} of ${pdf.numPages}`);
          canvas.setAttribute("role", "img");
          container.append(canvas);
          await page.render({
            canvas,
            viewport,
            transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
          }).promise;
        }
        if (!cancelled) setStatus({ state: "ready", pages: pdf.numPages });
      } catch (error) {
        console.error("[pdf-viewer]", error);
        if (!cancelled) setStatus({ state: "error" });
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [src, title, zoom]);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-background px-3 py-1.5 text-sm dark:border-zinc-800">
        <span className="text-zinc-500">
          {status.state === "ready"
            ? `${status.pages} page${status.pages === 1 ? "" : "s"}`
            : status.state === "loading"
              ? "Loading PDF…"
              : "Couldn't show this PDF"}
        </span>
        <span className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
          >
            <Minus />
          </Button>
          <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            disabled={zoom >= 3}
            onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
          >
            <Plus />
          </Button>
        </span>
      </div>
      {status.state === "error" && (
        <p className="p-6 text-center text-sm text-zinc-500">Use Download to open it instead.</p>
      )}
      <div ref={pagesRef} className="h-[70vh] overflow-auto p-2" />
    </div>
  );
}
