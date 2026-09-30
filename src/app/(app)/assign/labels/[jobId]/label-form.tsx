"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  COMMENT_CATEGORIES,
  COMMENT_CATEGORY_HINTS,
  COMMENT_CATEGORY_LABELS,
} from "@/lib/assign/taxonomy";
import { saveLabels, type LabelState } from "../../actions";

export type CommentToLabel = {
  id: string;
  authorName: string;
  role: "designer" | "coordinator" | "other";
  postedAt: string; // formatted
  content: string;
  link: string;
  mine: string[];
};

const ROLE_LABELS = {
  designer: "designer",
  coordinator: "coordinator",
  other: "",
};

export function LabelForm({
  jobId,
  comments,
}: {
  jobId: string;
  comments: CommentToLabel[];
}) {
  const [state, formAction, pending] = useActionState<LabelState, FormData>(
    saveLabels,
    {},
  );
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="jobId" value={jobId} />
      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-500">What the categories mean</summary>
        <dl className="mt-2 grid gap-1 md:grid-cols-[auto_1fr] md:gap-x-4">
          {COMMENT_CATEGORIES.map((category) => (
            <div key={category} className="contents">
              <dt className="font-medium">{COMMENT_CATEGORY_LABELS[category]}</dt>
              <dd className="mb-1 text-zinc-500 md:mb-0">{COMMENT_CATEGORY_HINTS[category]}</dd>
            </div>
          ))}
        </dl>
      </details>

      <ol className="flex flex-col gap-3">
        {comments.map((comment, index) => (
          <li
            key={comment.id}
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-zinc-500">
              <span>
                {index + 1}. <span className="font-medium text-foreground">{comment.authorName}</span>
                {ROLE_LABELS[comment.role] && ` · ${ROLE_LABELS[comment.role]}`}
              </span>
              <a href={comment.link} target="_blank" rel="noreferrer" className="hover:underline">
                {comment.postedAt}
              </a>
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap">
              {comment.content || <span className="text-zinc-400">(attachment only)</span>}
            </p>
            <fieldset className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              <legend className="sr-only">Categories for comment {index + 1}</legend>
              {COMMENT_CATEGORIES.map((category) => (
                <label key={category} className="flex min-h-9 items-center gap-2 text-sm md:min-h-7">
                  <input
                    type="checkbox"
                    name={`labels:${comment.id}`}
                    value={category}
                    defaultChecked={comment.mine.includes(category)}
                    className="size-4 accent-primary"
                  />
                  {COMMENT_CATEGORY_LABELS[category]}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save my reading"}
        </Button>
        {state.ok && <p className="text-sm text-emerald-600">Saved.</p>}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
