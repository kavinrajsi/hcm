# HCM — Madarth Connect

Madarth's internal HR system, live at **https://connect.madarth.com**. It runs the people side of the agency: job applications and AI resume screening, employee records, onboarding, probation, exits, leave and WFH (from Basecamp check-ins), devices, learning, letters, and an AI assistant (MadMax) that can also be used from Claude, ChatGPT or Cursor over MCP.

| Who | What they get |
|---|---|
| **HR admins** | Everything: candidates, employee records, letters, devices, admin (users, AI usage and caps, Basecamp sync, MCP access, email log) |
| **Managers** | Their direct reports: leave approvals, probation, onboarding, exits, Quantum work log, Assign, devices, learning authoring |
| **Employees** | Their own profile, leave, work log, devices, learning and sessions, the Staff directory and MadMax |

## Docs

| File | For |
|---|---|
| [WIKI-INDEX.md](WIKI-INDEX.md) | Table of contents: every module, page and integration, with links |
| [WIKI.md](WIKI.md) | A tour of each module: what it's for and who sees it |
| [WIKI-DETAILED.md](WIKI-DETAILED.md) | Internals: routes, guards, models, crons, AI, env vars, scripts |
| [DESIGN.md](DESIGN.md) | Architecture, then the UI design system |
| [AGENTS.md](AGENTS.md) | Rules and conventions for coding agents (and humans) |
| [CLAUDE.md](CLAUDE.md) | Claude Code specifics on top of AGENTS.md |
| [docs/](docs/) | Deep dives: [Assignment Intelligence](docs/assignment-intelligence/README.md), [MCP setup](docs/mcp-setup.md), [encryption keys](docs/security/encryption-keys.md) |

## Stack

- **Next.js 16** App Router (Turbopack), React 19, TypeScript, Tailwind CSS 4, shadcn-style components on `@base-ui/react`
- **Prisma 7** on **Neon Postgres** (client generated to `src/generated/prisma`)
- **Vercel**: hosting, crons (`vercel.ts`), private Blob storage, AI Gateway
- **AI SDK 7** through Vercel AI Gateway (Gemini 2.5 Flash by default; Claude Haiku/Sonnet selectable in MadMax)
- **Basecamp 4** API (leave check-ins, people and photos, to-dos), **ZeptoMail** for email
- **next-auth v5**: email + password and passkeys (WebAuthn)
- **Vitest** for tests

## Getting started

```bash
npm install          # also runs prisma generate
cp .env.example .env.local   # then fill in values (ask HR/tech lead)
npm run dev          # http://localhost:3000
npm test             # vitest
npm run lint         # eslint
npm run build        # prisma generate && next build
```

Create the first HR admin with `npx tsx prisma/seed.ts <email> [password]`.

> [!WARNING]
> **The local `.env` points at the production database.** Production, preview and local all share one Neon database. Any migration, seed, or script run with `--apply` changes live data.
> - Only add things in migrations (new tables/columns). Apply with `npx prisma migrate deploy` **before** the code that uses them ships, and regenerate the client after.
> - Drop or rename columns only after the code that stops using them is deployed.
> - Never run `prisma migrate dev` or `prisma migrate reset`.

## Scripts

Run with `npx tsx scripts/<name>.ts`. Scripts that write default to a dry run; pass `--apply` to write.

| Script | Does |
|---|---|
| `score-resumes.ts [limit]` | Backfill AI resume scores, paced for the Gateway limit; stops when credit runs out |
| `sync-basecamp-people.ts` | Link Basecamp people to employees and refresh photos (same as the daily cron) |
| `sync-basecamp-jobs.ts [--no-ai] [--full]` | Pull completed Basecamp to-dos for Assign, then classify |
| `register-leave-webhook.ts https://<origin>` | Register the Basecamp leave/WFH webhook (idempotent) |
| `encrypt-pii.ts [--apply]` | One-off backfill of personal data into encrypted columns |
| `reencrypt.ts [--apply]` | Rotate the field-encryption key |
| `import-win-rentals.ts [--apply]` | Add rented laptops from Win Technologies |
| `retag-assigned-devices.ts [--apply]` | Align device asset/stock tags with current holders |
| `compare-jev.ts [N]` | Read-only: compare the Jev leave-type model with stored types |

## Deploying

Push to `main`; Vercel builds and deploys to connect.madarth.com. Background jobs are Vercel crons declared in [`vercel.ts`](vercel.ts) (resume scoring every 15 min, Basecamp to-do counts every 30 min, leave sync, people sync, jobs sync, reminders, log cleanup) and protected by `CRON_SECRET`. See [WIKI-DETAILED.md → Crons](WIKI-DETAILED.md#crons).
