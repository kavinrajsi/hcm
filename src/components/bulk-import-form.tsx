"use client";

import { useActionState, useState } from "react";
import Papa from "papaparse";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ImportState } from "@/lib/csv-import";

const PREVIEW_ROWS = 20;

type Preview = {
  headers: string[];
  rows: Record<string, string>[];
  total: number;
  error?: string;
};

/** Drawer opened from inside the import modal: parsed header + first rows. */
function CsvPreviewDrawer({
  file,
  columns,
}: {
  file: File | null;
  columns: readonly string[];
}) {
  const [preview, setPreview] = useState<Preview | null>(null);

  async function load(open: boolean) {
    if (!open || !file) return;
    // Same parse options as the server (src/lib/csv-import.ts).
    const result = Papa.parse<Record<string, string>>(await file.text(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      transform: (v) => v.trim(),
    });
    const first = result.errors[0];
    setPreview({
      headers: result.meta.fields ?? [],
      rows: result.data.slice(0, PREVIEW_ROWS),
      total: result.data.length,
      error: first
        ? `Parse error${first.row !== undefined ? ` on row ${first.row + 2}` : ""}: ${first.message}`
        : undefined,
    });
  }

  const headers = preview?.headers ?? [];
  const missing = columns.filter((c) => !headers.includes(c));
  const extra = headers.filter((h) => !columns.includes(h));

  return (
    <Sheet onOpenChange={load}>
      <SheetTrigger
        disabled={!file}
        render={<Button type="button" variant="outline" />}
      >
        Preview file
      </SheetTrigger>
      <SheetContent side="right" className="w-full data-[side=right]:w-full sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>{file?.name ?? "Preview"}</SheetTitle>
          <SheetDescription>
            {preview
              ? `${preview.total.toLocaleString()} row${preview.total === 1 ? "" : "s"} · showing first ${Math.min(PREVIEW_ROWS, preview.total)}`
              : "Reading file…"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
          {preview?.error && <p className="text-red-600">{preview.error}</p>}
          {preview && missing.length > 0 && (
            <p className="text-red-600">
              Missing columns: {missing.join(", ")}
            </p>
          )}
          {preview && extra.length > 0 && (
            <p className="text-amber-600 dark:text-amber-400">
              Ignored columns: {extra.join(", ")}
            </p>
          )}
          {preview && missing.length === 0 && !preview.error && (
            <p className="text-emerald-600 dark:text-emerald-400">
              All expected columns present.
            </p>
          )}
          {preview && preview.rows.length > 0 && (
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-popover text-left">
                  <tr>
                    <th className="px-2 py-1 font-medium text-zinc-500">#</th>
                    {headers.map((h) => (
                      <th
                        key={h}
                        className={
                          columns.includes(h)
                            ? "px-2 py-1 font-medium whitespace-nowrap"
                            : "px-2 py-1 font-medium whitespace-nowrap text-amber-600 dark:text-amber-400"
                        }
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="border-t border-zinc-200 dark:border-zinc-800"
                    >
                      <td className="px-2 py-1 tabular-nums text-zinc-500">
                        {i + 2}
                      </td>
                      {headers.map((h) => (
                        <td key={h} className="px-2 py-1 whitespace-nowrap">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function BulkImportForm({
  action,
  columns,
  title,
}: {
  action: (prev: ImportState, formData: FormData) => Promise<ImportState>;
  columns: readonly string[];
  title: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [file, setFile] = useState<File | null>(null);
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(
    columns.join(",") + "\n",
  )}`;

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Upload className="size-4" />
        Import CSV
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Upload a CSV with a header row.{" "}
            <a href={templateHref} download="template.csv">
              Download template
            </a>
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <Input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex gap-2">
            <CsvPreviewDrawer file={file} columns={columns} />
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? "Importing…" : "Import"}
            </Button>
          </div>
        </form>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.ok && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {state.ok}
          </p>
        )}
        {state.failures && state.failures.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-xs">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="px-2 py-1 font-medium">Row</th>
                  <th className="px-2 py-1 font-medium">Problem</th>
                </tr>
              </thead>
              <tbody>
                {state.failures.map((f) => (
                  <tr
                    key={`${f.row}-${f.message}`}
                    className="border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <td className="px-2 py-1 tabular-nums">{f.row}</td>
                    <td className="px-2 py-1">{f.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
