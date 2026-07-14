import Link from "next/link";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { token } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Reset password
        </h1>
        {typeof token === "string" && token ? (
          <div className="mt-8">
            <ResetForm token={token} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            This reset link is missing its token.{" "}
            <Link
              href="/forgot-password"
              className="underline underline-offset-4"
            >
              Request a new one
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}
