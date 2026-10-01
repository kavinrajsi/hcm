"use client";

import { Children, cloneElement, isValidElement, useId } from "react";
import { cn } from "@/lib/utils";
import { useFieldError } from "./validated-form";

/** The red message under an input; renders nothing when it's fine. */
export function FieldError({ name, id, className }: { name: string; id?: string; className?: string }) {
  const message = useFieldError(name);
  if (!message) return null;
  return (
    <p id={id} role="alert" className={cn("text-xs font-normal text-red-600 dark:text-red-400", className)}>
      {message}
    </p>
  );
}

/**
 * Label, control and its inline error. Marks the first child aria-invalid
 * (the UI kit and globals.css turn its border red) and points
 * aria-describedby at the message. `name` must match the control's name.
 *
 * The wrapper is a <label> so clicking the label focuses the control; pass
 * `htmlFor` (the control's id) for composite controls such as comboboxes,
 * which mustn't sit inside a label.
 */
export function FormField({
  name,
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  name: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const message = useFieldError(name);
  const errorId = `${id}-error`;
  const items = Children.toArray(children);
  const target = items.findIndex((child) => isValidElement(child));
  const content = items.map((child, index) =>
    index === target && isValidElement<Record<string, unknown>>(child)
      ? cloneElement(child, {
          "aria-invalid": message ? true : undefined,
          "aria-describedby": message ? errorId : undefined,
        })
      : child,
  );
  const body = (
    <>
      {content}
      {hint && !message && <span className="text-xs font-normal text-zinc-500">{hint}</span>}
      <FieldError name={name} id={errorId} />
    </>
  );
  const classes = cn("flex flex-col gap-1 text-sm", className);
  if (htmlFor)
    return (
      <div className={classes}>
        {label && (
          <label htmlFor={htmlFor} className="font-medium">
            {label}
          </label>
        )}
        {body}
      </div>
    );
  return (
    <label className={classes}>
      {label && <span className="font-medium">{label}</span>}
      {body}
    </label>
  );
}

/** Form-wide message (not about one field), shown by the submit button. */
export function FormMessage({ error, ok }: { error?: string; ok?: string | boolean }) {
  if (error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (typeof ok === "string" && ok) return <p className="text-sm text-emerald-600">{ok}</p>;
  return null;
}
