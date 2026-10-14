# HCM Wiki — module tour

A short tour of every part of HCM (Madarth Connect): what it's for, who sees it, and what runs on its own. For internals see [WIKI-DETAILED.md](WIKI-DETAILED.md); for a list of everything see [WIKI-INDEX.md](WIKI-INDEX.md).

## Roles

Accounts are created by HR; there's no self sign-up. Sign in with email + password or a passkey.

| Role | Sees |
|---|---|
| **Employee** | Dashboard, Staff, MadMax, Connect an AI, Learning, Sessions, Profile (own details, work, leave, security). Devices they hold. |
| **Manager** | Everything an employee sees, plus their **direct reports** in Employees, Probation, Exit, Wish, Leave; Assign, Freelancers, All devices, Session attendance, course authoring, Reviews. |
| **HR admin** | Everything, for everyone. Only HR sees Candidates, employee detail/new, ID cards, device requests/vendors/labels/settings, Letters and Admin. |

The sidebar only shows what your role can open; the page itself also checks.

## Overview

### Dashboard
`/` — the home page. HR also sees recruitment charts (applications and pipeline).

### Staff
`/staff` — everyone at the company as a photo and name, open to all. Each photo has a ring of that person's open Basecamp to-dos: **red overdue**, **amber dated**, **grey no date**, with counts under the name. Click a photo for the full list (soonest due first, overdue in red), linking to Basecamp. Counts refresh every 30 minutes overnight (2–8 am IST).

### MadMax AI
`/madmax` — an AI chat assistant that knows HCM. It can look up your leave, devices, sessions and profile; managers can review their team's leave; HR can search employees and candidates, manage probation and score resumes. Anything that changes data asks you first. Chats are saved. HR sets monthly spending caps (Admin → AI usage).

### Connect an AI
`/mcp/instructions` — connect Claude, ChatGPT, Cursor or Claude Code to HCM (`https://connect.madarth.com/api/mcp`). The AI app gets the same tools as MadMax, limited to your role, and asks before changing anything. HR can see connections and every change made (Admin → MCP access). See [docs/mcp-setup.md](docs/mcp-setup.md).

## People

### Candidates
`/candidates` (HR) — applications from the madarth.com career form, as a list or a status board (New, Screening, Interview, Offer, Freelancer, Rejected). Filter by date, status, position, job role and AI score; sort by applied date, type or score; add notes; convert a hire into an employee.

**AI resume scores:** overnight (every 15 minutes, 2–8 am IST) new applications are scored 0–100 against the job role, with a one-line summary, strengths and gaps (Strong / Fair / Weak bands). HR writes what to look for per role in **Role criteria** (`/candidates/criteria`). If the AI credit runs out, resumes wait ("Waiting for AI credit") and a banner says so; HR can top up, or score them from Claude over MCP ("score the resumes waiting in HCM").

### Employees
`/employees` (HR, managers see their reports) — the employee directory and records: job details, employment type and end dates, manager, documents, previous employments, personal details (encrypted). HR adds people one at a time or by CSV import.

### Probation
`/probation` — probations coming due: confirm (becomes permanent) or extend. HR gets a weekly email of overdue confirmations and a one-week heads-up for probation, contract and internship ends.

### Exit
`/exit` — record exits and offboarding, including devices still to collect.

### ID cards
`/id-cards` (HR) — who has been issued an ID card and its status.

### Wish (birthdays and anniversaries)
`/birthdays` — a month calendar or list of birthdays (day only, never the year) and work anniversaries.

## Work

### Leave
`/leave` (HR, managers) — leave and WFH come from the Basecamp leave/WFH check-ins (live via webhook, plus a daily sync). AI classifies each post into a leave type; managers and HR approve or reject. Calendar, list and day views. Employees see their own under Profile → My leave.

### Quantum Sheet
`/quantum` (everyone) — Basecamp to-dos (from every To-dos list in a project), Card Table cards and steps from the last 12 months, laid out like Basecamp's timesheet: one block per day, completed to-dos under the day they were done, open ones under their due date ("No due date" last). HR and managers see every to-do; everyone else sees the to-dos assigned to them. **Hours** come from Basecamp's Timesheet when someone logged there; otherwise each assignee types their own hours on the to-do. Filter by project, person (HR and managers), type (to-do, card, step), status (completed, open, overdue) and date. The page reads HCM's own copy; it syncs nightly and with **Sync from Basecamp**. **Timesheet** (switch at the top) shows the hours like Basecamp's timesheet report: one table per project (date, hours, who logged it, the to-do and the entry's note) with a total per project, busiest first, using the same filters; **Download CSV** saves exactly what's shown.

### Chat
`/chat` (HR, managers) — Basecamp project chats (Campfires), laid out like WhatsApp: chats on the left, most recent first; the conversation on the right (full screen on phones). New messages show up within a few seconds; a green badge counts messages you haven't seen. To reply, connect your own Basecamp once; messages, emoji and files (up to 4 MB, via +) post under your name. Private Pings aren't available through Basecamp's API, so only project chats appear.

### Status
`/status` (public, no sign-in; HR link under Admin) — live health of HCM and the services it uses (database, Basecamp API, Basecamp sync, AI Gateway, file storage, email, background jobs), checked every 5 minutes, with 90 days of daily bars and uptime %, like status.claude.com. Shows states only, never error details.

### Assign
`/assign` (HR, managers) — Assignment Intelligence: when a new design job comes in, shows which designers handled similar jobs and how those went, from Basecamp history. Includes belief capture, comment labelling and evaluation pages. See [docs/assignment-intelligence/](docs/assignment-intelligence/README.md).

### Freelancers
`/freelancers` — the freelance resource pool (about 20,000 people), filterable, with CSV import.

## Devices

`/devices` — company laptops and other devices: who holds them, vendor, OS, purchase or rental. Each device has a QR label; scanning it opens a public page saying where to return it (never who holds it). HR manages vendors, emails purchase requests, provisions laptops for new joiners, prints labels and sets defaults. Holders and their managers can report problems.

## Learning

`/learning` — courses (PDFs, videos, YouTube/Vimeo), assigned to everyone, a department or people; progress and notes; announcements and a calendar. HR and managers write courses under **Manage courses**.

**Sessions** (`/sessions`) — training sessions, last week and upcoming; attendance tracking with import (`/sessions/attended`).

## Documents

### Letters
`/letters` (HR) — offer, internship and revised-compensation letters from editable templates; edit, email and archive.

### Reviews
`/reviews` — review meetings. **Placeholder**: fields aren't finalised yet.

## Profile

`/profile` — your own pages: details and contact info, **My work** (devices, sessions), **My leave**, and **Security** (password, passkeys, signed-in devices you can sign out, AI apps you've connected).

## Admin (HR only)

- **Users & roles** (`/users`) — give roles, disable accounts, create logins for employees who can't sign in yet.
- **Basecamp sync** (`/basecamp-sync`) — link Basecamp people to employees and refresh photos now (also runs every night at 03:30 IST).
- **AI usage** (`/ai-usage`) — what the AI features cost (USD and ₹), Gateway credit left, and **MadMax monthly caps** per person and company-wide.
- **MCP access** (`/mcp-access`) — AI apps connected to HCM and every change they made; manage the guide's screenshots.
- **Email templates** (`/email-templates`) — every email HCM sends, with a preview.
- **Email log** (`/email-log`) — sent mail and delivery status, kept for a year.

## What runs on its own

Every scheduled job runs overnight, between 2 and 8 am IST, so everything is fresh at the start of the day.

| When (IST) | What |
|---|---|
| Every 15 min, 02:00–07:45 | AI-score new resumes |
| Every 30 min, 02:00–07:30 | Count each person's open Basecamp to-dos (Staff) |
| 02:30 | Clean up the email log and old sign-in data |
| 03:00 | Sync leave/WFH check-ins from Basecamp and classify them (new posts also arrive live by webhook) |
| 03:30 | Sync Basecamp people and photos |
| 04:00 | Sync completed Basecamp jobs for Assign and classify them |
| Mondays 06:00 | Email HR overdue probation confirmations |
| 06:15 | Heads-up emails a week before probation/contract/internship ends |
