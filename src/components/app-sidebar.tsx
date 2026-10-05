"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Minus, Plus } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { findCurrent, navFor } from "@/lib/nav";

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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// Which nav groups the person opened or closed, remembered per browser.
const OPEN_GROUPS_KEY = "hcm.sidebar.open";
const OPEN_GROUPS_EVENT = "hcm-sidebar-open";

function readOpenGroups(): string {
  try {
    return localStorage.getItem(OPEN_GROUPS_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

function subscribeOpenGroups(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(OPEN_GROUPS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(OPEN_GROUPS_EVENT, onChange);
  };
}

function parseOpenGroups(raw: string): Record<string, boolean> {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveOpenGroup(group: string, open: boolean) {
  try {
    const groups = parseOpenGroups(readOpenGroups());
    groups[group] = open;
    localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(groups));
  } catch {
    // Private mode or blocked storage: the toggle still works for this page.
  }
  window.dispatchEvent(new Event(OPEN_GROUPS_EVENT));
}

export function AppSidebar({
  role,
  ...props
}: React.ComponentProps<typeof Sidebar> & { role: Role }) {
  const pathname = usePathname();
  const current = findCurrent(pathname);
  const { setOpenMobile } = useSidebar();
  // On phones the sidebar is a sheet; close it once a page is chosen.
  const close = () => setOpenMobile(false);
  const openGroups = parseOpenGroups(
    React.useSyncExternalStore(subscribeOpenGroups, readOpenGroups, () => "{}"),
  );
  // The page on which the current group was closed by hand, if any.
  const [closedCurrentOn, setClosedCurrentOn] = React.useState<string | null>(null);

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/" onClick={close} />}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Building2 className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium">HCM</span>
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
            {navFor(role).map((group) => {
              const isCurrent = group.title === current?.group;
              // The current page's group opens on every navigation (closing
              // it lasts until the next page); others are as last left.
              const open = isCurrent
                ? closedCurrentOn !== pathname
                : openGroups[group.title] === true;
              const toggle = (next: boolean) => {
                if (isCurrent) setClosedCurrentOn(next ? null : pathname);
                else saveOpenGroup(group.title, next);
              };
              return (
                <Collapsible
                  key={group.title}
                  open={open}
                  onOpenChange={toggle}
                  render={<SidebarMenuItem />}
                >
                  <CollapsibleTrigger
                    render={<SidebarMenuButton className="font-medium" />}
                  >
                    {group.title}
                    {open ? (
                      <Minus className="ml-auto" />
                    ) : (
                      <Plus className="ml-auto" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {group.items.map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            isActive={current?.item.url === item.url}
                            render={<Link href={item.url} onClick={close} />}
                          >
                            {item.title}
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

/**
 * "Group › Page" for the current URL. The group links to its first page
 * this role can open; the page links back to its list when you're deeper
 * in (a device's page → All devices).
 */
export function HeaderBreadcrumb({ role }: { role: Role }) {
  const pathname = usePathname();
  const current = findCurrent(pathname);
  if (!current) return null;

  const groupHome = navFor(role).find((group) => group.title === current.group)?.items[0]?.url;
  const onItemPage = pathname === current.item.url;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          {groupHome && groupHome !== pathname ? (
            <BreadcrumbLink render={<Link href={groupHome} />}>{current.group}</BreadcrumbLink>
          ) : (
            current.group
          )}
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          {onItemPage ? (
            <BreadcrumbPage>{current.item.title}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink render={<Link href={current.item.url} />}>{current.item.title}</BreadcrumbLink>
          )}
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
