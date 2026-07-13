import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    // Daily 03:30 UTC (09:00 IST) — probation confirmations due soon.
    { path: "/api/cron/probation-reminders", schedule: "30 3 * * *" },
  ],
};
