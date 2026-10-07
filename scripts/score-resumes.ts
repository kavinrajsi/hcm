// Backfill: scores every candidate without a resume score yet, paced for
// the AI Gateway's 5-requests-a-minute limit (4/min, leaving room for the
// leave sync). Safe to stop and rerun: it carries on where it left off.
// Usage: npx tsx scripts/score-resumes.ts [limit]
import { config } from "dotenv";

async function main() {
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });
  const { scorePending, candidatesToScore } = await import("@/lib/candidates/score");
  const limit = Number(process.argv[2] ?? 2000);
  console.log(`Scoring up to ${(await candidatesToScore(limit)).length} candidates…`);
  const total = { SCORED: 0, NO_RESUME: 0, FAILED: 0, RATE_LIMITED: 0, NO_CREDIT: 0 };
  while (true) {
    const counts = await scorePending({ limit: 20, deadline: Date.now() + 10 * 60_000, trigger: "script" });
    for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += counts[key];
    console.log(new Date().toISOString().slice(11, 19), JSON.stringify(total));
    if (counts.NO_CREDIT) {
      console.log("AI Gateway credit is out; stopping. Top up, or score from Claude over MCP.");
      break;
    }
    if (counts.RATE_LIMITED) {
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      continue;
    }
    if (counts.SCORED + counts.NO_RESUME + counts.FAILED === 0) break;
    if (total.SCORED + total.NO_RESUME + total.FAILED >= limit) break;
  }
  process.exit(0);
}
main();
