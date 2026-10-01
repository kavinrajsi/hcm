"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DEVICE_TYPES, DEVICE_TYPE_LABELS } from "@/lib/devices/devices";
import type { DeviceOs, DeviceType } from "@/generated/prisma/enums";
import { DEVICE_OSES, DEVICE_OS_LABELS } from "@/lib/devices/os";
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
  email: string | null;
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
  const [pick, setPick] = useState(OTHER);
  const [type, setType] = useState<DeviceType>("LAPTOP");
  const [os, setOs] = useState<DeviceOs | "">(recommendedOs ?? "");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [neededBy, setNeededBy] = useState(defaultNeededBy);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendState | null>(null);
  const [requestKey, setRequestKey] = useState(newKey);
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
      setPreview(state.preview ?? null);
    });
  }

  function send() {
    const data = fields();
    data.set("requestKey", requestKey);
    startTransition(async () => {
      const state = await sendPurchaseRequest(data);
      setResult(state);
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
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Vendor</span>
          <select
            value={vendorId}
            disabled={!editing}
            onChange={(event) => {
              setVendorId(event.target.value);
              setPick(OTHER);
            }}
            className={selectClass}
          >
            <option value="" disabled>
              Pick a vendor…
            </option>
            {vendors.map((row) => (
              <option key={row.id} value={row.id} disabled={!row.email}>
                {row.name}
                {row.email ? "" : " (no email, add one first)"}
              </option>
            ))}
          </select>
        </label>
        {vendor && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Device</span>
            <select
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
            {vendor.catalog.length > 0 && (
              <span className="text-xs text-zinc-500">Devices bought from {vendor.name} before.</span>
            )}
          </label>
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
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Type</span>
              <select
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
            </label>
            {type === "LAPTOP" && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">OS</span>
                <select
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
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Device name</span>
              <Input
                value={itemName}
                disabled={!editing || pick !== OTHER}
                onChange={(event) => setItemName(event.target.value)}
                placeholder="Dell Latitude 5440, 16 GB / 512 GB"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Quantity</span>
              <Input
                type="number"
                min={1}
                max={100}
                value={quantity}
                disabled={!editing}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Needed by</span>
              <Input
                type="date"
                value={neededBy}
                disabled={!editing}
                onChange={(event) => setNeededBy(event.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Note to the vendor (optional)</span>
            <Textarea
              rows={2}
              value={notes}
              disabled={!editing}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Specs, warranty, delivery address…"
            />
          </label>
        </>
      )}

      {vendor && type === "LAPTOP" && recommendedOs && os && os !== recommendedOs && (
        <p className="text-sm text-amber-600">
          {designation ?? "This role"} usually gets a {DEVICE_OS_LABELS[recommendedOs]}. Fine if the role needs a{" "}
          {DEVICE_OS_LABELS[os]}.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result?.ok && <p className="text-sm text-emerald-600">{result.ok}</p>}
      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}

      {editing ? (
        <div>
          <Button type="button" disabled={!vendor || pending} onClick={showPreview}>
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
            <Button type="button" disabled={pending} onClick={send}>
              {pending ? "Sending…" : `Send to ${preview.to}`}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setPreview(null)}>
              Edit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
