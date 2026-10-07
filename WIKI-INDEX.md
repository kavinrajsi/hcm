# HCM Wiki — index

Every module, page and integration, with links into the [overview](WIKI.md) and the [detailed reference](WIKI-DETAILED.md). Start with the [README](README.md); architecture and UI rules are in [DESIGN.md](DESIGN.md).

## Modules

| Module | Page | Who | Overview | Detail | Source |
|---|---|---|---|---|---|
| Dashboard | `/` | All | [→](WIKI.md#dashboard) | [→](WIKI-DETAILED.md#dashboard) | `src/app/(app)/page.tsx` |
| Staff | `/staff` | All | [→](WIKI.md#staff) | [→](WIKI-DETAILED.md#staff) | `src/app/(app)/staff/` |
| MadMax AI | `/madmax` | All | [→](WIKI.md#madmax-ai) | [→](WIKI-DETAILED.md#madmax-ai) | `src/lib/madmax/` |
| Connect an AI (MCP) | `/mcp/instructions` | All | [→](WIKI.md#connect-an-ai) | [→](WIKI-DETAILED.md#mcp-and-oauth) | `src/lib/mcp/`, `src/lib/oauth/` |
| Candidates | `/candidates` | HR | [→](WIKI.md#candidates) | [→](WIKI-DETAILED.md#candidates) | `src/app/(app)/candidates/`, `src/lib/candidates/` |
| Employees | `/employees` | HR, managers | [→](WIKI.md#employees) | [→](WIKI-DETAILED.md#employees) | `src/app/(app)/employees/` |
| Onboarding | `/onboarding` | HR, managers | [→](WIKI.md#onboarding) | [→](WIKI-DETAILED.md#onboarding) | `src/app/(app)/onboarding/` |
| Probation | `/probation` | HR, managers | [→](WIKI.md#probation) | [→](WIKI-DETAILED.md#probation) | `src/app/(app)/probation/` |
| Exit | `/exit` | HR, managers | [→](WIKI.md#exit) | [→](WIKI-DETAILED.md#exit) | `src/app/(app)/exit/` |
| ID cards | `/id-cards` | HR | [→](WIKI.md#id-cards) | [→](WIKI-DETAILED.md#id-cards) | `src/app/(app)/id-cards/` |
| Wish | `/birthdays` | HR, managers | [→](WIKI.md#wish-birthdays-and-anniversaries) | [→](WIKI-DETAILED.md#wish) | `src/app/(app)/birthdays/` |
| Leave | `/leave` | HR, managers | [→](WIKI.md#leave) | [→](WIKI-DETAILED.md#leave) | `src/app/(app)/leave/`, `src/lib/leave-sync.ts` |
| Quantum | `/quantum` | HR, managers | [→](WIKI.md#quantum) | [→](WIKI-DETAILED.md#quantum) | `src/app/(app)/quantum/` |
| Assign | `/assign` | HR, managers | [→](WIKI.md#assign) | [→](WIKI-DETAILED.md#assign) | `src/lib/assign/` |
| Freelancers | `/freelancers` | HR, managers | [→](WIKI.md#freelancers) | [→](WIKI-DETAILED.md#freelancers) | `src/app/(app)/freelancers/` |
| Devices | `/devices` | HR, managers, holders | [→](WIKI.md#devices) | [→](WIKI-DETAILED.md#devices) | `src/app/(app)/devices/`, `src/lib/devices/` |
| Learning | `/learning` | All (authors: HR, managers) | [→](WIKI.md#learning) | [→](WIKI-DETAILED.md#learning-and-sessions) | `src/app/(app)/learning/`, `src/lib/learning/` |
| Sessions | `/sessions` | All | [→](WIKI.md#learning) | [→](WIKI-DETAILED.md#learning-and-sessions) | `src/app/(app)/sessions/` |
| Letters | `/letters` | HR | [→](WIKI.md#letters) | [→](WIKI-DETAILED.md#letters) | `src/app/(app)/letters/` |
| Reviews (placeholder) | `/reviews` | HR, managers | [→](WIKI.md#reviews) | [→](WIKI-DETAILED.md#reviews) | `src/app/(app)/reviews/` |
| Profile | `/profile` | All (own) | [→](WIKI.md#profile) | [→](WIKI-DETAILED.md#profile) | `src/app/(app)/profile/` |

## Admin (HR)

| Page | What | Detail | Source |
|---|---|---|---|
| `/users` | Users and roles | [→](WIKI-DETAILED.md#admin) | `src/app/(app)/users/` |
| `/basecamp-sync` | Basecamp people sync | [→](WIKI-DETAILED.md#admin) | `src/app/(app)/basecamp-sync/` |
| `/ai-usage` | AI cost, credit, MadMax caps | [→](WIKI-DETAILED.md#admin) | `src/app/(app)/ai-usage/` |
| `/mcp-access` | Connected AI apps, audit | [→](WIKI-DETAILED.md#admin) | `src/app/(app)/mcp-access/` |
| `/email-templates` | Email catalogue | [→](WIKI-DETAILED.md#admin) | `src/app/(app)/email-templates/` |
| `/email-log` | Sent mail and delivery | [→](WIKI-DETAILED.md#admin) | `src/app/(app)/email-log/` |

## Cross-cutting

| Topic | Where |
|---|---|
| Roles and access | [WIKI.md → Roles](WIKI.md#roles), [WIKI-DETAILED.md → RBAC](WIKI-DETAILED.md#rbac) |
| Sign-in, passkeys, sessions | [WIKI-DETAILED.md → Auth and sessions](WIKI-DETAILED.md#auth-and-sessions) |
| Data model | [WIKI-DETAILED.md → Data model](WIKI-DETAILED.md#data-model) |
| Personal data encryption | [WIKI-DETAILED.md → Personal data encryption](WIKI-DETAILED.md#personal-data-encryption), [docs/security/encryption-keys.md](docs/security/encryption-keys.md) |
| File storage | [WIKI-DETAILED.md → Files](WIKI-DETAILED.md#files-vercel-blob-private) |
| Basecamp | [WIKI-DETAILED.md → Basecamp](WIKI-DETAILED.md#basecamp) |
| AI Gateway, costs, caps | [WIKI-DETAILED.md → AI Gateway](WIKI-DETAILED.md#ai-gateway) |
| Email | [WIKI-DETAILED.md → Email](WIKI-DETAILED.md#email) |
| Crons | [WIKI-DETAILED.md → Crons](WIKI-DETAILED.md#crons), [WIKI.md → What runs on its own](WIKI.md#what-runs-on-its-own) |
| Webhooks | [WIKI-DETAILED.md → Webhooks](WIKI-DETAILED.md#webhooks) |
| Environment variables | [WIKI-DETAILED.md → Environment variables](WIKI-DETAILED.md#environment-variables) |
| Scripts | [README.md → Scripts](README.md#scripts) |
| Migrations | [WIKI-DETAILED.md → Migrations](WIKI-DETAILED.md#migrations), [AGENTS.md → Safety rules](AGENTS.md#safety-rules-read-first) |
| Testing | [WIKI-DETAILED.md → Testing](WIKI-DETAILED.md#testing), [AGENTS.md → Tests](AGENTS.md#tests) |
| Architecture | [DESIGN.md → Part 1](DESIGN.md#part-1--architecture) |
| UI design system | [DESIGN.md → Part 2](DESIGN.md#part-2--ui-design-system) |

## Deep dives (`docs/`)

- [Assignment Intelligence](docs/assignment-intelligence/README.md) and its [proposal](docs/assignment-intelligence/proposal.md)
- [Connecting AI apps over MCP](docs/mcp-setup.md)
- [Encryption keys: backup and rotation](docs/security/encryption-keys.md)
