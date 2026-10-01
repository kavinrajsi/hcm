"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { collectInvalid, type CheckableControl } from "./validation";

// A <form> that shows problems under each input instead of the browser's
// popup bubbles: on submit it runs the built-in checks (required, email,
// min…), blocks the submit if any fail and focuses the first bad field.
// Server-side field errors (FormState.fieldErrors) show the same way and
// also focus their first field. A field's message clears as soon as it's
// edited. A submit button with formNoValidate skips the checks.

type Errors = Record<string, string[] | undefined>;
type Context = { errors: Errors; clear: (name: string) => void };
const FormErrorsContext = createContext<Context>({ errors: {}, clear: () => {} });

export function useFieldError(name: string): string | undefined {
  return useContext(FormErrorsContext).errors[name]?.[0];
}

/** For controls that write a hidden input (rich-text editors): clear on edit. */
export function useClearFieldError(): (name: string) => void {
  return useContext(FormErrorsContext).clear;
}

type Props = Omit<React.ComponentProps<"form">, "noValidate"> & {
  fieldErrors?: Record<string, string[]>;
};

function focusField(form: HTMLFormElement | null, name: string | undefined) {
  if (!form || !name) return;
  const target = form.elements.namedItem(name);
  const element = (target instanceof RadioNodeList ? target[0] : target) as HTMLElement | null;
  // Hidden inputs (editors, comboboxes) can't take focus: bring the
  // message into view instead.
  if (element && !(element instanceof HTMLInputElement && element.type === "hidden")) {
    element.focus?.();
    element.scrollIntoView?.({ block: "center" });
    return;
  }
  form.querySelector('[role="alert"]')?.scrollIntoView?.({ block: "center" });
}

export function ValidatedForm({ fieldErrors, onSubmit, onInput, onChange, children, ref, ...props }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  // Keep our ref and the caller's (e.g. to requestSubmit on file pick).
  const setRef = (node: HTMLFormElement | null) => {
    formRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  const [clientErrors, setClientErrors] = useState<Errors>({});
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  // New server errors (a new object) show again even for fields the user
  // edited before the last submit.
  const [lastServer, setLastServer] = useState(fieldErrors);
  if (fieldErrors !== lastServer) {
    setLastServer(fieldErrors);
    setCleared(new Set());
  }

  useEffect(() => {
    if (fieldErrors) focusField(formRef.current, Object.keys(fieldErrors)[0]);
  }, [fieldErrors]);

  const errors: Errors = {};
  for (const [name, messages] of Object.entries(fieldErrors ?? {})) if (!cleared.has(name)) errors[name] = messages;
  for (const [name, messages] of Object.entries(clientErrors)) if (messages && !cleared.has(name)) errors[name] = messages;

  function clear(name: string) {
    if (name && errors[name]) setCleared((current) => new Set(current).add(name));
  }
  const onEdit = (event: React.FormEvent<HTMLFormElement>) => clear((event.target as HTMLInputElement).name);

  return (
    <FormErrorsContext.Provider value={{ errors, clear }}>
      <form
        {...props}
        ref={setRef}
        noValidate
        onInput={(event) => {
          onEdit(event);
          onInput?.(event);
        }}
        onChange={(event) => {
          onEdit(event);
          onChange?.(event);
        }}
        onSubmit={(event) => {
          const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          if (submitter?.formNoValidate) {
            setClientErrors({});
            onSubmit?.(event);
            return;
          }
          const form = event.currentTarget;
          const controls = Array.from(form.elements) as unknown as CheckableControl[];
          const invalid = collectInvalid(controls);
          setClientErrors(invalid);
          setCleared(new Set());
          const first = Object.keys(invalid)[0];
          if (first) {
            event.preventDefault();
            focusField(form, first);
            return;
          }
          onSubmit?.(event);
        }}
      >
        {children}
      </form>
    </FormErrorsContext.Provider>
  );
}
