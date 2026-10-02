import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "No access" };

// Rendered (with a 403) when a signed-in user opens a page their role can't
// see — requirePageRole calls forbidden() instead of throwing an error.
export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">No access</h1>
      <p className="text-sm text-zinc-500">
        Your role can&rsquo;t open this page. Ask HR if you need it.
      </p>
      <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
        Back to the dashboard
      </Button>
    </main>
  );
}
