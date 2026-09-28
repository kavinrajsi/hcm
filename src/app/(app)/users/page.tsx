import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListCard } from "@/components/list-card";
import { CollapsibleForm } from "@/components/collapsible-form";
import {
  DesktopTable,
  MobileList,
  PageHeader,
  PageShell,
} from "@/components/page";
import { cn } from "@/lib/utils";
import {
  BulkCreateLogins,
  InviteForm,
  RoleSelect,
  UserActions,
} from "./user-controls";

export const metadata = { title: "Users & roles" };

function status(user: {
  disabledAt: Date | null;
  passwordHash: string | null;
}) {
  if (user.disabledAt)
    return { label: "Disabled", tone: "bg-muted text-zinc-500" };
  if (!user.passwordHash)
    return {
      label: "Invited",
      tone: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
    };
  return {
    label: "Active",
    tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  };
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", tone)}>
      {label}
    </span>
  );
}

export default async function UsersPage() {
  const me = await requireRole("HR_ADMIN");

  const [users, withoutLogin] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        passwordHash: true,
        disabledAt: true,
        createdAt: true,
        employee: { select: { id: true, empId: true, name: true } },
      },
    }),
    // Current employees who can't sign in yet.
    db.employee.findMany({
      where: { userId: null, dateOfExit: null },
      orderBy: { name: "asc" },
      select: { id: true, empId: true, name: true },
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Users & roles"
        description={
          <>
            Who can sign in and what they can see. HR admins manage everything;
            managers see their direct reports; employees see their own profile.
            Role changes and disabling take effect immediately.
          </>
        }
      />

      <div className="mt-5 md:mt-6">
        <CollapsibleForm label="Create login">
          <InviteForm employees={withoutLogin} />
        </CollapsibleForm>
        <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-zinc-500">
            {withoutLogin.length} current employee
            {withoutLogin.length === 1 ? "" : "s"} without a login.
          </p>
          <BulkCreateLogins count={withoutLogin.length} />
        </div>
      </div>

      <div className="mt-4">
        <MobileList isEmpty={users.length === 0} empty="No users yet.">
          {users.map((user) => {
            const userStatus = status(user);
            return (
              <ListCard
                key={user.id}
                title={user.name ?? user.email}
                subtitle={user.email}
                badge={<StatusBadge {...userStatus} />}
                meta={
                  user.employee ? (
                    <Link
                      href={`/employees/${user.employee.id}`}
                      className="underline underline-offset-4"
                    >
                      {user.employee.empId}
                    </Link>
                  ) : (
                    <span>No employee record</span>
                  )
                }
                actions={
                  <div className="flex w-full flex-col gap-2">
                    <RoleSelect userId={user.id} role={user.role} />
                    <UserActions
                      userId={user.id}
                      disabled={!!user.disabledAt}
                      isSelf={user.id === me.id}
                    />
                  </div>
                }
              />
            );
          })}
        </MobileList>
      </div>

      <DesktopTable>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} className="align-top">
                <TableCell>
                  <div className="font-medium">
                    {user.name ?? user.email}
                    {user.id === me.id && (
                      <span className="ml-1.5 text-xs font-normal text-zinc-400">
                        (you)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">{user.email}</div>
                </TableCell>
                <TableCell>
                  {user.employee ? (
                    <Link
                      href={`/employees/${user.employee.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {user.employee.empId} — {user.employee.name}
                    </Link>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <RoleSelect userId={user.id} role={user.role} />
                </TableCell>
                <TableCell>
                  <StatusBadge {...status(user)} />
                </TableCell>
                <TableCell className="w-80 whitespace-normal">
                  <UserActions
                    userId={user.id}
                    disabled={!!user.disabledAt}
                    isSelf={user.id === me.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DesktopTable>
    </PageShell>
  );
}
