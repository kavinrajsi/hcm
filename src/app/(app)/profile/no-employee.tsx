/** Shown on Profile pages that need an employee record HR hasn't linked. */
export function NoEmployeeRecord({ email }: { email: string }) {
  return (
    <p className="mt-4 rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
      No employee record is linked to {email}. Ask HR to set your work email on
      your employee record.
    </p>
  );
}
