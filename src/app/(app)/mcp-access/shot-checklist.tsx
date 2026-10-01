"use client";

import { useEffect, useState } from "react";

type Shot = { file: string; caption: string; src: string };

/** Which guide screenshots exist yet (checked from the browser). */
export function ShotChecklist({ shots }: { shots: Shot[] }) {
  const [present, setPresent] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let live = true;
    Promise.all(
      shots.map((shot) =>
        fetch(shot.src, { method: "HEAD" })
          .then((response) => [shot.file, response.ok] as const)
          .catch(() => [shot.file, false] as const),
      ),
    ).then((results) => {
      if (live) setPresent(Object.fromEntries(results));
    });
    return () => {
      live = false;
    };
  }, [shots]);
  const done = Object.values(present).filter(Boolean).length;
  return (
    <>
      <p className="mt-2 text-xs text-zinc-500">
        {done} of {shots.length} added.
      </p>
      <ul className="mt-2 grid gap-3 sm:grid-cols-2">
        {shots.map((shot) => (
          <li key={shot.file} className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {present[shot.file] ? (
              <a href={shot.src} target="_blank" rel="noreferrer" title="Open full size">
                {/* eslint-disable-next-line @next/next/no-img-element -- plain files in public/ */}
                <img src={shot.src} alt={shot.caption} loading="lazy" className="aspect-video w-full bg-zinc-50 object-contain dark:bg-zinc-900" />
              </a>
            ) : (
              <div
                title={shot.file}
                className="flex aspect-video w-full items-center justify-center border-b border-dashed border-zinc-200 bg-zinc-50 text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
              >
                {shot.file in present ? "Screenshot not added yet" : "Checking…"}
              </div>
            )}
            <p className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">{shot.caption}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
