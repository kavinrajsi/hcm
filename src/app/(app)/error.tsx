"use client";

import { Button } from "@/components/ui/button";

// Catches AuthorizationError (and anything else) thrown from pages/actions.
// Message text is sanitized in production, so keep the copy generic.
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
      <h1 className="text-xl font-semibold">Not available</h1>
      <p className="text-sm text-zinc-500">
        You may not have access to this page, or something went wrong.
      </p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
