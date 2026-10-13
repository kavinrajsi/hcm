// Status page: the services HCM depends on, in the order the page lists
// them. Keys are stored in HealthCheck.service, so don't rename them.

export const SERVICES = [
  { key: "app", name: "HCM app & sign-in", description: "connect.madarth.com" },
  { key: "database", name: "Database", description: "Neon Postgres" },
  { key: "basecamp", name: "Basecamp API", description: "3.basecampapi.com" },
  { key: "basecamp-sync", name: "Basecamp sync", description: "Chat, Quantum Sheet and Leave" },
  { key: "ai", name: "AI Gateway", description: "Resume scoring, MadMax, leave and Assign" },
  { key: "storage", name: "File storage", description: "Documents and resumes" },
  { key: "email", name: "Email", description: "ZeptoMail" },
  { key: "jobs", name: "Background jobs", description: "Scheduled syncs and reminders" },
] as const;

export type ServiceKey = (typeof SERVICES)[number]["key"];
export type CheckStatus = "ok" | "degraded" | "down";

export type CheckResult = { status: CheckStatus; latencyMs: number | null; detail: string | null };

export const CHECK_INTERVAL_MINUTES = 5;
export const HISTORY_DAYS = 90;
