"use client";

import { useState } from "react";

/** A guide screenshot that quietly disappears until the file is added. */
export function GuideShot({ src, caption, step }: { src: string; caption: string; step?: number }) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    <figure className="mt-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- plain files in public/, sizes vary */}
      <img
        src={src}
        alt={caption}
        loading="lazy"
        onError={() => setMissing(true)}
        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
      />
      <figcaption className="mt-1 text-xs text-zinc-500">
        {step ? `Step ${step}: ` : ""}
        {caption}
      </figcaption>
    </figure>
  );
}
