import type { Role } from "@/generated/prisma/enums";
import { AppSidebar, HeaderBreadcrumb } from "@/components/app-sidebar";
import { AccountMenu } from "@/components/account-menu";
import { MobileTabBar } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { signOutAction } from "@/app/(app)/actions";

/** Sidebar, header (breadcrumb, sign out) and mobile tab bar. */
export function AppShell({
  user,
  children,
}: {
  user: { email: string; role: Role };
  children: React.ReactNode;
}) {
  const email = user.email;
  return (
    <SidebarProvider>
      <AppSidebar role={user.role} />
      <SidebarInset className="min-w-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/90 px-4 backdrop-blur-md md:static md:h-16 md:bg-background md:px-3 md:backdrop-blur-none">
          <div className="flex min-w-0 items-center gap-2">
            {/* Phones navigate with the bottom tab bar's "More" instead. */}
            <SidebarTrigger className="hidden md:inline-flex" />
            <Separator
              orientation="vertical"
              className="mr-2 hidden data-vertical:h-4 data-vertical:self-auto md:block"
            />
            <HeaderBreadcrumb role={user.role} />
          </div>
          <div className="md:hidden">
            <AccountMenu email={email} signOutAction={signOutAction} />
          </div>
          <div className="hidden items-center gap-1 md:flex">
            <ThemeToggle />
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Sign out · {email}
              </button>
            </form>
          </div>
        </header>
        {children}
      </SidebarInset>
      <MobileTabBar role={user.role} />
    </SidebarProvider>
  );
}
