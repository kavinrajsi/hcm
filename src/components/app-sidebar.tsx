"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2 } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const nav = [
  {
    title: "Overview",
    items: [
      { title: "Dashboard", url: "/" },
      { title: "Me", url: "/me" },
    ],
  },
  {
    title: "People",
    items: [
      { title: "Employees", url: "/employees" },
      { title: "Onboarding", url: "/onboarding" },
      { title: "Probation", url: "/probation" },
      { title: "Exit", url: "/exit" },
      { title: "ID Cards", url: "/id-cards" },
    ],
  },
  {
    title: "Work",
    items: [
      { title: "Quantum", url: "/quantum" },
      { title: "Sessions", url: "/sessions" },
      { title: "Session Attendance", url: "/sessions/attended" },
      { title: "Freelancers", url: "/freelancers" },
    ],
  },
  {
    title: "Documents",
    items: [
      { title: "Letters", url: "/letters" },
      { title: "Reviews", url: "/reviews" },
    ],
  },
] as const;

function findCurrent(pathname: string) {
  for (const group of nav) {
    // Longest match first so /sessions/attended beats /sessions.
    const item = [...group.items]
      .sort((a, b) => b.url.length - a.url.length)
      .find((i) =>
        i.url === "/" ? pathname === "/" : pathname.startsWith(i.url),
      );
    if (item) return { group: group.title, item };
  }
  return undefined;
}

export function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const current = findCurrent(pathname);

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Building2 className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium">HRM</span>
                <span className="text-xs text-muted-foreground">
                  Internal HR
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {nav.map((group) => (
              <SidebarMenuItem key={group.title}>
                <SidebarMenuButton className="font-medium">
                  {group.title}
                </SidebarMenuButton>
                <SidebarMenuSub>
                  {group.items.map((item) => (
                    <SidebarMenuSubItem key={item.title}>
                      <SidebarMenuSubButton
                        isActive={current?.item.url === item.url}
                        render={<Link href={item.url} />}
                      >
                        {item.title}
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

export function HeaderBreadcrumb() {
  const pathname = usePathname();
  const current = findCurrent(pathname);
  if (!current) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          {current.group}
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          <BreadcrumbPage>{current.item.title}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
