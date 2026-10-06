// One-off backfill: scores every candidate without a resume score yet.
// Usage: npx tsx scripts/score-resumes.ts [limit]
import { config } from "dotenv";

async function main() {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  const { scorePending, candidatesToScore } = await import("@/lib/candidates/score");
  const limit = Number(process.argv[2] ?? 2000);
  const pending = (await candidatesToScore(limit)).length;
  console.log(`Scoring up to ${pending} candidates…`);
  let total = { SCORED: 0, NO_RESUME: 0, FAILED: 0 };
  // Batches of 30 so progress shows and a crash loses little.
  while (true) {
    const counts = await scorePending({ limit: 30, deadline: Date.now() + 10 * 60_000, trigger: "script" });
    const done = counts.SCORED + counts.NO_RESUME + counts.FAILED;
    total = { SCORED: total.SCORED + counts.SCORED, NO_RESUME: total.NO_RESUME + counts.NO_RESUME, FAILED: total.FAILED + counts.FAILED };
    console.log(JSON.stringify(total));
    if (done === 0 || total.SCORED + total.NO_RESUME + total.FAILED >= limit) break;
  }
  process.exit(0);
}
main();
