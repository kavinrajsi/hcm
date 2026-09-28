// Key rotation: re-encrypts every encrypted column with the active
// FIELD_ENCRYPTION_KEY and recomputes the blind indexes with the current
// BLIND_INDEX_KEY. Run after deploying a new key with the old one listed in
// FIELD_ENCRYPTION_OLD_KEYS (see docs/security/encryption-keys.md).
//
//   npx tsx scripts/reencrypt.ts           # dry run: counts only
//   npx tsx scripts/reencrypt.ts --apply   # write
//
// Prints counts only — never values.
import "dotenv/config";
import { db } from "@/lib/db";
import {
  blindIndex,
  decryptField,
  encryptField,
  needsReencrypt,
} from "@/lib/crypto";

const apply = process.argv.includes("--apply");

const EMPLOYEE_ENC_COLUMNS = [
  "panEnc",
  "aadhaarEnc",
  "bankAccountEnc",
  "ifscEnc",
  "phoneEnc",
  "personalEmailEnc",
  "emergencyContactEnc",
  "addressEnc",
  "dateOfBirthEnc",
  "pfNumberEnc",
  "uanNumberEnc",
] as const;

// Enc column → blind index column computed from the same plaintext.
const HASHED = {
  panEnc: "panHash",
  aadhaarEnc: "aadhaarHash",
  bankAccountEnc: "bankAccountHash",
} as const;

async function main() {
  let values = 0;
  let hashes = 0;
  let rows = 0;
  const failed: string[] = [];

  const employees = await db.employee.findMany({
    select: {
      id: true,
      empId: true,
      panHash: true,
      aadhaarHash: true,
      bankAccountHash: true,
      ...Object.fromEntries(
        EMPLOYEE_ENC_COLUMNS.map((column) => [column, true]),
      ),
    },
  });
  for (const employee of employees as unknown as Record<
    string,
    string | null
  >[]) {
    const data: Record<string, string> = {};
    for (const column of EMPLOYEE_ENC_COLUMNS) {
      const stored = employee[column];
      if (!stored) continue;
      const plain = decryptField(stored);
      if (needsReencrypt(stored)) {
        data[column] = encryptField(plain);
        values++;
      }
      if (column in HASHED) {
        const hashColumn = HASHED[column as keyof typeof HASHED];
        // Only refresh an existing hash (a duplicate bank account stays unset).
        if (
          employee[hashColumn] &&
          employee[hashColumn] !== blindIndex(plain)
        ) {
          data[hashColumn] = blindIndex(plain);
          hashes++;
        }
      }
    }
    if (Object.keys(data).length === 0) continue;
    rows++;
    if (apply) {
      try {
        await db.employee.update({
          where: { id: employee.id as string },
          data,
        });
      } catch {
        failed.push(employee.empId as string);
      }
    }
  }

  const tokens = await db.basecampToken.findMany({
    select: { id: true, accessTokenEnc: true, refreshTokenEnc: true },
  });
  let tokenRows = 0;
  for (const token of tokens) {
    const data: Record<string, string> = {};
    if (needsReencrypt(token.accessTokenEnc)) {
      data.accessTokenEnc = encryptField(decryptField(token.accessTokenEnc));
    }
    if (token.refreshTokenEnc && needsReencrypt(token.refreshTokenEnc)) {
      data.refreshTokenEnc = encryptField(decryptField(token.refreshTokenEnc));
    }
    if (Object.keys(data).length === 0) continue;
    tokenRows++;
    if (apply) await db.basecampToken.update({ where: { id: token.id }, data });
  }

  console.log(
    `${apply ? "Applied" : "Dry run"}: ${rows} employee rows (${values} values re-encrypted, ` +
      `${hashes} blind indexes refreshed), ${tokenRows} Basecamp token rows.`,
  );
  if (failed.length)
    console.log(`Failed (check manually): ${failed.join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
