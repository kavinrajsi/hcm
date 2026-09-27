# Encryption keys: backup and rotation

HCM encrypts employee PII in the app before it reaches the database
(`src/lib/crypto.ts`, AES-256-GCM). Encrypted columns:

- PAN, Aadhaar, bank account, IFSC (`panEnc`, `aadhaarEnc`, `bankAccountEnc`, `ifscEnc`)
- phone, personal email, emergency contact, address, date of birth, PF, UAN
  (`phoneEnc` … `uanNumberEnc`, via `src/lib/employee-pii.ts`)
- Basecamp OAuth tokens (`BasecampToken.accessTokenEnc` / `refreshTokenEnc`)

PAN, Aadhaar and bank account also have blind indexes (`panHash`,
`aadhaarHash`, `bankAccountHash`) used to catch duplicates without
decrypting.

## The keys

| Env var | Purpose | If lost |
|---|---|---|
| `FIELD_ENCRYPTION_KEY` | Encrypts/decrypts every `*Enc` column | **All encrypted values are unrecoverable.** Employees must re-enter them; Basecamp must be reconnected. |
| `FIELD_ENCRYPTION_KEY_ID` | Id stamped on new values (`k<id>:…`), default `1` | Set it back to the id of the active key. |
| `FIELD_ENCRYPTION_OLD_KEYS` | Decrypt-only keys during rotation, `id:hex,id:hex` | Values still on that key can't be read until it's restored. |
| `BLIND_INDEX_KEY` | HMAC for the duplicate-check hashes | Duplicate checks stop matching existing rows; recompute with `scripts/reencrypt.ts`. |

Keys are 32 random bytes as 64 hex characters. Generate one with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

They live in Vercel → project **hcm** → Settings → Environment Variables
(Production, Preview, Development) and in your local `.env`. Production,
preview and local all point at the same database, so **all environments must
use the same keys**.

## Back up the keys (do this now, and after every rotation)

1. `vercel env pull .env.backup --environment=production`
2. Copy `FIELD_ENCRYPTION_KEY`, `FIELD_ENCRYPTION_KEY_ID` (if set) and
   `BLIND_INDEX_KEY` into the company password manager as one secure note
   named **HCM encryption keys**, with the date. Share it with a second admin.
3. Delete the pulled file: `rm .env.backup` (never commit it).
4. Verify the backup decrypts real data: put the backed-up values in a
   scratch `.env` and run `npx tsx scripts/reencrypt.ts` (dry run). It must
   finish with no "No encryption key configured" or decrypt error.

## Rotate `FIELD_ENCRYPTION_KEY`

Do it if the key may have leaked, or on a schedule (yearly).

1. Back up the current key (above).
2. Generate a new key. In Vercel (all environments) and local `.env`:
   - `FIELD_ENCRYPTION_OLD_KEYS` = `<current id>:<current key>` — the current
     id is `FIELD_ENCRYPTION_KEY_ID`, or `1` if it isn't set
   - `FIELD_ENCRYPTION_KEY` = new key
   - `FIELD_ENCRYPTION_KEY_ID` = next id (e.g. `2`)
3. Redeploy (`vercel --prod` or push). New writes use the new key; old values
   still decrypt through `FIELD_ENCRYPTION_OLD_KEYS`.
4. `npx tsx scripts/reencrypt.ts` (dry run: counts), then
   `npx tsx scripts/reencrypt.ts --apply`. Run the dry run again: it should
   report 0 rows.
5. Remove `FIELD_ENCRYPTION_OLD_KEYS` everywhere and redeploy.
6. Back up the new key; delete the old one from the password manager only
   after step 5 is live.

## Rotate `BLIND_INDEX_KEY`

Change `BLIND_INDEX_KEY` everywhere, redeploy, then run
`npx tsx scripts/reencrypt.ts --apply` — it recomputes the existing hashes
from the decrypted values. Until it finishes, duplicate checks won't match
older rows.
