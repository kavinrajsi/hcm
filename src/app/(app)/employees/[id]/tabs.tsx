import Link from "next/link";
import { cn } from "@/lib/utils";

// Employee profile: the tab bar under the cover (Zoho People style). The
// open tab lives in the URL (?tab=), so links and the back button work.

export const EMPLOYEE_TABS = [
  { key: "profile", label: "Profile" },
  { key: "leave", label: "Leave" },
  { key: "devices", label: "Devices" },
  { key: "id-card", label: "ID card" },
  { key: "login", label: "Login" },
] as const;

export type EmployeeTab = (typeof EMPLOYEE_TABS)[number]["key"];

/** The tab from ?tab=, falling back to Profile. Basecamp now sits under Login. */
export function employeeTab(value: unknown): EmployeeTab {
  if (value === "basecamp") return "login";
  return EMPLOYEE_TABS.find((tab) => tab.key === value)?.key ?? "profile";
}

export function employeeTabHref(employeeId: string, tab: EmployeeTab, extra?: Record<string, string>) {
  const params = new URLSearchParams(tab === "profile" ? {} : { tab });
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  const query = params.toString();
  return `/employees/${employeeId}${query ? `?${query}` : ""}`;
}

export function EmployeeTabs({ employeeId, active }: { employeeId: string; active: EmployeeTab }) {
  return (
    <nav
      aria-label="Employee sections"
      className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-background shadow-sm dark:border-zinc-800"
    >
      <ul className="flex min-w-max px-2">
        {EMPLOYEE_TABS.map((tab) => {
          const current = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={employeeTabHref(employeeId, tab.key)}
                scroll={false}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative block px-4 py-3.5 text-sm transition-colors md:px-5",
                  current ? "font-semibold text-foreground" : "text-zinc-500 hover:text-foreground",
                )}
              >
                {tab.label}
                {current && (
                  <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-sky-500" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
