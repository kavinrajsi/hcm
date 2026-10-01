"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmployeeSelect, type Employee } from "@/components/employee-select";
import type { Role } from "@/generated/prisma/enums";
import {
  createLoginForEmployee,
  createLoginsForAll,
  inviteUser,
  newPasswordLink,
  setUserDisabled,
  setUserRole,
  type BulkLoginResult,
  type LinkState,
} from "./actions";
import { ValidatedForm } from "@/components/form/validated-form";
import { FieldError, FormField } from "@/components/form/form-field";

export const ROLE_LABELS: Record<Role, string> = {
  HR_ADMIN: "HR admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

const selectClass =
  "h-10 rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

/** The set-password link, with copy button and whether it was emailed. */
export function LinkResult({ state }: { state: LinkState }) {
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
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
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
        <FieldError name="employeeId" />
      </div>
      {!employeeId && (
        <FormField
          name="email"
          label="…or email (no employee record)"
          className="gap-1.5"
        >
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="name@madarth.com"
            className="md:w-56"
          />
        </FormField>
      )}
      <FormField name="role" label="Role" className="gap-1.5">
        <select
          id="invite-role"
          name="role"
          defaultValue="EMPLOYEE"
          className={selectClass}
        >
          {(Object.keys(ROLE_LABELS) as Role[]).map((roleOption) => (
            <option key={roleOption} value={roleOption}>
              {ROLE_LABELS[roleOption]}
            </option>
          ))}
        </select>
      </FormField>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create login"}
      </Button>
      <LinkResult state={state} />
    </ValidatedForm>
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
        onChange={(event) => {
          const next = event.target.value as Role;
          const prev = value;
          setValue(next);
          setError(undefined);
          startTransition(async () => {
            const result = await setUserRole(userId, next);
            if (result.error) {
              setValue(prev);
              setError(result.error);
            }
          });
        }}
        className={`${selectClass} disabled:opacity-50`}
      >
        {(Object.keys(ROLE_LABELS) as Role[]).map((roleOption) => (
          <option key={roleOption} value={roleOption}>
            {ROLE_LABELS[roleOption]}
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
                const result = await setUserDisabled(userId, !disabled);
                if (result.error) setError(result.error);
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

/** Employee page: create an Employee-role login for someone without one. */
export function CreateLoginButton({ employeeId }: { employeeId: string }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<LinkState>({});
  return (
    <div className="flex flex-col gap-2">
      {!state.link && (
        <Button
          type="button"
          variant="outline"
          className="h-10 w-fit md:h-8"
          disabled={pending}
          onClick={() =>
            startTransition(async () =>
              setState(await createLoginForEmployee(employeeId)),
            )
          }
        >
          {pending ? "Creating…" : "Create login"}
        </Button>
      )}
      <LinkResult state={state} />
    </div>
  );
}

/** Users & roles: logins + invites for every current employee without one. */
export function BulkCreateLogins({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<BulkLoginResult>();

  if (result) {
    return (
      <p className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
        Created {result.created} login{result.created === 1 ? "" : "s"}
        {result.emailed
          ? `, ${result.emailed} invite${result.emailed === 1 ? "" : "s"} emailed`
          : ""}
        {result.linked ? `, ${result.linked} linked to existing accounts` : ""}.
        {result.failed?.length ? (
          <span className="block text-red-600">
            Couldn&apos;t create: {result.failed.join(", ")}
          </span>
        ) : null}
        {result.created && result.emailed !== result.created ? (
          <span className="block text-zinc-500">
            Some invites weren&apos;t emailed — use &ldquo;New password
            link&rdquo; on those rows.
          </span>
        ) : null}
      </p>
    );
  }
  if (count === 0) return null;
  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-10 md:h-8"
        onClick={() => setConfirming(true)}
      >
        Create logins for all {count}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <p>
        This creates {count} Employee login{count === 1 ? "" : "s"} and emails
        each person an invite to set their password. Continue?
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          className="h-10 md:h-8"
          disabled={pending}
          onClick={() =>
            startTransition(async () => setResult(await createLoginsForAll()))
          }
        >
          {pending ? `Creating ${count}…` : `Yes, create ${count} logins`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 md:h-8"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
