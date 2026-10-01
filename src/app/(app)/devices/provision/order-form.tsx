"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DEVICE_TYPES, DEVICE_TYPE_LABELS } from "@/lib/devices/devices";
import type { DeviceOs, DeviceType } from "@/generated/prisma/enums";
import { DEVICE_OSES, DEVICE_OS_LABELS } from "@/lib/devices/os";
import { ValidatedForm } from "@/components/form/validated-form";
import { FormField, FormMessage } from "@/components/form/form-field";
import {
  previewPurchaseRequest,
  sendPurchaseRequest,
  type EmailPreview,
  type SendState,
} from "./actions";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-transparent px-2 text-base md:h-9 md:text-sm dark:bg-input/30";

export type OrderVendor = {
  id: string;
  name: string;
  /** Who the email can go to; the first is the default. */
  recipients: { key: string; label: string }[];
  catalog: { type: DeviceType; name: string }[];
};

const OTHER = "__other";

function newKey() {
  return crypto.randomUUID();
}

/** Pick a vendor and a device, preview the email, then send it. */
export function OrderForm({
  employeeId,
  vendors,
  defaultNeededBy,
  recommendedOs = null,
  designation,
}: {
  employeeId: string | null;
  vendors: OrderVendor[];
  defaultNeededBy: string;
  /** What this person's designation usually gets. */
  recommendedOs?: DeviceOs | null;
  designation?: string;
}) {
  const [vendorId, setVendorId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [pick, setPick] = useState(OTHER);
  const [type, setType] = useState<DeviceType>("LAPTOP");
  const [os, setOs] = useState<DeviceOs | "">(recommendedOs ?? "");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [neededBy, setNeededBy] = useState(defaultNeededBy);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>();
  const [result, setResult] = useState<SendState | null>(null);
  const [requestKey, setRequestKey] = useState(newKey);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const vendor = vendors.find((row) => row.id === vendorId);

  function choose(value: string) {
    setPick(value);
    setPreview(null);
    if (value === OTHER || !vendor) return;
    const item = vendor.catalog[Number(value)];
    if (item) {
      setType(item.type);
      setItemName(item.name);
    }
  }

  function fields() {
    const data = new FormData();
    if (employeeId) data.set("employeeId", employeeId);
    data.set("vendorId", vendorId);
    data.set("recipient", recipient);
    data.set("type", type);
    data.set("os", type === "LAPTOP" ? os : "");
    data.set("itemName", itemName);
    data.set("quantity", quantity);
    data.set("neededBy", neededBy);
    data.set("notes", notes);
    return data;
  }

  function showPreview() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const state = await previewPurchaseRequest(fields());
      setError(state.error ?? null);
      setFieldErrors(state.fieldErrors);
      setPreview(state.preview ?? null);
    });
  }

  function send() {
    const data = fields();
    data.set("requestKey", requestKey);
    // The server refuses a send that didn't come through this confirmation.
    data.set("confirmed", "yes");
    setConfirming(false);
    startTransition(async () => {
      const state = await sendPurchaseRequest(data);
      setResult(state);
      // A field problem means editing the order, so go back to the form.
      if (state.fieldErrors) setPreview(null);
      setFieldErrors(state.fieldErrors);
      if (state.ok) {
        setPreview(null);
        setItemName("");
        setNotes("");
        setPick(OTHER);
        setRequestKey(newKey());
      }
    });
  }

  if (vendors.length === 0)
    return (
      <p className="text-sm text-zinc-500">
        No active vendors that sell devices.{" "}
        <Link href="/devices/vendors/new" className="underline">
          Add a vendor
        </Link>{" "}
        first.
      </p>
    );

  const editing = !preview;
  return (
    <ValidatedForm
      className="flex flex-col gap-4"
      fieldErrors={fieldErrors}
      onSubmit={(event) => {
        // Nothing posts: the preview is fetched, then sent after confirming.
        event.preventDefault();
        if (editing) showPreview();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FormField name="vendorId" label="Vendor">
          <select
            name="vendorId"
            required
            value={vendorId}
            disabled={!editing}
            onChange={(event) => {
              const next = vendors.find((row) => row.id === event.target.value);
              setVendorId(event.target.value);
              setRecipient(next?.recipients[0]?.key ?? "");
              setPick(OTHER);
            }}
            className={selectClass}
          >
            <option value="" disabled>
              Pick a vendor…
            </option>
            {vendors.map((row) => (
              <option key={row.id} value={row.id} disabled={!row.recipients.length}>
                {row.name}
                {row.recipients.length ? "" : " (no email, add one first)"}
              </option>
            ))}
          </select>
        </FormField>
        {vendor && (
          <FormField name="recipient" label="Send to">
            <select
              name="recipient"
              value={recipient}
              disabled={!editing}
              onChange={(event) => setRecipient(event.target.value)}
              className={selectClass}
            >
              {vendor.recipients.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
        )}
        {vendor && (
          <FormField
            name="pick"
            label="Device"
            hint={vendor.catalog.length > 0 ? `Devices bought from ${vendor.name} before.` : undefined}
          >
            <select
              name="pick"
              value={pick}
              disabled={!editing}
              onChange={(event) => choose(event.target.value)}
              className={selectClass}
            >
              {vendor.catalog.map((item, index) => (
                <option key={`${item.type}-${item.name}`} value={index}>
                  {DEVICE_TYPE_LABELS[item.type]}: {item.name}
                </option>
              ))}
              <option value={OTHER}>
                {vendor.catalog.length ? "Something else (type it)" : "Type the device name"}
              </option>
            </select>
          </FormField>
        )}
      </div>

      {vendor && (
        <>
          <div
            className={
              type === "LAPTOP"
                ? "grid gap-4 md:grid-cols-[9rem_8rem_1fr_5rem_10rem]"
                : "grid gap-4 md:grid-cols-[9rem_1fr_5rem_10rem]"
            }
          >
            <FormField name="type" label="Type">
              <select
                name="type"
                value={type}
                disabled={!editing || pick !== OTHER}
                onChange={(event) => setType(event.target.value as DeviceType)}
                className={selectClass}
              >
                {DEVICE_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {DEVICE_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </FormField>
            {type === "LAPTOP" && (
              <FormField name="os" label="OS">
                <select
                  name="os"
                  value={os}
                  disabled={!editing}
                  onChange={(event) => setOs(event.target.value as DeviceOs | "")}
                  className={selectClass}
                >
                  <option value="">Any</option>
                  {DEVICE_OSES.map((value) => (
                    <option key={value} value={value}>
                      {DEVICE_OS_LABELS[value]}
                      {value === recommendedOs ? " (recommended)" : ""}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField name="itemName" label="Device name">
              <Input
                name="itemName"
                required
                minLength={2}
                maxLength={200}
                value={itemName}
                disabled={!editing || pick !== OTHER}
                onChange={(event) => setItemName(event.target.value)}
                placeholder="Dell Latitude 5440, 16 GB / 512 GB"
              />
            </FormField>
            <FormField name="quantity" label="Quantity">
              <Input
                name="quantity"
                type="number"
                required
                min={1}
                max={100}
                value={quantity}
                disabled={!editing}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </FormField>
            <FormField name="neededBy" label="Needed by">
              <Input
                name="neededBy"
                type="date"
                value={neededBy}
                disabled={!editing}
                onChange={(event) => setNeededBy(event.target.value)}
              />
            </FormField>
          </div>
          <FormField name="notes" label="Note to the vendor (optional)">
            <Textarea
              name="notes"
              rows={2}
              value={notes}
              disabled={!editing}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Specs, warranty, delivery address…"
            />
          </FormField>
        </>
      )}

      {vendor && type === "LAPTOP" && recommendedOs && os && os !== recommendedOs && (
        <p className="text-sm text-amber-600">
          {designation ?? "This role"} usually gets a {DEVICE_OS_LABELS[recommendedOs]}. Fine if the role needs a{" "}
          {DEVICE_OS_LABELS[os]}.
        </p>
      )}
      <FormMessage error={result?.error ?? error ?? undefined} ok={result?.ok} />

      {editing ? (
        <div>
          <Button type="submit" disabled={!vendor || pending}>
            {pending ? "Preparing…" : "Preview email"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-zinc-500">From</dt>
            <dd>{preview.from}</dd>
            <dt className="text-zinc-500">To</dt>
            <dd>{preview.to}</dd>
            <dt className="text-zinc-500">CC</dt>
            <dd>{preview.cc.length ? preview.cc.join(", ") : "—"}</dd>
            <dt className="text-zinc-500">Reply to</dt>
            <dd>{preview.replyTo}</dd>
            <dt className="text-zinc-500">Subject</dt>
            <dd className="font-medium">{preview.subject}</dd>
          </dl>
          <iframe
            title="Email preview"
            srcDoc={preview.html}
            sandbox=""
            className="h-96 w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => setConfirming(true)}>
              {pending ? "Sending…" : "Send email…"}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setPreview(null)}>
              Edit
            </Button>
          </div>
          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send this email to the vendor?</DialogTitle>
                <DialogDescription>It goes out straight away and can&rsquo;t be unsent.</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-zinc-500">To</dt>
                <dd className="break-all">{preview.to}</dd>
                <dt className="text-zinc-500">CC</dt>
                <dd className="break-all">{preview.cc.length ? preview.cc.join(", ") : "—"}</dd>
                <dt className="text-zinc-500">Subject</dt>
                <dd>{preview.subject}</dd>
              </dl>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
                  Not yet
                </Button>
                <Button type="button" disabled={pending} onClick={send}>
                  Yes, send email
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </ValidatedForm>
  );
}
