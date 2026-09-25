import type { Role } from "@/generated/prisma/enums";

// Single source for the sidebar, the mobile tab bar and the breadcrumb.
// `roles` mirrors each page's requireRole() guard; omitted = any signed-in
// user. UI filtering is convenience only — the page guard is the boundary.

export type NavItem = { title: string; url: string; roles?: Role[] };
export type NavGroup = { title: string; items: NavItem[] };

const HR: Role[] = ["HR_ADMIN"];
const HR_OR_MANAGER: Role[] = ["HR_ADMIN", "MANAGER"];

export const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", url: "/" },
      { title: "Me", url: "/me" },
      { title: "Profile", url: "/profile" },
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
      { title: "Leave", url: "/leave", roles: HR_OR_MANAGER },
    ],
  },
  {
    title: "Work",
    items: [
      { title: "Quantum", url: "/quantum", roles: HR_OR_MANAGER },
      { title: "Sessions", url: "/sessions" },
      {
        title: "Session Attendance",
        url: "/sessions/attended",
        roles: HR_OR_MANAGER,
      },
      { title: "Freelancers", url: "/freelancers", roles: HR_OR_MANAGER },
    ],
  },
  {
    title: "Documents",
    items: [
      { title: "Letters", url: "/letters", roles: HR },
      { title: "Reviews", url: "/reviews", roles: HR_OR_MANAGER },
    ],
  },
];

export function canSee(item: NavItem, role: Role): boolean {
  return !item.roles || item.roles.includes(role);
}

/** Nav groups with only the pages this role can open; empty groups dropped. */
export function navFor(role: Role): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => canSee(i, role)),
  })).filter((g) => g.items.length > 0);
}

/** Longest URL match first so /sessions/attended beats /sessions. */
export function findCurrent(pathname: string) {
  const all = NAV.flatMap((g) => g.items.map((item) => ({ group: g.title, item })));
  return all
    .sort((a, b) => b.item.url.length - a.item.url.length)
    .find(({ item }) =>
      item.url === "/" ? pathname === "/" : pathname.startsWith(item.url),
    );
}

/** Mobile bottom-bar tabs (plus a trailing "More"), per role. */
export const TABS: Record<Role, string[]> = {
  HR_ADMIN: ["/candidates", "/employees", "/leave", "/onboarding"],
  MANAGER: ["/", "/employees", "/leave", "/onboarding"],
  EMPLOYEE: ["/", "/me", "/sessions", "/profile"],
};
