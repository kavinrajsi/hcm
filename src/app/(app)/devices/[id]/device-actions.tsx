"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeSelect, type Employee } from "@/components/employee-select";
import {
  assignDevice,
  reportIssue,
  resolveTicket,
  returnDevice,
  sendForService,
  type DeviceFormState,
} from "../actions";

function Result({ state }: { state: DeviceFormState }) {
  if (state.ok) return <p className="text-sm text-emerald-600">{state.ok}</p>;
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  return null;
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
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="deviceId" value={deviceId} />
      <EmployeeSelect
        id={`assign-${deviceId}`}
        name="employeeId"
        employees={employees}
        selectedId={employeeId}
        onSelect={setEmployeeId}
      />
      <Input name="conditionOut" placeholder="Condition when handed over (optional)" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" disabled={pending || !employeeId}>
          {pending ? "Saving…" : reassign ? "Reassign" : "Assign"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

/** HR: take the device back into stock. */
export function ReturnForm({ deviceId }: { deviceId: string }) {
  const [state, formAction, pending] = useActionState(returnDevice, {});
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="deviceId" value={deviceId} />
      <Input name="conditionIn" placeholder="Condition when returned (optional)" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Return to stock"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function ReportIssueForm({ deviceId }: { deviceId: string }) {
  const [state, formAction, pending] = useActionState(reportIssue, {});
  return (
    <form action={formAction} className="flex flex-col gap-2" key={state.ok}>
      <input type="hidden" name="deviceId" value={deviceId} />
      <Input name="title" required placeholder="What's wrong? e.g. Battery drains in an hour" />
      <Textarea name="description" required rows={3} placeholder="When it started, what you tried…" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Report issue"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

export function SendForServiceForm({ ticketId }: { ticketId: string }) {
  const [state, formAction, pending] = useActionState(sendForService, {});
  return (
    <form action={formAction} className="grid gap-2 md:grid-cols-[1fr_10rem_auto] md:items-start">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Input name="serviceVendor" required placeholder="Service centre" />
      <Input type="date" name="expectedBackOn" aria-label="Expected back on" />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Send for service"}
      </Button>
      <div className="md:col-span-3">
        <Result state={state} />
      </div>
    </form>
  );
}

export function ResolveForm({ ticketId, outForService }: { ticketId: string; outForService: boolean }) {
  const [state, formAction, pending] = useActionState(resolveTicket, {});
  return (
    <form action={formAction} className="grid gap-2 md:grid-cols-[1fr_8rem_auto] md:items-start">
      <input type="hidden" name="ticketId" value={ticketId} />
      <Input name="resolution" required placeholder={outForService ? "What did the service centre do?" : "How was it fixed?"} />
      <Input name="cost" inputMode="decimal" placeholder="Cost ₹" aria-label="Cost" />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : outForService ? "Back from service" : "Mark resolved"}
      </Button>
      <div className="md:col-span-3">
        <Result state={state} />
      </div>
    </form>
  );
}
