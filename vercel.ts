import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Mondays 03:30 UTC (09:00 IST) — overdue probation confirmations, to
    // hr@madarth.com (upcoming ones come in the reminder below).
    { path: "/api/cron/probation-reminders", schedule: "30 3 * * 1" },
    // Daily 03:45 UTC (09:15 IST) — once, a week ahead: probation, contract
    // and internship ends, to hr@madarth.com.
    { path: "/api/cron/employment-end-reminders", schedule: "45 3 * * *" },
    // Daily 04:00 UTC (09:30 IST) — Email log keeps one year.
    { path: "/api/cron/email-log-cleanup", schedule: "0 4 * * *" },
    // Every 15 minutes — AI resume scores for new applications.
    { path: "/api/cron/score-resumes", schedule: "*/15 * * * *" },
    // Daily 04:30 UTC (10:00 IST) — pull the Basecamp leave check-in.
    { path: "/api/cron/leave-sync", schedule: "30 4 * * *" },
    // Daily 05:00 UTC (10:30 IST) — Basecamp people and profile pictures.
    { path: "/api/cron/basecamp-people", schedule: "0 5 * * *" },
    // Daily 05:30 UTC (11:00 IST) — completed Basecamp to-dos and comments
    // for Assignment Intelligence, then AI classification of what's new.
    { path: "/api/cron/basecamp-jobs", schedule: "30 5 * * *" },
    // Every 30 minutes — each employee's open Basecamp to-dos for Staff.
    { path: "/api/cron/basecamp-todo-counts", schedule: "*/30 * * * *" },
  ],
};
