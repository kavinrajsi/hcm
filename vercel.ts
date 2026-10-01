import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Daily 03:30 UTC (09:00 IST) — probation confirmations due soon.
    { path: "/api/cron/probation-reminders", schedule: "30 3 * * *" },
    // Daily 03:45 UTC (09:15 IST) — once, a week ahead: probation, contract
    // and internship ends, to hr@madarth.com.
    { path: "/api/cron/employment-end-reminders", schedule: "45 3 * * *" },
    // Daily 04:30 UTC (10:00 IST) — pull the Basecamp leave check-in.
    { path: "/api/cron/leave-sync", schedule: "30 4 * * *" },
    // Daily 05:00 UTC (10:30 IST) — Basecamp people and profile pictures.
    { path: "/api/cron/basecamp-people", schedule: "0 5 * * *" },
    // Daily 05:30 UTC (11:00 IST) — completed Basecamp to-dos and comments
    // for Assignment Intelligence, then AI classification of what's new.
    { path: "/api/cron/basecamp-jobs", schedule: "30 5 * * *" },
  ],
};
