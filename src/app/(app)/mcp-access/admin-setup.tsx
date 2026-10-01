import { GuideShot } from "@/components/guide-shot";
import { ALL_GUIDE_SHOTS, GUIDE_SHOTS, shotPath } from "@/lib/mcp-guide";
import { ShotChecklist } from "./shot-checklist";

export const PRODUCTION_URL = "https://connect.madarth.com";

// HR: the one-time server setting AI apps depend on (AUTH_URL), checked
// live, plus which guide screenshots are still missing.
export function AdminSetup({ authUrl }: { authUrl: string | undefined }) {
  const current = authUrl?.replace(/\/$/, "");
  const ok = current === PRODUCTION_URL;
  const steps = [
    <>
      Sign in to <strong>vercel.com</strong>, open the <strong>hcm</strong> project, then{" "}
      <strong>Settings → Environment Variables</strong>. Find <code>AUTH_URL</code>.
    </>,
    <>
      Click ⋯ → <strong>Edit</strong> on the <strong>Production</strong> value. Set it to exactly{" "}
      <code>{PRODUCTION_URL}</code>: https, no slash at the end. Click <strong>Save</strong>.
    </>,
    <>
      Settings only apply to new deployments. Open <strong>Deployments</strong>, click ⋯ on the latest{" "}
      <strong>Production</strong> one, and choose <strong>Redeploy</strong>.
    </>,
    <>
      When it&apos;s ready, open{" "}
      <a className="underline" href={`${PRODUCTION_URL}/.well-known/oauth-authorization-server`} target="_blank" rel="noreferrer">
        the check link
      </a>
      . <code>issuer</code> must read <code>{PRODUCTION_URL}</code>. Then reload this page: the status above turns green.
    </>,
  ];
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold">Admin setup</h2>
      <p
        className={`mt-2 rounded-lg px-3 py-2 text-sm ${
          ok
            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
            : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        }`}
      >
        {ok ? (
          <>
            AUTH_URL is <code>{current}</code>. AI apps can sign in.
          </>
        ) : (
          <>
            AUTH_URL is <code>{current || "not set"}</code> here; production needs <code>{PRODUCTION_URL}</code>. Follow
            the steps below.
          </>
        )}
      </p>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        AI apps find HCM&apos;s sign-in through AUTH_URL. If it doesn&apos;t match the address people use, Claude and
        ChatGPT fail with a sign-in error. Only needed once, or if the domain changes.
      </p>
      <ol className="mt-3 list-decimal space-y-4 pl-5 text-sm">
        {steps.map((text, index) => (
          <li key={index}>
            {text}
            <GuideShot src={shotPath(GUIDE_SHOTS.admin[index].file)} caption={GUIDE_SHOTS.admin[index].caption} step={index + 1} />
          </li>
        ))}
      </ol>
      <h3 className="mt-6 text-sm font-semibold">Guide screenshots</h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Save each screenshot as a PNG with the name shown into <code>public/mcp-guide/</code> in the code, then deploy.
        Missing ones are hidden from the guide.
      </p>
      <ShotChecklist shots={ALL_GUIDE_SHOTS.map((shot) => ({ ...shot, src: shotPath(shot.file) }))} />
    </section>
  );
}
