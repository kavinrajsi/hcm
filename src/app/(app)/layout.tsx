import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/employees", label: "Employees" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/exit", label: "Exit" },
  { href: "/id-cards", label: "ID Cards" },
  { href: "/probation", label: "Probation" },
  { href: "/quantum", label: "Quantum" },
  { href: "/sessions", label: "Sessions" },
  { href: "/freelancers", label: "Freelancers" },
  { href: "/letters", label: "Letters" },
  { href: "/reviews", label: "Reviews" },
  { href: "/me", label: "Me" },
] as const;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold">HRM</span>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Sign out · {session.user.email}
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
