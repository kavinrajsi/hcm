import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";

export const metadata = { title: "Dashboard" };

const modules = [
  { href: "/employees", title: "Employee Master" },
  { href: "/onboarding", title: "Onboarding" },
  { href: "/exit", title: "Exit / Offboarding" },
  { href: "/id-cards", title: "ID Cards" },
  { href: "/probation", title: "Probation" },
  { href: "/quantum", title: "Quantum Sheet" },
  { href: "/sessions", title: "Session Calendar" },
  { href: "/sessions/attended", title: "Session Attended" },
  { href: "/freelancers", title: "Freelance Pool" },
  { href: "/letters", title: "Letters" },
  { href: "/reviews", title: "Review Meetings" },
  { href: "/me", title: "My Profile" },
] as const;

export default async function Home() {
  const user = await requireUser();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

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
      where: { status: { not: "CONFIRMED" }, dueDate: { lt: monthEnd } },
    }),
    db.idCard.count({ where: { status: { notIn: ["ISSUED", "RETURNED"] } } }),
    db.trainingSession.count({ where: { date: { gte: now } } }),
    db.freelancer.count(),
  ]);

  const stats = [
    { label: "Active employees", value: headcount, href: "/employees" },
    { label: "Joiners this month", value: joinersThisMonth, href: "/onboarding" },
    { label: "Exits this month", value: exitsThisMonth, href: "/exit" },
    { label: "Probation due", value: probationDue, href: "/probation" },
    { label: "ID cards pending", value: cardsPending, href: "/id-cards" },
    { label: "Upcoming sessions", value: upcomingSessions, href: "/sessions" },
    { label: "Freelancers", value: freelancerCount, href: "/freelancers" },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">HRM</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Signed in as {user.email} · {user.role.replace("_", " ")}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-1 text-xs text-zinc-500">{s.label}</div>
          </Link>
        ))}
      </div>

      <h2 className="mt-12 text-lg font-medium">Modules</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {modules.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className="rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            {m.title}
          </Link>
        ))}
      </div>
    </main>
  );
}
