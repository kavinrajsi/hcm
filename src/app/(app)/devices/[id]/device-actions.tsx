"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeSelect, type Employee } from "@/components/employee-select";
import { ValidatedForm } from "@/components/form/validated-form";
import {
  FieldError,
  FormField,
  FormMessage,
} from "@/components/form/form-field";
import {
  assignDevice,
  reportIssue,
  resolveTicket,
  returnDevice,
  sendForService,
  type DeviceFormState,
} from "../actions";

function Result({ state }: { state: DeviceFormState }) {
  return <FormMessage error={state.error} ok={state.ok} />;
}

/** HR: hand the device to someone (closes the current holder's stint). */
export function AssignForm({
  deviceId,
  employees,
  reassign,
}: {
  deviceId: string;
  employees: Employee[];
  reassign: boolean;
}) {
  const [state, formAction, pending] = useActionState(assignDevice, {});
  const [employeeId, setEmployeeId] = useState("");
  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="deviceId" value={deviceId} />
      <EmployeeSelect
        id={`assign-${deviceId}`}
        name="employeeId"
        employees={employees}
        selectedId={employeeId}
        onSelect={setEmployeeId}
      />
      <FieldError name="employeeId" />
      <Input
        name="conditionOut"
        placeholder="Condition when handed over (optional)"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="outline"
          disabled={pending || !employeeId}
        >
          {pending ? "Saving…" : reassign ? "Reassign" : "Assign"}
        </Button>
        <Result state={state} />
      </div>
    </ValidatedForm>
  );
}

/** HR: take the device back into stock. */
export function ReturnForm({ deviceId }: { deviceId: string }) {
  const [state, formAction, pending] = useActionState(returnDevice, {});
  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="deviceId" value={deviceId} />
      <Input
        name="conditionIn"
        placeholder="Condition when returned (optional)"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Return to stock"}
        </Button>
        <Result state={state} />
      </div>
    </ValidatedForm>
  );
}

export function ReportIssueForm({ deviceId }: { deviceId: string }) {
  const [state, formAction, pending] = useActionState(reportIssue, {});
  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="flex flex-col gap-2"
      key={String(state.ok ?? "")}
    >
      <input type="hidden" name="deviceId" value={deviceId} />
      <FormField name="title">
        <Input
          name="title"
          required
          placeholder="What's wrong? e.g. Battery drains in an hour"
        />
      </FormField>
      <FormField name="description">
        <Textarea
          name="description"
          required
          rows={3}
          placeholder="When it started, what you tried…"
        />
      </FormField>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Report issue"}
        </Button>
        <Result state={state} />
      </div>
    </ValidatedForm>
  );
}

export function SendForServiceForm({
  ticketId,
  vendors,
}: {
  ticketId: string;
  vendors: { id: string; name: string; phone: string }[];
}) {
  const [state, formAction, pending] = useActionState(sendForService, {});
  if (vendors.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        No service centres yet. HR can add one under Devices → Vendors.
      </p>
    );
  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="grid gap-2 md:grid-cols-[1fr_10rem_auto] md:items-start"
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormField name="serviceVendorId">
        <select
          name="serviceVendorId"
          required
          defaultValue=""
          aria-label="Service centre"
          className="h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30"
        >
          <option value="" disabled>
            Service centre…
          </option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
              {vendor.phone ? ` · ${vendor.phone}` : ""}
            </option>
          ))}
        </select>
      </FormField>
      <FormField name="expectedBackOn">
        <Input
          type="date"
          name="expectedBackOn"
          aria-label="Expected back on"
        />
      </FormField>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Send for service"}
      </Button>
      <div className="md:col-span-3">
        <Result state={state} />
      </div>
    </ValidatedForm>
  );
}

export function ResolveForm({
  ticketId,
  outForService,
}: {
  ticketId: string;
  outForService: boolean;
}) {
  const [state, formAction, pending] = useActionState(resolveTicket, {});
  return (
    <ValidatedForm
      action={formAction}
      fieldErrors={state.fieldErrors}
      className="grid gap-2 md:grid-cols-[1fr_8rem_auto] md:items-start"
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormField name="resolution">
        <Input
          name="resolution"
          required
          placeholder={
            outForService
              ? "What did the service centre do?"
              : "How was it fixed?"
          }
        />
      </FormField>
      <FormField name="cost">
        <Input
          name="cost"
          inputMode="decimal"
          pattern="\d+(\.\d{1,2})?"
          title="Enter a number like 2500 or 2500.50"
          placeholder="Cost ₹"
          aria-label="Cost"
        />
      </FormField>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending
          ? "Saving…"
          : outForService
            ? "Back from service"
            : "Mark resolved"}
      </Button>
      <div className="md:col-span-3">
        <Result state={state} />
      </div>
    </ValidatedForm>
  );
}
