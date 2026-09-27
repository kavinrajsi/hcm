"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmployeeSelect, type Employee } from "@/components/employee-select";
import type { Role } from "@/generated/prisma/enums";
import {
  inviteUser,
  newPasswordLink,
  setUserDisabled,
  setUserRole,
  type LinkState,
} from "./actions";

export const ROLE_LABELS: Record<Role, string> = {
  HR_ADMIN: "HR admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

const selectClass =
  "h-10 rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

/** The set-password link, with copy button and whether it was emailed. */
function LinkResult({ state }: { state: LinkState }) {
  const [copied, setCopied] = useState(false);
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (!state.link) return null;
  return (
    <div className="w-full rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <p>
        {state.emailed
          ? `Emailed to ${state.email}. You can also share the link:`
          : `Email isn't set up — send this link to ${state.email} yourself:`}
      </p>
      <div className="mt-2 flex gap-2">
        <Input readOnly value={state.link} className="h-9 font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          className="h-9 shrink-0"
          onClick={() => {
            void navigator.clipboard.writeText(state.link!);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">
        Single use. Anyone with the link can set this account&apos;s password.
      </p>
    </div>
  );
}

export function InviteForm({ employees }: { employees: Employee[] }) {
  const [state, formAction, pending] = useActionState<LinkState, FormData>(
    inviteUser,
    {},
  );
  const [employeeId, setEmployeeId] = useState("");

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 md:flex-row md:flex-wrap md:items-end dark:border-zinc-800"
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="invite-employee-desktop"
          className="hidden text-sm font-medium md:block"
        >
          Employee
        </label>
        <label
          htmlFor="invite-employee-phone"
          className="text-sm font-medium md:hidden"
        >
          Employee
        </label>
        <EmployeeSelect
          id="invite-employee"
          name="employeeId"
          employees={employees}
          selectedId={employeeId}
          onSelect={setEmployeeId}
        />
      </div>
      {!employeeId && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="invite-email" className="text-sm font-medium">
            …or email (no employee record)
          </label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="name@madarth.com"
            className="md:w-56"
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="invite-role" className="text-sm font-medium">
          Role
        </label>
        <select
          id="invite-role"
          name="role"
          defaultValue="EMPLOYEE"
          className={selectClass}
        >
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create login"}
      </Button>
      <LinkResult state={state} />
    </form>
  );
}

export function RoleSelect({ userId, role }: { userId: string; role: Role }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [value, setValue] = useState(role);

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="Role"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Role;
          const prev = value;
          setValue(next);
          setError(undefined);
          startTransition(async () => {
            const r = await setUserRole(userId, next);
            if (r.error) {
              setValue(prev);
              setError(r.error);
            }
          });
        }}
        className={`${selectClass} disabled:opacity-50`}
      >
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function UserActions({
  userId,
  disabled,
  isSelf,
}: {
  userId: string;
  disabled: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<LinkState>({});
  const [error, setError] = useState<string>();

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 md:h-8"
          disabled={pending || disabled}
          onClick={() =>
            startTransition(async () => setLink(await newPasswordLink(userId)))
          }
        >
          New password link
        </Button>
        {!isSelf && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={
              disabled
                ? "h-10 md:h-8"
                : "h-10 text-red-600 md:h-8 dark:text-red-400"
            }
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(undefined);
                const r = await setUserDisabled(userId, !disabled);
                if (r.error) setError(r.error);
              })
            }
          >
            {disabled ? "Enable" : "Disable"}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <LinkResult state={link} />
    </div>
  );
}
