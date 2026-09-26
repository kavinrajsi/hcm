import { formatNoteTime } from "../../candidates/notes";
import { idCardStatusLabel } from "@/lib/id-card-status";

type Change = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: Date;
  changedBy: { name: string | null; email: string } | null;
};

function Chip({ status }: { status: string }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
      {idCardStatusLabel(status)}
    </span>
  );
}

/** ID card status moves for one employee, newest first. */
export function IdCardHistory({ changes }: { changes: Change[] }) {
  return (
    <section className="mt-6 rounded-lg border border-zinc-200 p-5 text-sm dark:border-zinc-800">
      <h2 className="font-medium">ID card history</h2>
      {changes.length === 0 ? (
        <p className="mt-2 text-zinc-500">No status changes yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3 border-l border-zinc-200 pl-4 dark:border-zinc-800">
          {changes.map((c) => {
            const by = c.changedBy?.name ?? c.changedBy?.email;
            return (
              <li key={c.id} className="relative">
                <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.fromStatus ? (
                    <>
                      <Chip status={c.fromStatus} />
                      <span className="text-zinc-400">→</span>
                      <Chip status={c.toStatus} />
                    </>
                  ) : (
                    <>
                      <span>Created as</span>
                      <Chip status={c.toStatus} />
                    </>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatNoteTime(c.changedAt.toISOString())}
                  {by && <> · by {by}</>}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
