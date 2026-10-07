import type { VercelConfig } from "@vercel/config/v1";

// Every job runs overnight, between 02:00 and 08:00 IST (20:30–02:30 UTC),
// so syncs, AI calls and emails are done before the working day. Daily jobs
// are spaced out so the AI Gateway's per-minute limit isn't shared by two
// at once. The frequent jobs are scheduled 20:00–02:59 UTC and skip any run
// outside the window (inNightWindow in src/lib/cron-auth.ts).
export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Daily 02:30 IST (21:00 UTC) — Email log keeps one year; old sign-in data.
    { path: "/api/cron/email-log-cleanup", schedule: "0 21 * * *" },
    // Daily 03:00 IST (21:30 UTC) — pull the Basecamp leave check-in.
    { path: "/api/cron/leave-sync", schedule: "30 21 * * *" },
    // Daily 03:30 IST (22:00 UTC) — Basecamp people and profile pictures.
    { path: "/api/cron/basecamp-people", schedule: "0 22 * * *" },
    // Daily 04:00 IST (22:30 UTC) — completed Basecamp to-dos and comments
    // for Assignment Intelligence, then AI classification of what's new.
    { path: "/api/cron/basecamp-jobs", schedule: "30 22 * * *" },
    // Mondays 06:00 IST (00:30 UTC Monday) — overdue probation
    // confirmations, to hr@madarth.com (upcoming ones come in the reminder
    // below).
    { path: "/api/cron/probation-reminders", schedule: "30 0 * * 1" },
    // Daily 06:15 IST (00:45 UTC) — once, a week ahead: probation, contract
    // and internship ends, to hr@madarth.com.
    { path: "/api/cron/employment-end-reminders", schedule: "45 0 * * *" },
    // Every 15 minutes, 02:00–07:45 IST — AI resume scores for new
    // applications.
    { path: "/api/cron/score-resumes", schedule: "*/15 20-23,0-2 * * *" },
    // Every 30 minutes, 02:00–07:30 IST — each employee's open Basecamp
    // to-dos for Staff.
    { path: "/api/cron/basecamp-todo-counts", schedule: "0,30 20-23,0-2 * * *" },
  ],
};
