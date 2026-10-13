import Link from "next/link";
import { getRecruitmentStats } from "@/lib/recruitment-stats";
import { RecruitmentSection } from "./recruitment-section";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { NAV, canSee } from "@/lib/nav";
import type { Role } from "@/generated/prisma/enums";

export const metadata = { title: "Dashboard" };

const NAV_ITEMS = NAV.flatMap((group) => group.items);

/** Same role rule as the sidebar, so the dashboard never links to a page the user can't open. */
function canOpen(href: string, role: Role) {
  const path = href.split("?")[0];
  const item = NAV_ITEMS.find((navItem) => navItem.url === path);
  return !item || canSee(item, role);
}

export default async function Home() {
  const user = await requireUser();

  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  const [
    headcount,
    joinersThisMonth,
    exitsThisMonth,
    probationDue,
    cardsPending,
    upcomingSessions,
    freelancerCount,
  ] = await Promise.all([
    db.employee.count({ where: { dateOfExit: null } }),
    db.employee.count({
      where: { dateOfJoining: { gte: monthStart, lt: monthEnd } },
    }),
    db.employee.count({
      where: { dateOfExit: { gte: monthStart, lt: monthEnd } },
    }),
    db.probationRecord.count({
      where: {
        status: { notIn: ["CONFIRMED", "EXITED"] },
        dueDate: { lt: monthEnd },
      },
    }),
    db.idCard.count({ where: { status: { notIn: ["ISSUED", "RETURNED"] } } }),
    db.trainingSession.count({ where: { date: { gte: now } } }),
    db.freelancer.count(),
  ]);
  // Recruitment charts use candidate data, which only HR admins can see.
  const recruitment =
    user.role === "HR_ADMIN" ? await getRecruitmentStats() : null;

  const stats = [
    { label: "Active employees", value: headcount, href: "/employees" },
    {
      label: "Joiners this month",
      value: joinersThisMonth,
      href: "/employees?joined=month",
    },
    { label: "Exits this month", value: exitsThisMonth, href: "/exit" },
    { label: "Probation due", value: probationDue, href: "/probation" },
    { label: "ID cards pending", value: cardsPending, href: "/id-cards" },
    { label: "Upcoming sessions", value: upcomingSessions, href: "/sessions" },
    { label: "Freelancers", value: freelancerCount, href: "/freelancers" },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 min-w-0 px-4 py-5 md:px-6 md:py-10">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">HCM</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Signed in as {user.email} · {user.role.replace("_", " ")}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats
          .filter((stat) => canOpen(stat.href, user.role))
          .map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <div className="text-2xl font-semibold tabular-nums">
                {stat.value}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{stat.label}</div>
            </Link>
          ))}
      </div>

      {recruitment && <RecruitmentSection stats={recruitment} />}
    </main>
  );
}
