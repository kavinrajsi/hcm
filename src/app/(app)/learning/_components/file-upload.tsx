"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { useClearFieldError } from "@/components/form/validated-form";
import { FieldError } from "@/components/form/form-field";

// Uploads straight from the browser to private Blob storage (big videos go
// up in parts), then puts the stored pathname in a hidden input for the
// form's server action, which checks it exists before saving.

const ACCEPT = {
  pdf: "application/pdf",
  video: "video/mp4,video/webm,video/quicktime",
  image: "image/png,image/jpeg,image/webp",
} as const;

const LIMIT_LABEL = { pdf: "PDF up to 100 MB", video: "MP4/WebM up to 4 GB", image: "PNG, JPG or WebP up to 5 MB" };

export function FileUpload({
  name,
  kind,
  defaultKey,
  label,
}: {
  name: string;
  kind: keyof typeof ACCEPT;
  defaultKey?: string | null;
  label: string;
}) {
  const clearError = useClearFieldError();
  const input = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState(defaultKey ?? "");
  const [fileName, setFileName] = useState(defaultKey ? defaultKey.split("/").pop() ?? "" : "");
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  async function start(file: File) {
    setError(undefined);
    setPercent(0);
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, "-").slice(-80) || "file";
      const blob = await upload(`learning/${kind}/${safeName}`, file, {
        access: "private",
        handleUploadUrl: "/api/learning/upload",
        clientPayload: kind,
        multipart: file.size > 50 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setPercent(Math.round(percentage)),
      });
      setKey(blob.pathname);
      setFileName(file.name);
      clearError(name);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setPercent(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input type="hidden" name={name} value={key} />
      <input
        ref={input}
        type="file"
        accept={ACCEPT[kind]}
        className="sr-only"
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void start(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={percent !== null}
          onClick={() => input.current?.click()}
        >
          {percent !== null ? `Uploading… ${percent}%` : key ? "Replace file" : "Choose file"}
        </Button>
        <span className="min-w-0 truncate text-sm text-zinc-500">
          {fileName || LIMIT_LABEL[kind]}
        </span>
      </div>
      {percent !== null && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${percent}%` }} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <FieldError name={name} />
    </div>
  );
}
