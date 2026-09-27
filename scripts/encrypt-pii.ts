// One-off backfill: moves employee contact / personal / statutory fields
// from their plaintext columns into the encrypted `<field>Enc` columns
// (src/lib/employee-pii.ts) and fills bankAccountHash for existing rows.
//
//   npx tsx scripts/encrypt-pii.ts           # dry run: counts only
//   npx tsx scripts/encrypt-pii.ts --apply   # write
//
// Idempotent. Prints counts and Emp IDs only — never field values.
import "dotenv/config";
import { db } from "@/lib/db";
import { blindIndex, decryptField, encryptField } from "@/lib/crypto";
import { PII_FIELDS, PII_SELECT, type PiiField } from "@/lib/employee-pii";

const apply = process.argv.includes("--apply");

function plaintext(
  row: Record<string, unknown>,
  field: PiiField,
): string | null {
  const v = row[field];
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return typeof v === "string" && v !== "" ? v : null;
}

async function main() {
  const employees = await db.employee.findMany({
    select: {
      id: true,
      empId: true,
      bankAccountEnc: true,
      bankAccountHash: true,
      ...PII_SELECT,
    },
  });

  // Bank hashes: existing ones plus ones to compute; a hash shared by more
  // than one employee is a duplicate and is left unset for HR to resolve.
  const bankHash = new Map<string, string>(); // employee id → hash
  const holders = new Map<string, string[]>(); // hash → emp ids
  for (const e of employees) {
    const hash =
      e.bankAccountHash ??
      (e.bankAccountEnc ? blindIndex(decryptField(e.bankAccountEnc)) : null);
    if (!hash) continue;
    bankHash.set(e.id, hash);
    holders.set(hash, [...(holders.get(hash) ?? []), e.empId]);
  }
  const duplicateGroups = [...holders.values()].filter((ids) => ids.length > 1);
  const duplicated = new Set(duplicateGroups.flat());

  let rows = 0;
  let fields = 0;
  let hashes = 0;
  for (const e of employees) {
    const data: Record<string, string | null> = {};
    for (const field of PII_FIELDS) {
      const plain = plaintext(e, field);
      if (plain === null) continue;
      if (!e[`${field}Enc`]) {
        data[`${field}Enc`] = encryptField(plain);
        fields++;
      }
      data[field] = null; // plaintext retired either way
    }
    const hash = bankHash.get(e.id);
    if (hash && !e.bankAccountHash && !duplicated.has(e.empId)) {
      data.bankAccountHash = hash;
      hashes++;
    }
    if (Object.keys(data).length === 0) continue;
    rows++;
    if (apply) await db.employee.update({ where: { id: e.id }, data });
  }

  console.log(
    `${apply ? "Applied" : "Dry run"}: ${employees.length} employees scanned, ` +
      `${rows} rows to update, ${fields} fields encrypted, ${hashes} bank hashes set.`,
  );
  if (duplicateGroups.length) {
    console.log(
      `Duplicate bank accounts (left unhashed, fix in HR): ${duplicateGroups
        .map((ids) => ids.join(" = "))
        .join("; ")}`,
    );
  }
  const left = await db.employee.count({
    where: {
      OR: [
        { phone: { not: null } },
        { personalEmail: { not: null } },
        { emergencyContact: { not: null } },
        { address: { not: null } },
        { dateOfBirth: { not: null } },
        { pfNumber: { not: null } },
        { uanNumber: { not: null } },
      ],
    },
  });
  console.log(`Rows still holding plaintext PII: ${left}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
