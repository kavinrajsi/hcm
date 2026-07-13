"use client";

import { useActionState } from "react";
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
import type { ImportState } from "@/lib/csv-import";

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
          <Input type="file" name="file" accept=".csv,text/csv" required />
          <Button type="submit" disabled={pending}>
            {pending ? "Importing…" : "Import"}
          </Button>
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
