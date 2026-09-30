"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeAvatar } from "@/components/employee-avatar";
import { ArrowOutwardIcon } from "@/components/icons";
import { formatDay } from "@/lib/format-date";
import { JOB_KINDS, JOB_KIND_LABELS } from "@/lib/assign/taxonomy";
import type { DesignerEvidence, DesignerRef, JobEvidence } from "@/lib/assign/suggest";
import {
  askSuggestion,
  classifyNow,
  recordChoice,
  type AskState,
  type ChoiceState,
  type ClassifyState,
} from "./actions";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

export function SuggestForm({
  coordinators,
  designers,
}: {
  coordinators: { personId: string; name: string; jobs: number }[];
  designers: DesignerRef[];
}) {
  const [state, formAction, pending] = useActionState<AskState, FormData>(
    askSuggestion,
    {},
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">The job</span>
          <Textarea
            name="description"
            required
            minLength={10}
            rows={4}
            placeholder="Paste the brief or describe it: client, what's needed, sizes, where it goes."
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Client Coordinator</span>
            <select name="coordinatorId" className={selectClass} defaultValue="">
              <option value="">Any — compare across all coordinators</option>
              {coordinators.map((coordinator) => (
                <option key={coordinator.personId} value={coordinator.personId}>
                  {coordinator.name} ({coordinator.jobs} jobs)
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-500">
              Rework counts describe a designer and a coordinator together, so
              comparing under one coordinator is fairer.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Kind of job</span>
            <select name="kind" className={selectClass} defaultValue="">
              <option value="">Let the system read the description</option>
              {JOB_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {JOB_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Reading the record…" : "Who should take this?"}
          </Button>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        </div>
      </form>

      {state.result && state.queryId && (
        <Result
          key={state.queryId}
          queryId={state.queryId}
          kindBy={state.kindBy ?? "ai"}
          result={state.result}
          designers={designers}
        />
      )}
    </div>
  );
}

function Result({
  queryId,
  kindBy,
  result,
  designers,
}: {
  queryId: string;
  kindBy: "ai" | "manual";
  result: NonNullable<AskState["result"]>;
  designers: DesignerRef[];
}) {
  return (
    <section className="flex flex-col gap-4" aria-live="polite">
      <p className="text-sm">
        Read as <strong>{JOB_KIND_LABELS[result.kind]}</strong>
        <span className="text-zinc-500">
          {kindBy === "ai" ? " (by the model &mdash; pick the kind above if that&rsquo;s wrong)" : " (your choice)"}
          {result.coordinatorId ? ", compared under this coordinator." : ", compared across all coordinators."}
        </span>
      </p>

      {result.status === "no-history" ? (
        <Card tone="muted" title="Not enough history to suggest anyone">
          <p className="text-sm">{result.safeReason}</p>
          <p className="mt-2 text-sm text-zinc-500">
            That&rsquo;s an honest answer, not a failure. Choose as you normally would;
            the record will grow.
          </p>
        </Card>
      ) : (
        result.safe && (
          <Card tone="safe" title="Safe pick">
            <Designer evidence={result.safe} reason={result.safeReason} />
          </Card>
        )
      )}

      {result.learning && (
        <Card tone="learning" title="Could learn from this">
          <Designer evidence={result.learning} reason={result.learningRisk} />
        </Card>
      )}

      {result.others.length > 0 && (
        <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-medium">
            Also on record for this kind of job ({result.others.length}, alphabetical)
          </summary>
          <div className="mt-4 flex flex-col gap-6">
            {result.others.map((evidence) => (
              <Designer key={evidence.designer.personId} evidence={evidence} />
            ))}
          </div>
        </details>
      )}

      <p className="text-xs text-zinc-500">{result.note}</p>

      <ChoiceForm queryId={queryId} designers={designers} />
    </section>
  );
}

function Card({
  tone,
  title,
  children,
}: {
  tone: "safe" | "learning" | "muted";
  title: string;
  children: React.ReactNode;
}) {
  const border = {
    safe: "border-emerald-300 dark:border-emerald-800",
    learning: "border-amber-300 dark:border-amber-800",
    muted: "border-zinc-200 dark:border-zinc-800",
  }[tone];
  return (
    <section className={`rounded-xl border p-4 ${border}`}>
      <h2 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Designer({
  evidence,
  reason,
}: {
  evidence: DesignerEvidence;
  reason?: string;
}) {
  const { designer } = evidence;
  return (
    <div>
      <div className="flex items-center gap-3">
        <EmployeeAvatar name={designer.name} avatarKey={designer.avatarKey} />
        <div className="min-w-0">
          <p className="font-medium">{designer.name}</p>
          {designer.title && <p className="text-xs text-zinc-500">{designer.title}</p>}
        </div>
      </div>
      {reason && <p className="mt-3 text-sm">{reason}</p>}
      {evidence.similar.length > 0 && (
        <Evidence jobs={evidence.similar} />
      )}
    </div>
  );
}

function Evidence({ jobs }: { jobs: JobEvidence[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? jobs : jobs.slice(0, 5);
  const aiOnly = jobs.some((job) => job.labelSource === "ai");
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-zinc-500">The jobs behind this</p>
      <ul className="mt-1 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
        {shown.map((job) => (
          <li key={job.id} className="flex items-start justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <a
                href={job.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              >
                <span className="truncate">{job.title}</span>
                <ArrowOutwardIcon className="size-3.5 shrink-0 text-zinc-400" />
              </a>
              <p className="text-xs text-zinc-500">
                {job.bucketName} · {formatDay(job.completedAt)} · {job.coordinatorName}
              </p>
            </div>
            <span
              className={`shrink-0 text-xs ${
                job.corrections === 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {job.corrections === 0
                ? "no correction"
                : `${job.corrections} correction${job.corrections === 1 ? "" : "s"}`}
            </span>
          </li>
        ))}
      </ul>
      {jobs.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-1 text-xs text-zinc-500 underline-offset-4 hover:underline"
        >
          {showAll ? "Show fewer" : `Show all ${jobs.length}`}
        </button>
      )}
      {aiOnly && (
        <p className="mt-2 text-xs text-zinc-500">
          Some of these were read by the model, not a coordinator.
        </p>
      )}
    </div>
  );
}

function ChoiceForm({
  queryId,
  designers,
}: {
  queryId: string;
  designers: DesignerRef[];
}) {
  const [state, formAction, pending] = useActionState<ChoiceState, FormData>(
    recordChoice,
    {},
  );
  if (state.ok)
    return <p className="text-sm text-emerald-600">Noted. Thanks — this is what the system gets compared against.</p>;
  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-zinc-200 p-4 md:flex-row md:items-center dark:border-zinc-800"
    >
      <input type="hidden" name="queryId" value={queryId} />
      <label className="text-sm font-medium md:mr-2">Who did you give it to?</label>
      <select name="personId" required className={`${selectClass} md:w-56`} defaultValue="">
        <option value="">Pick a designer…</option>
        {designers.map((designer) => (
          <option key={designer.personId} value={designer.personId}>
            {designer.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Record choice"}
      </Button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

/** HR: read whatever the sync left unclassified. */
export function ClassifyButton() {
  const [state, formAction, pending] = useActionState<ClassifyState, FormData>(
    classifyNow,
    {},
  );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Reading…" : "Read new jobs & comments"}
      </Button>
      {state.ok && <p className="text-sm text-emerald-600">{state.ok}</p>}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
