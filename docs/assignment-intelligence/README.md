# Assignment Intelligence — how it's built

The proposal is in [proposal.md](./proposal.md). This is the map of the code.

## Data

Completed Basecamp to-dos are pulled into three tables (`prisma/schema.prisma`):

| Table | What |
|---|---|
| `Job` | One completed to-do: client (bucket), title, who raised it (creator), when it was closed, `kind` (what sort of design), `evalSet` (train / dev / holdout) |
| `JobAssignee` | Who did the work, linked to `Employee` by email when possible |
| `JobComment` | The thread, with the model's `aiLabels` |
| `CommentLabel` | A coordinator's reading of one comment, one row per labeller |
| `DesignerBelief` | The floor manager's beliefs, written down once |
| `AssignmentQuery` | Each question asked, the answer given, and who was actually picked |

Sync: `src/lib/assign/jobs-sync.ts`. Runs from the Assign page (HR button,
streamed through `/api/basecamp/jobs-sync`), the daily cron
(`/api/cron/basecamp-jobs`, 04:00 IST) or `npx tsx scripts/sync-basecamp-jobs.ts`.
Unchanged to-dos are skipped, so re-running is cheap.

Client Coordinators on the Assign form are current employees with one of
`COORDINATOR_DESIGNATIONS` (`src/lib/assign/data.ts`: CGP, IT Head, HCM,
Delivery Manager, CFO, Founder, Co-Founder, Marketing Manager), matched to
the jobs they raised by `Employee.basecampPersonId`. Someone with no
Basecamp link is listed but can't be picked.

## The two judgement calls (model)

`src/lib/assign/classify.ts`, via Vercel AI Gateway (`ASSIGN_AI_MODEL`,
default `google/gemini-2.5-flash-lite`; logged under Admin → AI usage):

- **Job kind** — one of `JOB_KINDS` in `taxonomy.ts`, from the to-do title,
  description and project name. A person can fix it on the labelling page.
- **Comment categories** — every category that applies from
  `COMMENT_CATEGORIES`: correction, client change, timing, handoff, other.
  Coordinator-labelled comments from the train set go into the prompt as
  examples.

## Counting (no model)

`src/lib/assign/suggest.ts`. A job's rework = comments read as CORRECTION.
Coordinator labels win over the model's (`effectiveLabels` in `eval.ts`:
a category counts when at least half the labellers chose it).

For a new job of kind K, optionally under coordinator C:

- **Safe pick** — the designer with the largest share of similar jobs
  (same K, same C) that needed no correction, among those with at least
  `MIN_SIMILAR` (3). Ties are named, not hidden.
- **Learning pick** — someone with fewer than 3 similar jobs but at least
  `MIN_OVERALL` (5) jobs of any kind, with the risk spelled out.
- **Not enough history** — when nobody reaches 3 similar jobs. Nobody is
  suggested.
- **Others** — everyone else with a similar job, alphabetical, never ranked.

Every pick shows the jobs behind it with Basecamp links.

## Basecamp to-do for a pick

When HR has pasted a to-do list link on the Assign page (AppSetting
`assign.todoList`), recording a pick creates a to-do there, titled
`[test] <first line of the brief>` and assigned to the picked designer with
`notify: false` (`src/lib/assign/todo.ts`; the prefix lives in
`testTodoTitle` in `src/lib/basecamp.ts`, the only place HCM writes a
to-do). A changed pick reassigns the same to-do. It's written with the
Basecamp connection of the most recently connected HR admin. A Basecamp
failure never loses the pick; the form says what went wrong.

## Measuring it

`src/lib/assign/eval.ts` and the "How well it reads" page:

1. **Labels vs labels** — Cohen's kappa per category between the two
   coordinators on comments both have read. Drawing the sample picks 30
   train jobs once (`src/lib/assign/shared.ts`, AppSetting
   `assign.sharedJobs`); the labels page marks them "Both" and lists them
   first, and "Next unlabelled" serves them before anything else.
2. **Model vs labels** — precision / recall / F1 per category on the dev
   set; the holdout set is shown only to HR and only on request
   (`/assign/eval?holdout=1`).
3. **Beliefs vs record** — what the floor manager wrote down (create-only)
   next to what the record says for that designer and kind.
4. **Suggestions vs choices** — how often the recorded pick was the safe
   pick, the learning pick, or someone else.

## Pages

| Route | Who | What |
|---|---|---|
| `/assign` | HR, managers | Ask "who should take this?"; record the choice; HR syncs and classifies |
| `/assign/labels` | HR, managers | Draw the sample (HR); list of sample jobs and your progress |
| `/assign/labels/[jobId]` | HR, managers | Read one thread, tick categories, fix the job kind |
| `/assign/beliefs` | HR, managers | Write beliefs down once; HR names the floor manager, who sees no suggestions until his beliefs exist (`src/lib/assign/floor-manager.ts`) |
| `/assign/eval` | HR, managers | The four measurements above |
