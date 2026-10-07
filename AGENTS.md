<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Working on HCM

HCM (Madarth Connect) is Madarth's internal HR system. Read [README.md](README.md) for what it does and [WIKI-DETAILED.md](WIKI-DETAILED.md) for internals before changing a module.

## Commands

```bash
npm run dev     # next dev (Turbopack), http://localhost:3000
npm test        # vitest run (src/**/*.test.ts)
npm run lint    # eslint
npx tsc --noEmit
npm run build   # prisma generate && next build
npx prisma generate          # after schema changes
npx prisma migrate deploy    # apply migrations — this is PRODUCTION, see below
```

## Safety rules (read first)

1. **Local `.env` is the production database.** Every query, migration, seed or `--apply` script touches live data. Ask before any write you weren't asked for.
2. **Migrations are additive and go first.** Add tables/columns in a new `prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql`, run `npx prisma migrate deploy`, *then* `npx prisma generate` and write code that uses them. Generating the client before the column exists breaks every query on that model, locally and in production.
3. **Drop or rename only after deploy.** Remove a column in a later migration, once the code that stopped using it is live.
4. **Never** run `prisma migrate dev`, `prisma migrate reset` or `prisma db push`.
5. **Website-owned tables:** `candidates` and `candidate_status_changes` (models `Candidate`, `CandidateStatusChange`) are written by the madarth.com career form with raw SQL. Don't rename their columns. `Employee.candidateId` is intentionally not a foreign key.
6. **Personal data** is encrypted (`src/lib/crypto.ts`, `src/lib/employee-pii.ts`). Write through `encryptPii`, read through `readPii`. Never log decrypted values, `.env` values or tokens.
7. **Basecamp to-dos HCM creates or assigns get a `"[test] "` title prefix** until the team says otherwise.
8. **Every AI call is logged** with `recordAiUsage` (`src/lib/ai-usage.ts`) using the Gateway's cost from `gatewayCost()`. MadMax calls pass `userId` for the monthly caps (`src/lib/madmax/cap.ts`).

## Layout

```
src/app/(app)/       signed-in pages (layout.tsx is the sign-in gate)
src/app/(auth)/      login, password reset, OAuth consent
src/app/(public)/    device QR pages, MCP guide
src/app/api/         crons, webhooks, MadMax, MCP, files, Basecamp
src/app/oauth/       OAuth 2.1 server for MCP clients
src/lib/             domain logic (rbac, db, basecamp, candidates, madmax, mcp, oauth, devices, learning…)
src/components/      page scaffolding, ui kit, data-table, form, charts
prisma/              schema.prisma, migrations, seed.ts
scripts/             one-off and backfill scripts (npx tsx)
docs/                deep dives
vercel.ts            crons and project config
```

## Conventions

- **Server components by default.** Client components only where state or browser APIs are needed; client forms are named `*-form.tsx`.
- **Mutations are server actions** in a route's `actions.ts` (`"use server"`): `requireRole(...)` → zod parse → `invalid(error)` / `fieldError(name, msg)` returning `FormState` (`src/lib/form-state.ts`) → `db` → `revalidatePath`. Forms use `ValidatedForm`, `FormField`, `FormMessage` (`src/components/form/`).
- **Guards:** pages use `requirePageRole` / `requirePageSelfOrRole` / `requireUser` (`src/lib/rbac.ts`); actions use `requireRole`. Managers are scoped with `teamEmployeeWhere` (`src/lib/team-scope.ts`).
- **Navigation** lives in `src/lib/nav.ts` (sidebar, mobile tab bar, breadcrumb). An item's `roles` must mirror the page's guard; hiding a link is not access control.
- **Pages** use `PageShell` + `PageHeader`, and lists use `DesktopTable` (md and up) with `MobileList` of `ListCard`s (phones) from `src/components/page.tsx`. Each route gets a `loading.tsx` returning a skeleton from `src/components/page-skeletons.tsx`.
- **Dates:** stored and compared as ISO `YYYY-MM-DD`; shown as DD/MM/YYYY in IST via `src/lib/format-date.ts` (`formatDay`, `istDayKey`, `istDayStart`…).
- **Settings** go in `AppSetting` (key → JSON) with a named key constant, read with `findUnique`, written with `upsert` + `updatedById`.
- **AI** uses the AI SDK with Gateway model strings (`"google/gemini-2.5-flash"`), never provider packages. Model ids come from env vars with defaults (`RESUME_AI_MODEL`, `LEAVE_AI_MODEL`, `ASSIGN_AI_MODEL`).
- **MCP tools are MadMax tools.** Add a tool to `buildTools` in `src/lib/madmax/tools.ts` and to the right role list (`EVERYONE`, `MANAGER`, `HR`); add write tools to `WRITE_TOOLS` so MadMax asks for approval and MCP audits them.
- **Comments** explain *why*, briefly; each file starts with a short purpose comment. Use descriptive names, no abbreviations. Match the surrounding code's density.
- **Copy** is plain language for HR staff: no jargon, IST dates, rupees where money is shown.

## Tests

- Vitest, node environment, files `*.test.ts` next to the code.
- Tests never touch a database: `const db = vi.hoisted(() => ({ model: { method: vi.fn() } }))`, `vi.mock("@/lib/db", () => ({ db }))`, then `await import("./module")`. Mock `@/lib/rbac` and `next/cache` for actions. Use `vi.stubEnv` for env vars.
- Add or update tests with every behaviour change; run `npm test` and `npx tsc --noEmit` before committing.

## Commits

Conventional commits with a feature scope and a plain-language subject describing what users get, lowercase, no trailing period:

```
feat(staff): to-do ring on each photo, overdue in red
fix(candidates): resume scoring knows today's date
refactor(admin): Basecamp people sync moves from Employees to Admin
```

Types: `feat`, `fix`, `style`, `refactor`, `chore`, `docs`. Mention applied migrations in the body ("additive migration, already applied").
