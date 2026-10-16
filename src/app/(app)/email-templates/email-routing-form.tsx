"use client";

// Admin → Email templates list: every email HCM sends, each with a "Send
// via" choice: the default service, another service, or "Don't send".

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ValidatedForm } from "@/components/form/validated-form";
import { FieldError, FormMessage } from "@/components/form/form-field";
import type { FormState } from "@/lib/form-state";
import type { EmailRoute, EmailRouting, EmailTransport } from "@/lib/email";
import { saveEmailRouting } from "./actions";

export type RoutingRow = {
  key: string;
  name: string;
  group: string;
  trigger: string;
  to: string;
  cc?: string;
  subject: string;
};

const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30 sm:w-48";

/** Emails people need to get into HCM: turning them off locks people out. */
const ACCESS_WARNINGS: Record<string, string> = {
  invite: "New users won't get their set-password link. Share it from Users & roles instead.",
  reset: "Nobody gets a reset link by email, and Forgot password on the login page does nothing.",
};

export function EmailRoutingForm({
  rows,
  groups,
  routing,
  defaultTransport,
  configured,
}: {
  rows: RoutingRow[];
  groups: string[];
  routing: EmailRouting;
  defaultTransport: EmailTransport;
  configured: Record<EmailTransport, boolean>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveEmailRouting, {});
  const [routes, setRoutes] = useState<Record<string, EmailRoute>>(() =>
    Object.fromEntries(rows.map((row) => [row.key, routing[row.key] ?? "default"])),
  );
  const defaultName = defaultTransport === "smtp" ? "SMTP" : "ZeptoMail";

  return (
    <ValidatedForm
      fieldErrors={state.fieldErrors}
      // Submitted by hand so React doesn't reset the selects after saving.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="flex flex-col gap-8"
    >
      {groups.map((group) => {
        const groupRows = rows.filter((row) => row.group === group);
        if (groupRows.length === 0) return null;
        return (
          <section key={group}>
            <h2 className="text-base font-semibold">{group}</h2>
            <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {groupRows.map((row) => {
                const route = routes[row.key];
                return (
                  <li key={row.key} className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-start sm:justify-between">
                    <Link href={`/email-templates/${row.key}`} className="group flex min-w-0 flex-col gap-1">
                      <span className="font-medium group-hover:underline">{row.name}</span>
                      <span className="text-zinc-600 dark:text-zinc-400">{row.trigger}</span>
                      <span className="text-xs text-zinc-500">
                        To: {row.to}
                        {row.cc ? ` · CC: ${row.cc}` : ""}
                      </span>
                      <span className="truncate text-xs text-zinc-500">Subject: {row.subject}</span>
                    </Link>
                    <label className="flex shrink-0 flex-col gap-1">
                      <span className="text-xs font-medium text-zinc-500">Send via</span>
                      <select
                        name={`route.${row.key}`}
                        value={route}
                        onChange={(event) => setRoutes((current) => ({ ...current, [row.key]: event.target.value as EmailRoute }))}
                        className={selectClass}
                      >
                        <option value="default">Default ({defaultName})</option>
                        <option value="zeptomail" disabled={!configured.zeptomail && route !== "zeptomail"}>
                          ZeptoMail{configured.zeptomail ? "" : " (not set up)"}
                        </option>
                        <option value="smtp" disabled={!configured.smtp && route !== "smtp"}>
                          SMTP{configured.smtp ? "" : " (not set up)"}
                        </option>
                        <option value="off">Don&apos;t send</option>
                      </select>
                      <FieldError name={`route.${row.key}`} />
                      {route === "off" && (
                        <span className="max-w-48 text-xs text-amber-700 dark:text-amber-400">
                          {ACCESS_WARNINGS[row.key] ?? "Not sent from HCM. It's logged as not sent."}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save email settings"}
        </Button>
        <FormMessage error={state.error} ok={state.ok} />
      </div>
    </ValidatedForm>
  );
}
