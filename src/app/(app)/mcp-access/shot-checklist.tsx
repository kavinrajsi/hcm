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
      <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
        {shots.map((shot) => (
          <li key={shot.file} className="flex items-start gap-3 px-4 py-2">
            <span className={present[shot.file] ? "text-emerald-600" : "text-zinc-400"}>
              {present[shot.file] ? "✓" : "○"}
            </span>
            <span className="min-w-0">
              <code className="text-xs">{shot.file}</code>
              <span className="block text-xs text-zinc-500">{shot.caption}</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
