import type { Role } from "@/generated/prisma/enums";

// Single source for the sidebar, the mobile tab bar and the breadcrumb.
// `roles` mirrors each page's requireRole() guard; omitted = any signed-in
// user. UI filtering is convenience only — the page guard is the boundary.

export type NavItem = {
  title: string;
  url: string;
  roles?: Role[];
  /** Match only this exact URL, not pages under it. */
  exact?: boolean;
  /** Other URL prefixes that count as this page (e.g. course pages → My learning). */
  also?: string[];
};
export type NavGroup = { title: string; items: NavItem[] };

const HR: Role[] = ["HR_ADMIN"];
const HR_OR_MANAGER: Role[] = ["HR_ADMIN", "MANAGER"];

export const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", url: "/" },
      // Everyone's photo and name; any signed-in user.
      { title: "Staff", url: "/staff" },
      { title: "MadMax AI", url: "/madmax" },
      { title: "Connect an AI", url: "/mcp/instructions" },
    ],
  },
  {
    // The signed-in person's own pages; every login can open them.
    title: "Profile",
    items: [
      { title: "Overview", url: "/profile" },
      { title: "My work", url: "/profile/work" },
      { title: "My leave", url: "/profile/leave" },
      { title: "Security", url: "/profile/security" },
    ],
  },
  {
    title: "People",
    items: [
      { title: "Candidates", url: "/candidates", roles: HR },
      { title: "Employees", url: "/employees", roles: HR_OR_MANAGER },
      { title: "Onboarding", url: "/onboarding", roles: HR_OR_MANAGER },
      { title: "Probation", url: "/probation", roles: HR_OR_MANAGER },
      { title: "Exit", url: "/exit", roles: HR_OR_MANAGER },
      { title: "ID Cards", url: "/id-cards", roles: HR },
      // Birthdays & work anniversaries.
      { title: "Wish", url: "/birthdays", roles: HR_OR_MANAGER },
    ],
  },
  {
    title: "Work",
    items: [
      { title: "Leave", url: "/leave", roles: HR_OR_MANAGER },
      { title: "Quantum", url: "/quantum", roles: HR_OR_MANAGER },
      // Assignment Intelligence: who should take a design job.
      { title: "Assign", url: "/assign", roles: HR_OR_MANAGER },
      { title: "Freelancers", url: "/freelancers", roles: HR_OR_MANAGER },
    ],
  },
  {
    title: "Devices",
    items: [
      { title: "All devices", url: "/devices", roles: HR_OR_MANAGER },
      { title: "Requests", url: "/devices/requests", roles: HR },
      { title: "Vendors", url: "/devices/vendors", roles: HR },
      { title: "Print labels", url: "/devices/labels", roles: HR },
      { title: "Settings", url: "/devices/settings", roles: HR },
    ],
  },
  {
    title: "Learning",
    items: [
      { title: "Dashboard", url: "/learning", exact: true },
      { title: "My learning", url: "/learning/my", also: ["/learning/courses"] },
      { title: "Announcements", url: "/learning/announcements" },
      { title: "Calendar", url: "/learning/calendar" },
      { title: "Sessions", url: "/sessions" },
      {
        title: "Session Attendance",
        url: "/sessions/attended",
        roles: HR_OR_MANAGER,
      },
      // Course authoring (HR admins and managers).
      { title: "Manage courses", url: "/learning/manage", roles: HR_OR_MANAGER },
    ],
  },
  {
    title: "Documents",
    items: [
      { title: "Letters", url: "/letters", roles: HR },
      { title: "Reviews", url: "/reviews", roles: HR_OR_MANAGER },
    ],
  },
  {
    title: "Admin",
    items: [
      { title: "Users & roles", url: "/users", roles: HR },
      { title: "AI usage", url: "/ai-usage", roles: HR },
      { title: "MCP access", url: "/mcp-access", roles: HR },
      { title: "Email templates", url: "/email-templates", roles: HR },
      { title: "Email log", url: "/email-log", roles: HR },
    ],
  },
];

export function canSee(item: NavItem, role: Role): boolean {
  return !item.roles || item.roles.includes(role);
}

/** Nav groups with only the pages this role can open; empty groups dropped. */
export function navFor(role: Role): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSee(item, role)),
  })).filter((group) => group.items.length > 0);
}

/** Longest URL match first so /sessions/attended beats /sessions. */
export function findCurrent(pathname: string) {
  const candidates = NAV.flatMap((group) =>
    group.items.flatMap((item) =>
      [item.url, ...(item.also ?? [])].map((prefix) => ({ group: group.title, item, prefix })),
    ),
  );
  const match = candidates
    .sort((left, right) => right.prefix.length - left.prefix.length)
    .find(({ item, prefix }) =>
      prefix === "/" || item.exact ? pathname === prefix : pathname.startsWith(prefix),
    );
  return match && { group: match.group, item: match.item };
}

/** Mobile bottom-bar tabs (plus a trailing "More"), per role. */
export const TABS: Record<Role, string[]> = {
  HR_ADMIN: ["/candidates", "/employees", "/leave", "/onboarding"],
  MANAGER: ["/", "/employees", "/leave", "/onboarding"],
  EMPLOYEE: ["/", "/profile", "/sessions"],
};
