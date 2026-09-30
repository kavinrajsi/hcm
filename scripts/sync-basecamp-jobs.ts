// Pulls completed Basecamp to-dos and comments into Job/JobComment, then
// classifies job kinds and comment categories. Same job as the Assign page
// button and the daily cron. Safe to re-run.
//
//   npx tsx scripts/sync-basecamp-jobs.ts            # sync + classify
//   npx tsx scripts/sync-basecamp-jobs.ts --no-ai    # sync only
import "./load-env";
import { db } from "@/lib/db";
import { summarizeJobsSync, syncBasecampJobs } from "@/lib/assign/jobs-sync";
import { classifyPending } from "@/lib/assign/classify";

async function main() {
  const result = await syncBasecampJobs((event) => {
    if (event.type === "step") console.log(event.message);
    else if (event.type === "job" && event.status !== "unchanged")
      console.log(`  ${event.status}: ${event.bucket} · ${event.title}`);
  }, { budgetMs: 20 * 60_000 });
  console.log(summarizeJobsSync(result));
  if (process.argv.includes("--no-ai")) return;
  const classified = await classifyPending(20 * 60_000, "script");
  console.log(
    `classified ${classified.jobs} jobs, ${classified.comments} comments; ` +
      `${classified.remaining.jobs} jobs, ${classified.remaining.comments} comments still pending`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
