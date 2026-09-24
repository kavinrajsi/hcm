import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Daily 03:30 UTC (09:00 IST) — probation confirmations due soon.
    { path: "/api/cron/probation-reminders", schedule: "30 3 * * *" },
    // Daily 04:30 UTC (10:00 IST) — pull the Basecamp leave check-in.
    { path: "/api/cron/leave-sync", schedule: "30 4 * * *" },
  ],
};
