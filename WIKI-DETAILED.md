# HCM Wiki — detailed reference

Internals for developers: routes, guards, models, background jobs, integrations and operations. The module tour is in [WIKI.md](WIKI.md); the index is [WIKI-INDEX.md](WIKI-INDEX.md); architecture and UI rules are in [DESIGN.md](DESIGN.md).

Guard shorthand: **U** = `requireUser` (any signed-in user), **HR** = `requirePageRole("HR_ADMIN")`, **HR+M** = `requirePageRole("HR_ADMIN", "MANAGER")`. Managers are scoped to direct reports by `teamEmployeeWhere` (`src/lib/team-scope.ts`).

---

## Auth and sessions

- **next-auth v5**, JWT sessions (`src/lib/auth.ts`). Two Credentials providers:
  - **Email + password** — bcrypt; throttled per account and per IP (`src/lib/auth-throttle.ts`, `AuthAttempt`).
  - **Passkey** — WebAuthn via SimpleWebAuthn (`src/lib/passkeys.ts`, `Passkey`, `WebAuthnChallenge`); relying party derived from `AUTH_URL`.
  - There is **no Google provider** (`User.googleId` is unused).
- **Accounts** are provisioned by HR (`/users`, `src/lib/logins.ts`); invites and resets use one-time hashed links (`PasswordResetToken`, `src/lib/password-links.ts`).
- **Login sessions:** each signed-in device has a `LoginSession` whose id rides in the JWT. `currentUser()` rejects revoked sessions, sessions idle for 30 days and disabled users on every request (`src/lib/login-sessions.ts`), so role changes apply immediately. Users sign out devices under Profile → Security.
- **Sign-in gate:** `src/app/(app)/layout.tsx` sends signed-out users to `/login`. There is no middleware/proxy.

## RBAC

`src/lib/rbac.ts`:

| Helper | Use |
|---|---|
| `currentUser()` | Cached per request; null when signed out, disabled or session revoked |
| `requireUser()` | Redirects to `/login` |
| `requireRole(...roles)` | Throws `AuthorizationError` — server actions and API routes |
| `requirePageRole(...roles)` | Renders the 403 page (`src/app/forbidden.tsx`) — pages |
| `requireSelfOrRole` / `requirePageSelfOrRole` | The employee themself, or the listed roles |

Other scopes: devices (`src/lib/devices/access.ts`: HR manage; holder and holder's manager act), learning authors (`src/lib/learning/access.ts`: HR and managers). Navigation filtering (`src/lib/nav.ts`, `navFor(role)`) is convenience only.

## Data model

`prisma/schema.prisma`; client generated to `src/generated/prisma`; connection in `src/lib/db.ts` (Neon serverless adapter when the URL is Neon, `pg` otherwise); migrations config in `prisma.config.ts` (uses `DATABASE_URL_UNPOOLED` when set).

| Domain | Models |
|---|---|
| Identity | `User` (role, optional `passwordHash`, `disabledAt`), `PasswordResetToken`, `AuthAttempt`, `Passkey`, `WebAuthnChallenge`, `LoginSession` |
| Core HR | `Employee` (self-relation manager/reports; Basecamp link `basecampPersonId`, `avatarBlobKey`, `openTodosDated/Undated/Overdue/SyncedAt`; encrypted PII; blind indexes; document blob keys), `OnboardingRecord`, `IdCard` + `IdCardStatusChange`, `ProbationRecord`, `EmploymentReminder`, `Letter` + `LetterTemplate`, `PreviousEmployment`, `ReviewMeeting` (stub), `Freelancer` |
| Training | `TrainingSession`, `SessionRegistration`, `SessionAttendance` |
| Leave | `LeaveEntry` (Basecamp answer, AI or manual classification, reviewer) |
| Recruitment | `Candidate` → table `candidates`, `CandidateStatusChange` → `candidate_status_changes` (**owned by the website**, snake_case, don't rename), `CandidateScore` (1:1 AI score), `RoleCriteria` |
| Dashboard | `Dashboard`, `DashboardWidget`, `DashboardShare`, `DashboardCatalogWidget` |
| Quantum Sheet | `QuantumTodo`, `QuantumHours` |
| Chat | `BasecampChat`, `BasecampChatLine`, `BasecampChatRead` |
| Assign | `Job`, `JobAssignee`, `JobComment`, `CommentLabel`, `DesignerBelief`, `AssignmentQuery` |
| Devices | `Device` (QR `publicToken`, asset/stock tags, holder), `DeviceAssignment`, `DeviceTicket` + `DeviceTicketEvent`, `Vendor` + `VendorContact`, `DevicePurchaseRequest` |
| AI | `AiUsage` (feature, trigger, model, tokens, `costUsd`, `userId`), `ChatThread`, `ChatMessage` |
| MCP / OAuth | `OAuthClient`, `OAuthCode`, `OAuthToken`, `McpAuditLog` |
| Email / settings | `EmailLog`, `AppSetting` (key → JSON), `BasecampToken` |
| Learning | `Course`, `CourseSection`, `Lesson`, `CourseFaq`, `CourseAssignment`, `CourseEnrollment`, `LessonProgress`, `LiveClass`, `Announcement`, `AnnouncementRead` |

### Personal data encryption

AES-256-GCM in `src/lib/crypto.ts`; values look like `k<keyId>:iv:tag:ct`. Encrypted: PAN, Aadhaar, bank account, IFSC, and the fields in `src/lib/employee-pii.ts` (phone, personal email, emergency contact, address, date of birth, PF, UAN) as `*Enc` columns, plus Basecamp OAuth tokens. Duplicate checks use HMAC blind indexes (`panHash`, `aadhaarHash`, `bankAccountHash`). Write with `encryptPii`, read with `readPii`. Keys, backup and rotation: [docs/security/encryption-keys.md](docs/security/encryption-keys.md); scripts `encrypt-pii.ts`, `reencrypt.ts`.

### Files (Vercel Blob, private)

`src/lib/blob.ts`. Employee documents and avatars (`avatars/`) use the default store; resumes live in a separate store shared with the website (`RESUMES_READ_WRITE_TOKEN`). Reads go through access-checked routes: `/api/files/[...path]` (HR any file, others their own; avatars any signed-in user) and `/api/learning/files/[...path]` (ranged, for the 4.5 MB response limit). Course uploads go straight from the browser with tokens from `/api/learning/upload`.

---

## Modules

### Dashboard
`/` (U). Page `src/app/(app)/page.tsx`, UI and actions in `src/app/(app)/_dashboard/`, engine in `src/lib/dashboard/`. Models `Dashboard` (owner user, or `role` with no owner = HR's default for that role), `DashboardWidget` (`builtinKey` or `spec` JSON, `width` of 4 columns × `height` rows, `position`), `DashboardShare` (read-only, unique per dashboard + user), `DashboardCatalogWidget` (HR-published specs).
- **Copy-on-write** (`store.ts`): no rows until the first change; until then a user sees their role's default rows, else `builtInDashboards(role)` (catalogue `DEFAULT_LAYOUT` = the original 7 tiles + recruitment trend/pipeline/table, filtered by role). **Customise** (`startEditing`) copies what they see; **Reset** deletes their rows. HR edits role defaults at `/?defaults=ROLE&edit=1` (same flow on role rows). `editableDashboard`: owner, or HR on a role default; shared dashboards are never editable.
- **Specs** (`spec.ts`, zod): `source`, `measure`, `dateField`, `groupBy` (field or `time:day|week|month|quarter`), `filters` (field → values), `range` (preset or custom IST days), `chart` (number/bar/line/pie/table), `compare`, `limit`. Re-validated on every run (`runWidget`), then `cleanSpec` drops unknown fields and disallowed values.
- **Sources** (`sources.ts`): employees, leave, candidates, quantumHours, quantumTodos, sessions, devices, probation, idCards, freelancers. Each has roles, measures, date fields, fields (fixed labels or scoped `options`), a page for click-through (`param` per field, checked with `canOpen`) and `load`/`count` with the **viewer's** scope (HR all; managers `manager.userId`; employees own `employeeId` / `basecampPersonId`; Quantum team view for HR and managers). Only typed Prisma `in`/`equals` conditions; no raw SQL; no PII fields. Quantum hours drop HCM entries on to-dos with Basecamp hours (as the Hours column). Candidates exclude honeypot and `localhost` sources.
- **Aggregation** (`aggregate.ts`, `time.ts`): IST day buckets with empty periods filled; field groups biggest first, rest folded into "Other"; `previousRange` for "vs the period before" (whole months for month presets). The dashboard `?range=` override skips widgets whose own range is all / today / to-month-end / upcoming / next-30-days.
- **Built-ins** (`builtins.ts`): recruitment trend, pipeline and table (`getRecruitmentStats`, loaded once) and celebrations (next 30 days, current staff, manager's team; birthdays show day and month only).
- Grid: `@dnd-kit/sortable` (pointer, 250 ms long-press touch, keyboard), sizes small/wide/tall/medium/full width/full width tall; 4 / 2 / 1 columns. `AutoRefresh` calls `router.refresh()` every 5 minutes only while the tab is visible (a hidden tab never keeps the session alive), paused while editing.

### Staff
`/staff` (U). `src/app/(app)/staff/` — grid of current employees (`dateOfExit: null`), `TodoRing` (`todo-ring.tsx`), bottom sheet of open to-dos (`person-todos.tsx`, server action `loadOpenTodos` fetching live through `openTodosFor`). Counts: `src/lib/basecamp-todo-counts.ts` → `syncOpenTodoCounts()` reads Basecamp's `/reports/todos/assigned/{personId}.json` for each linked employee (3 at a time) and stores dated / undated / overdue (due before today in IST). Cron `/api/cron/basecamp-todo-counts` every 30 min overnight (02:00–08:00 IST). Sheet visible to everyone (titles from any project the HR connection sees).

### MadMax AI
`/madmax`, `/madmax/[threadId]` (U). Route `src/app/api/madmax/route.ts`: streams `streamText` through the AI Gateway; history from `src/lib/madmax/store.ts`; models in `src/lib/madmax/models.ts` (Gemini 2.5 Flash default; Claude options need paid credit); system prompt `prompt.ts`; tools `tools.ts` with role lists `EVERYONE` / `MANAGER` / `HR`; write tools (`WRITE_TOOLS`) need approval, signed with an HMAC of `AUTH_SECRET`; max 8 steps. **Caps:** `src/lib/madmax/cap.ts` — monthly per-person and company caps in ₹ (`AppSetting` key `madmax-cap`), checked before each request (429 with a plain message); spend from `AiUsage` (feature `madmax`) at `USD_INR_RATE` (default 88).

### MCP and OAuth
- **Endpoint** `/api/mcp` (`src/app/api/mcp/route.ts`, `mcp-handler`): bearer token required; 401 points at `/.well-known/oauth-protected-resource/api/mcp`.
- **Tools** `src/lib/mcp/server.ts` → `registerHcmTools` registers MadMax's `buildTools` for the token's user (re-checked every request), annotates read/write, audits writes in `McpAuditLog`.
- **OAuth 2.1 server** `src/lib/oauth/` + `src/app/oauth/{register,token,revoke}` + consent page `src/app/(auth)/oauth/authorize/` + `src/app/.well-known/*`: dynamic client registration and client-ID metadata documents, PKCE S256, 1-hour access tokens, 30-day rotating refresh tokens, scope `hcm`. Connections listed and revoked in `src/lib/mcp/connections.ts`.
- **Guide** `/mcp/instructions` (`src/app/(public)/mcp/instructions/page.tsx`), screenshots managed in `/mcp-access` (`src/lib/mcp-guide*.ts`).
- Claude caches a connector's tool list; after adding tools, users must reconnect HCM or start a new chat.

### Candidates
`/candidates`, `/candidates/criteria` (HR). `src/app/(app)/candidates/` — `page.tsx` (list/board, filters via `query.ts`, score filter and sort), `candidate-dialog.tsx`, `score-section.tsx`, `score-badge.tsx`, `criteria/`. Applications arrive from the website's `/api/career` (raw SQL into `candidates`); resumes are PDFs in the resumes blob store.

**Resume scoring** (`src/lib/candidates/score.ts`):
- `scoreCandidate` sends the PDF plus role, position and `RoleCriteria` to `RESUME_AI_MODEL` (default `google/gemini-2.5-flash`) with structured output `{score, summary, strengths, gaps}`; prompt includes today's IST date.
- Outcomes `SCORED`, `NO_RESUME` (missing or non-PDF), `FAILED` (retried up to `MAX_ATTEMPTS` = 3), `RATE_LIMITED` and `NO_CREDIT` (neither uses an attempt; the run stops).
- Credit-out parks scores as `FAILED` with error "Waiting for AI credit…" (`waitingForCreditWhere`); the cron retries them whatever their attempts once credit is back. The Candidates page shows a banner with the count.
- Cron `/api/cron/score-resumes` every 15 min overnight (02:00–08:00 IST), up to 12 a run, 15 s apart (Gateway limit ~5/min); backfill `scripts/score-resumes.ts`.
- **MCP fallback** (`src/lib/candidates/mcp-scoring.ts`, HR tools `listResumesToScore`, `getResumeForScoring`, `saveResumeScore`): Claude reads resume text extracted with pdf.js (`src/lib/candidates/resume-text.ts`; `pdfjs-dist` is in `serverExternalPackages`) plus the same brief (`scoringInstructions`), and saves with model `"mcp"`.
- Bands in `src/lib/candidates/score-bands.ts`.

### Employees
`/employees` (HR+M), `/employees/new` and `/employees/[id]` (HR). `src/app/(app)/employees/` — `actions.ts`, `employee-form.tsx`, CSV import (`src/lib/csv-import.ts`, `src/lib/import-columns.ts`), employment type/end logic (`type-end.ts`, `src/lib/emp-type.ts`), previous employments, documents (`src/lib/employee-documents.ts`). Converting a candidate creates an employee with `candidateId`.

### Onboarding
The `/onboarding` page was removed (14/10/2026); `OnboardingRecord` data stays and is still written when HR adds a joiner. Joiners this month: Employees filtered by join date (Dashboard tile).

### Probation
`/probation` (HR+M). `src/app/(app)/probation/`. Crons: `/api/cron/probation-reminders` (Mondays, overdue digest to HR) and `/api/cron/employment-end-reminders` (daily, once per end via `EmploymentReminder`, `?dryRun=1`). Emails in `src/lib/employment-emails.ts`.

### Exit
`/exit` (HR+M). `src/app/(app)/exit/` — marks `dateOfExit`, exit-clearance email, devices to collect.

### ID cards
`/id-cards` (HR). `src/app/(app)/id-cards/`, statuses in `src/lib/id-card-status.ts`.

### Wish
`/birthdays` (HR+M). `src/app/(app)/birthdays/page.tsx`, `src/lib/celebrations.ts`; date of birth is PII (decrypted for display, year never shown).

### Leave
`/leave` (HR+M), `/profile/leave` (U). Basecamp leave and WFH check-in answers → `LeaveEntry`:
- Live: webhook `/api/basecamp/webhook?token=BASECAMP_WEBHOOK_SECRET` (Basecamp doesn't sign; the answer is re-fetched, never trusted). Register with `scripts/register-leave-webhook.ts`.
- Daily: `/api/cron/leave-sync` (`src/lib/leave-sync.ts`) — full history first run, then 14-day re-read.
- Classification: `src/lib/leave-classify.ts` (`LEAVE_AI_MODEL`, default `google/gemini-2.5-flash-lite`); optional second opinion `src/lib/leave-type-jev.ts` (`LEAVE_TYPE_MODEL`, `off` disables).
- Config: `BASECAMP_LEAVE_ACCOUNT_ID`, `BASECAMP_LEAVE_BUCKET_ID`, `BASECAMP_LEAVE_QUESTION_ID`, `BASECAMP_WFH_QUESTION_ID`.

### Quantum Sheet
`/quantum` (U; HR+M see all, others only to-dos whose `assigneeIds` has their `basecampPersonId`). Hours: `QuantumHours` — Basecamp Timesheet entries on to-dos (`source` basecamp, one `/reports/timesheet.json` call for 12 months per sync, deleted entries dropped) and per-person HCM totals (`source` hcm, unique per to-do + employee, `logQuantumHours`, own assigned to-dos only, refused when Basecamp hours exist). Basecamp hours win over HCM hours per to-do (`effectiveMinutes`). Model `QuantumTodo`: filter columns (`projectId`, `completed`, `dueOn`, `sheetDay`, `assigneeIds` with a GIN index) plus `data` (trimmed Basecamp payload as JSON). Sync `src/lib/quantum/sync.ts` pages `/projects/recordings.json` for `Todo` (covers every todoset), `Kanban::Card` and `Kanban::Step` (`QuantumTodo.kind`), each for active, archived and trashed, newest change first, stopping at the last finished sync (`AppSetting` `quantum.sync`, 10-minute overlap, never older than 12 months); completing or trashing a to-do bumps `updated_at`, so status flips come through. Cron `/api/cron/quantum-sync` daily 04:45 IST; the page's Sync button runs the same incremental sync and refuses the first full load (a one-off `syncQuantumTodos({ full: true })`, ~320 Basecamp calls). Uses the HR admin's Basecamp connection (`leaveSyncUserId`). Assignees show the HCM name and photo when `Employee.basecampPersonId` matches. Timesheet view (`?view=timesheet`, `src/lib/quantum/timesheet.ts`): `QuantumHours` rows (the sync also stores each Basecamp entry's `personId` and `note`, trimmed to 2,000 chars) grouped by project, same no-double-count rule as the Hours column; date filter = entry date, person filter = who logged it; non-HR/manager viewers see only their own entries. CSV `/api/quantum/timesheet` (same filters and scope, UTF-8 BOM).

### Chat
`/chat`, `/chat/[chatId]` (HR+M). Models `BasecampChat`, `BasecampChatLine`, `BasecampChatRead` (per person and chat: `lastReadAt`; `unreadCounts`/`markChatRead` in `src/lib/chat/reads.ts` — a first visit marks everything read; opening a chat and each poll mark it read; the list re-renders every 30 s). Files: `POST /api/chat/[id]/uploads` (≤ 4 MB for Vercel's body limit) → `sendChatUpload` posts to Basecamp's `/chats/:id/uploads.json` with the sender's token. Emoji picker uses a built-in set (`src/lib/chat/emoji.ts`), recent row in localStorage. Look: `--chat-*` tokens in `globals.css` (HTML sanitized on write by `sanitizeChatHtml`, `src/lib/chat/lines.ts`). **Basecamp has no webhooks for chat** (not a webhook type) and a chat's `updated_at` doesn't change on new lines, so it's polled: `syncAllChats` (`src/lib/chat/sync.ts`) reads `/chats.json` then each chat's newest lines until a stored one (cron `/api/cron/chat-sync` every 5 minutes, all day, ~45 calls); the open chat polls `GET /api/chat/[id]/lines?after=` every 5 s while visible, and `refreshChatIfStale` lets one request per 5 s (a conditional `updateMany` claim on `lastCheckedAt`) call Basecamp for everyone. Reads use the HR connection; `POST /api/chat/[id]/lines` sends with the sender's own `BasecampToken` (managers may now connect via `/api/basecamp/connect?returnTo=/chat/…`; background syncs still use only HR tokens via `leaveSyncUserId`).

### Status
`/status` (public). Cron `/api/cron/health` every 5 min runs `runAllChecks` (`src/lib/status/checks.ts`; 8 s timeout each, no email or AI spend): app (`AUTH_URL/login`), DB `SELECT 1`, Basecamp `/my/profile.json` via the HR connection, AI `gateway.getCredits()` + failed `AiUsage` share, Blob `list({limit:1})`, email from `EmailLog` (24 h), jobs from `CronRun`, Basecamp sync freshness (chat-sync, quantum-sync). Rows in `HealthCheck` (95 days kept; `detail` is internal only). Every other cron route is wrapped in `withCronRun` (`src/lib/status/cron-runs.ts`), which writes `CronRun` (skips unauthorised and "skipped" runs; never fails the job). Page data: `statusPageData` groups by IST day in SQL; AI and Email days before checks began come from `AiUsage`/`EmailLog`. Colours: green ok, yellow degraded, orange < 1 h down, red ≥ 1 h, grey no data; uptime = average daily uptime.

### Assign
`/assign`, `/assign/beliefs`, `/assign/eval`, `/assign/labels` (HR+M). `src/lib/assign/` — `jobs-sync.ts` (incremental pull of completed to-dos and comments), `classify.ts` (`ASSIGN_AI_MODEL`, few-shot from coordinator labels), `suggest.ts` (counting, no model), `eval.ts`, `floor-manager.ts`, `todo.ts` (creates `[test]` to-dos for picks). Cron `/api/cron/basecamp-jobs` daily; manual `/api/basecamp/jobs-sync` (NDJSON stream); script `sync-basecamp-jobs.ts`. Full write-up: [docs/assignment-intelligence/README.md](docs/assignment-intelligence/README.md).

### Freelancers
`/freelancers` (HR+M). `src/app/(app)/freelancers/`, model `Freelancer` (indexed, paginated, CSV import).

### Devices
`/devices/**` (HR+M list; detail by `deviceAccess`; HR for new/provision/requests/vendors/labels/settings). `src/lib/devices/` (`access`, `devices`, `vendors`, `purchase`, `win-rentals`, `os`, `os-settings`, `qr`, `public-view`). Public QR page `src/app/(public)/d/[token]/page.tsx` (`DEVICE_CONTACT_EMAIL`), QR PNG `/api/devices/[id]/qr`. Purchase requests are emailed to vendors (`DevicePurchaseRequest`). Scripts `import-win-rentals.ts`, `retag-assigned-devices.ts`.

### Learning and Sessions
`/learning/**` (U; `/learning/manage/**` for authors), `/sessions` (U), `/sessions/attended` (HR+M). `src/lib/learning/` (`access`, `catalog`, `progress`, `notes`, `embeds`, `files`, `announcements`); PDF viewer `src/app/(app)/learning/_components/pdf-viewer.tsx`. Assignment rules: all, department or user (`CourseAssignment`).

### Letters
`/letters` (HR). Templates `src/lib/letter-templates.ts` (defaults) with HR overrides in `LetterTemplate`; email HTML `src/lib/letter-email-html.ts`.

### Reviews
`/reviews` (HR+M). Placeholder; `ReviewMeeting` is a stub.

### Profile
`/profile`, `/profile/work`, `/profile/leave`, `/profile/security` (U). `src/app/(app)/profile/` — own employee via `src/lib/my-employee.ts`; contact edit (encrypted); security lists passkeys, login sessions and connected AI apps (revocable).

### Admin
All HR.
- `/users` — roles, disable, bulk logins (`src/lib/logins.ts`).
- `/basecamp-sync` — people sync button (`people-sync-button.tsx` → `/api/basecamp/people-sync`, NDJSON stream; `src/lib/basecamp-people.ts`).
- `/ai-usage` — `src/lib/ai-usage.ts` (`aiUsageSummary`, ranges in IST), Gateway credit via `gateway.getCredits()`, MadMax cap form (`cap-form.tsx`, `actions.ts`).
- `/mcp-access` — connections and audit log.
- `/email-templates`, `/email-log` — `src/lib/email-catalog.ts`, `src/lib/email-log.ts`.

---

## Integrations

### Basecamp
`src/lib/basecamp.ts`. HR admins connect via OAuth (`/api/basecamp/connect` → `/api/basecamp/callback`, CSRF state in `src/lib/basecamp-oauth-state.ts`); tokens stored encrypted in `BasecampToken` and refreshed automatically. **Background jobs use the most recently connected active HR admin** (`leaveSyncUserId()` in `src/lib/leave-sync.ts`). People are matched to employees by work email, then personal email (`src/lib/basecamp-people.ts`). Paginated calls follow `Link` headers and back off on 429 (`fetchAllPages`).

### AI Gateway
All AI goes through the AI SDK with Gateway model strings; auth via `AI_GATEWAY_API_KEY` or Vercel OIDC. Every call is logged in `AiUsage` (`recordAiUsage`, cost from `gatewayCost(providerMetadata)`). Features: `madmax`, `resume-score`, `leave-classify`, `leave-type-jev`, `assign-kind`, `assign-comments`. **One credit balance serves all of them**; when it's empty they fail (resume scoring parks and falls back to MCP). Free-tier rate limit ~5 requests/min for Google models — callers pace themselves.

### Email
ZeptoMail's HTTP API by default, or any SMTP server such as a Zoho Mail mailbox (`smtppro.zoho.com:465`, SSL, authenticated; nodemailer); HR picks one on Admin → Email templates (`AppSetting` `emailTransport`, `{ transport: "zeptomail" | "smtp" }`), all in `src/lib/email.ts`. SMTP details are entered on the same page and stored in `AppSetting` `emailSmtp` (`host`, `port`, `username`, `passwordEncrypted` via `encryptField`, `fromAddress`, `fromName`); the password is never sent to the browser. SMTP mail always goes from `fromAddress` (Zoho rejects others) with the email's own display name. Each email can override the default on the Email templates list: `AppSetting` `emailRouting` maps catalog keys (`email-catalog.ts`) to `"zeptomail" | "smtp" | "off"` (missing = default). Letters share `kind: "letter"`, so `sendEmail` takes `template` (`letter-offer`…) as the route key; resends from the Email log only know the kind, so resent letters use the default. "off" logs the email as not sent and delivers nothing; the cron reminders don't record anything while off, so turning "Ending within a week" back on catches up within its 7-day window. If the chosen service isn't set up, mail is logged as not sent. Opens and bounces are only tracked for ZeptoMail. Every email ends with the signature from Email templates (`AppSetting` `emailSignature`; `src/lib/email-signature.ts`): `renderEmail` leaves `SIGNATURE_SLOT` and `sendEmail` fills it, so the log keeps the signed copy and resends aren't signed twice. The logo is `public/email/madarth-logo.png`, or HR's upload in private Blob served publicly by `/api/email-logo`. Letter templates have no sign-off; a trailing "Regards, HR Team" is dropped. `EmailLog.provider` records which service sent each row (null on older rows = ZeptoMail). Templates in `src/lib/emails.ts`, `employment-emails.ts`, `letter-email-html.ts`, layout `email-template.ts`, catalogue `email-catalog.ts`. Every send is in `EmailLog` (links redacted, kept 1 year); delivery events arrive at `/api/webhooks/zeptomail` (HMAC `producer-signature` or `?key=`, `ZEPTOMAIL_WEBHOOK_SECRET`).

---

## Crons

Declared in `vercel.ts`; every route checks `Authorization: Bearer $CRON_SECRET` (`src/lib/cron-auth.ts`) and fails closed without it.

All jobs run overnight, **02:00–08:00 IST** (20:30–02:30 UTC). The two frequent jobs are scheduled 20:00–02:59 UTC and skip runs outside the window (`inNightWindow` in `src/lib/cron-auth.ts`). Daily jobs are spaced so they don't share the AI Gateway's per-minute limit.

| Route | UTC | IST | Does |
|---|---|---|---|
| `/api/cron/score-resumes` | `*/15 20-23,0-2 * * *` | every 15 min, 02:00–07:45 | AI-score new/retryable/parked resumes (up to 12 a run) |
| `/api/cron/basecamp-todo-counts` | `0,30 20-23,0-2 * * *` | every 30 min, 02:00–07:30 | Open to-do counts for Staff |
| `/api/cron/email-log-cleanup` | `0 21 * * *` | 02:30 | Prune email log (1 yr), auth attempts, challenges, old sessions |
| `/api/cron/leave-sync` | `30 21 * * *` | 03:00 | Basecamp leave/WFH sync + classification |
| `/api/cron/basecamp-people` | `0 22 * * *` | 03:30 | People link + avatars |
| `/api/cron/basecamp-jobs` | `30 22 * * *` | 04:00 | Completed jobs + comments for Assign, then classify |
| `/api/cron/probation-reminders` | `30 0 * * 1` | Mon 06:00 | Overdue probation digest to HR |
| `/api/cron/employment-end-reminders` | `45 0 * * *` | 06:15 | One-week notice of probation/contract/internship ends |

## Webhooks

| Route | Auth |
|---|---|
| `/api/basecamp/webhook` | `?token=BASECAMP_WEBHOOK_SECRET` (constant-time); payload re-fetched |
| `/api/webhooks/zeptomail` | HMAC `producer-signature` or `?key=` with `ZEPTOMAIL_WEBHOOK_SECRET` |

## Environment variables

Names and purpose only; values live in Vercel and `.env.local` (template `.env.example`).

| Group | Variables |
|---|---|
| Database | `DATABASE_URL` (runtime), `DATABASE_URL_UNPOOLED` (migrations) |
| Auth | `AUTH_SECRET` (sessions, MadMax approval HMAC), `AUTH_URL` (public origin: OAuth issuer, MCP resource, passkey RP, email links) |
| Encryption | `FIELD_ENCRYPTION_KEY`, `FIELD_ENCRYPTION_KEY_ID`, `FIELD_ENCRYPTION_OLD_KEYS`, `BLIND_INDEX_KEY` |
| Basecamp | `BASECAMP_CLIENT_ID`, `BASECAMP_CLIENT_SECRET`, `BASECAMP_WEBHOOK_SECRET`, `BASECAMP_LEAVE_ACCOUNT_ID`, `BASECAMP_LEAVE_BUCKET_ID`, `BASECAMP_LEAVE_QUESTION_ID`, `BASECAMP_WFH_QUESTION_ID`, `BASECAMP_GENERAL_PROJECT_ID` |
| AI | `AI_GATEWAY_API_KEY` (or Vercel OIDC), `RESUME_AI_MODEL`, `LEAVE_AI_MODEL`, `LEAVE_TYPE_MODEL`, `ASSIGN_AI_MODEL`, `USD_INR_RATE` |
| Email | `ZEPTOMAIL_TOKEN`, `ZEPTOMAIL_API_URL`, `ZEPTOMAIL_WEBHOOK_SECRET`, `EMAIL_FROM`, `HR_EMAIL`, `FINANCE_EMAIL`, `DEVICE_CONTACT_EMAIL` |
| Storage | `BLOB_READ_WRITE_TOKEN`, `RESUMES_READ_WRITE_TOKEN` |
| Platform | `CRON_SECRET`, `VERCEL_PROJECT_PRODUCTION_URL` (fallback origin) |

## Scripts

`npx tsx scripts/<name>.ts` (import `scripts/load-env.ts` first in new scripts). Listed in [README.md → Scripts](README.md#scripts). Seed the first HR admin with `npx tsx prisma/seed.ts <email> [password]`.

## Migrations

- `prisma/migrations/YYYYMMDDHHMMSS_snake_name/migration.sql`, hand-named, usually commented "Additive only".
- Applied manually with `npx prisma migrate deploy` (the build only runs `prisma generate`). **Local, preview and production share one database.**
- Order: write SQL → `migrate deploy` → `prisma generate` → code. Drops/renames only after the code that stopped using them is deployed.

## Testing

Vitest (`vitest.config.ts`: node env, `@` → `src`, `src/**/*.test.ts`), ~106 files beside the code. DB is always mocked (`vi.hoisted` + `vi.mock("@/lib/db")`); see [AGENTS.md → Tests](AGENTS.md#tests).
