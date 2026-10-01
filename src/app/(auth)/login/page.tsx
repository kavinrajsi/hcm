import { redirect } from "next/navigation";
import { currentUser } from "@/lib/rbac";
import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { safeCallbackPath } from "@/lib/safe-redirect";

export const metadata = { title: "Sign in" };

async function credentialsSignIn(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeCallbackPath(formData.get("callbackUrl")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const back = safeCallbackPath(formData.get("callbackUrl"));
      redirect(
        `/login?error=invalid${back !== "/" ? `&callbackUrl=${encodeURIComponent(back)}` : ""}`,
      );
    }
    throw error;
  }
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Only an active account skips the login form; a disabled one keeps its
  // cookie but must not bounce between here and the app.
  const { error, callbackUrl } = await searchParams;
  // Where to go after signing in, e.g. back to a scanned device label.
  const back = safeCallbackPath(callbackUrl);
  if (await currentUser()) redirect(back);

  const inputClass =
    "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <main className="flex flex-1 items-center justify-center px-4 md:px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">HCM</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Sign in with your email and password.
        </p>

        <form action={credentialsSignIn} className="mt-8 flex flex-col gap-3">
          <input type="hidden" name="callbackUrl" value={back} />
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            autoComplete="email"
            className={inputClass}
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Password"
            autoComplete="current-password"
            className={inputClass}
          />
          {error === "invalid" && (
            <p className="text-sm text-red-600">Invalid email or password.</p>
          )}
          <p className="text-right text-xs">
            <a
              href="/forgot-password"
              className="inline-block py-2 text-zinc-500 underline underline-offset-4 hover:text-zinc-900 md:py-0 dark:hover:text-zinc-100"
            >
              Forgot password?
            </a>
          </p>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
