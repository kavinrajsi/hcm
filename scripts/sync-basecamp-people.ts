// Links Basecamp people to employees (by work, then personal email) and
// stores their Basecamp profile pictures. Same job as the Employees button
// and the daily cron. Safe to re-run: unchanged pictures aren't downloaded.
//
//   npx tsx scripts/sync-basecamp-people.ts
import "./load-env";
import { db } from "@/lib/db";
import { summarize, syncBasecampPeople } from "@/lib/basecamp-people";

async function main() {
  const result = await syncBasecampPeople();
  console.log(summarize(result));
  for (const person of result.unmatched) {
    console.log(`  unmatched: ${person.name} ${person.email}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
