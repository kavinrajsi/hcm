// Read-only check before trusting Jev: runs recent classified leave posts
// through Jev and compares its type with the one stored (manual edits count
// as ground truth). Changes nothing in the database. Needs AI Gateway
// credits that include typesafe-ai/jev.
//
//   npx tsx scripts/compare-jev.ts 200
import "dotenv/config";
import { db } from "@/lib/db";
import { jevLeaveTypes } from "@/lib/leave-type-jev";
import type { LeavePost } from "@/lib/leave-classify";

const BATCH = 20;

async function main() {
  const limit = Math.min(Number(process.argv[2]) || 100, 1000);
  const rows = await db.leaveEntry.findMany({
    where: { type: { not: null } },
    orderBy: { postedAt: "desc" },
    take: limit,
    select: {
      id: true,
      checkin: true,
      postedOn: true,
      postedAt: true,
      message: true,
      type: true,
      classifiedBy: true,
    },
  });

  let compared = 0;
  let agreed = 0;
  let manualCompared = 0;
  let manualAgreed = 0;
  const confusion = new Map<string, number>();

  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const posts: LeavePost[] = batch.map((row) => ({
      id: row.id,
      checkin: row.checkin === "wfh" ? "wfh" : "leave",
      postedOn: row.postedOn.toISOString().slice(0, 10),
      postedAt: row.postedAt.toISOString(),
      message: row.message,
    }));
    const types = await jevLeaveTypes(posts, "script");
    if (!types) throw new Error("Jev unavailable (see the error above)");
    for (const row of batch) {
      const jevType = types.get(row.id);
      if (!jevType) continue; // not confident
      compared++;
      const same = jevType === row.type;
      if (same) agreed++;
      else {
        const key = `${row.type} → ${jevType}`;
        confusion.set(key, (confusion.get(key) ?? 0) + 1);
      }
      if (row.classifiedBy === "manual") {
        manualCompared++;
        if (same) manualAgreed++;
      }
    }
  }

  const pct = (part: number, whole: number) =>
    whole ? `${Math.round((part / whole) * 100)}%` : "—";
  console.log(`Posts checked: ${rows.length}, Jev confident on ${compared}`);
  console.log(
    `Agrees with stored type: ${agreed}/${compared} (${pct(agreed, compared)})`,
  );
  console.log(
    `Agrees with HR's manual edits: ${manualAgreed}/${manualCompared} (${pct(manualAgreed, manualCompared)})`,
  );
  if (confusion.size) {
    console.log("Disagreements (stored → Jev):");
    for (const [key, count] of [...confusion].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${key}: ${count}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
