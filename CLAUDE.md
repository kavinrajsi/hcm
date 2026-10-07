@AGENTS.md

# Claude Code notes

Everything in AGENTS.md applies. On top of it:

## Before you say it's done

- **See it running.** For UI changes, start `npm run dev` and open the page (Claude in Chrome or a screenshot). Check a phone width too. Say plainly if you couldn't verify something.
- Run `npx tsc --noEmit`, `npm run lint` on touched files, and `npm test`.
- For anything that hits Basecamp, the AI Gateway or blob storage, prove it with one real call (read-only where possible) rather than only mocks.

## Production data

- The local database *is* production. Read freely; **ask before writing** unless the user asked for that exact write: migrations, `--apply` scripts, seeds, `AppSetting` changes, score resets, token creation.
- Additive migration flow: write `migration.sql` → `npx prisma migrate deploy` → `npx prisma generate` → code. Never regenerate the client ahead of the database.
- If a permission prompt or classifier blocks a production write, stop and tell the user what you were doing and why; don't route around it.

## One-off scripts

- Put throwaway scripts in the session scratchpad, not `scripts/`. Run them from the repo root with `npx tsx --tsconfig tsconfig.json <file>` so `@/` imports resolve; import `dotenv` by absolute path (`/…/hcm/node_modules/dotenv`) and load `.env.local` then `.env`.
- Print counts and ids, not personal data. Never print `.env` values, tokens, or decrypted PII.

## Product habits that worked

- Plain-language summaries for HR: what changed for them, what they need to do, what's not done yet.
- Mention when an AI-cost or Basecamp-rate-limit concern applies (AI Gateway credit is shared by MadMax, resume scoring, leave and Assign classification).
- Basecamp to-dos created by HCM keep the `"[test] "` prefix.
