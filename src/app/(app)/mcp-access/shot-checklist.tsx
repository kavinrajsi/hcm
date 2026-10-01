"use client";

import { useActionState, useRef } from "react";
import { ValidatedForm } from "@/components/form/validated-form";
import { FieldError, FormMessage } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { removeGuideShot, uploadGuideShot } from "./guide-actions";

type Shot = { file: string; caption: string; url: string | null };

function ShotCard({ shot }: { shot: Shot }) {
  const [state, formAction, pending] = useActionState(uploadGuideShot, {});
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <li className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      {shot.url ? (
        <a href={shot.url} target="_blank" rel="noreferrer" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded screenshot */}
          <img src={shot.url} alt={shot.caption} loading="lazy" className="aspect-video w-full bg-zinc-50 object-contain dark:bg-zinc-900" />
        </a>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center border-b border-dashed border-zinc-200 bg-zinc-50 text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
          {pending ? "Uploading…" : "Screenshot not added yet"}
        </div>
      )}
      <div className="flex flex-col gap-2 px-3 py-2">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{shot.caption}</p>
        <ValidatedForm ref={formRef} action={formAction} fieldErrors={state.fieldErrors} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="file" value={shot.file} />
          <label className="cursor-pointer">
            <span className="inline-flex h-7 items-center rounded-md border border-zinc-200 px-2.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
              {pending ? "Uploading…" : shot.url ? "Replace" : "Upload"}
            </span>
            <input
              type="file"
              name="image"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={pending}
              onChange={(event) => {
                if (event.currentTarget.files?.length) formRef.current?.requestSubmit();
              }}
            />
          </label>
          {shot.url && (
            <Button type="submit" size="sm" variant="ghost" formAction={removeGuideShot} formNoValidate>
              Remove
            </Button>
          )}
          <FieldError name="image" className="w-full" />
          <FormMessage error={state.fieldErrors ? undefined : state.error} />
        </ValidatedForm>
      </div>
    </li>
  );
}

/** Every guide screenshot: what's there, with upload / replace / remove. */
export function ShotChecklist({ shots }: { shots: Shot[] }) {
  const done = shots.filter((shot) => shot.url).length;
  return (
    <>
      <p className="mt-2 text-xs text-zinc-500">
        {done} of {shots.length} added. PNG, JPG or WebP, up to 5 MB.
      </p>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2">
        {shots.map((shot) => (
          <ShotCard key={shot.file} shot={shot} />
        ))}
      </ul>
    </>
  );
}
