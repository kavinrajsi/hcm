import { requirePageRole } from "@/lib/rbac";
import { emailCatalog, type CatalogEmail } from "@/lib/email-catalog";
import { emailTransportStatus, getEmailRouting, getSmtpSettings } from "@/lib/email";
import { PageHeader, PageShell } from "@/components/page";
import { EmailRoutingForm } from "./email-routing-form";
import { EmailTransportForm } from "./email-transport-form";
import { SmtpSettingsForm } from "./smtp-settings-form";
import { SignatureForm } from "./signature-form";
import { getSignature, logoPath } from "@/lib/email-signature";

export const metadata = { title: "Email templates" };

const GROUPS: CatalogEmail["group"][] = ["Accounts", "Employees", "Reminders", "Letters", "Devices"];

// HR: which service sends HCM's email by default (and the SMTP details),
// and every email HCM sends: when it goes out, to whom, and how it's sent
// (default, another service, or not at all). Each opens a preview built by
// the real template with sample data.
export default async function EmailTemplatesPage() {
  await requirePageRole("HR_ADMIN");
  const emails = await emailCatalog();
  const subjects = await Promise.all(emails.map((email) => email.render().then((rendered) => rendered.subject)));
  const subjectOf = new Map(emails.map((email, index) => [email.key, subjects[index]]));
  const [status, smtp, routing, signature] = await Promise.all([
    emailTransportStatus(),
    getSmtpSettings(),
    getEmailRouting(),
    getSignature(),
  ]);
  // Relative, so the preview loads from whichever host HR is on.
  const savedLogoSrc = logoPath(signature);
  // Only what the form shows: never the encrypted password.
  const smtpValues = smtp && {
    host: smtp.host,
    port: smtp.port,
    username: smtp.username,
    fromAddress: smtp.fromAddress,
    fromName: smtp.fromName,
    hasPassword: true,
  };

  return (
    <PageShell width="md">
      <PageHeader
        title="Email templates"
        description={`All ${emails.length} emails HCM sends, when they go out, who gets them and how they're sent. Open one to preview it.`}
      />
      <div className="mt-6 flex flex-col gap-8">
        <section>
          <h2 className="text-base font-semibold">Sending service</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            The default for every email below. Override one on its row, or switch here if a service stops working.
          </p>
          <div className="mt-3">
            <EmailTransportForm transport={status.transport} configured={status.configured} />
          </div>
        </section>
        <section>
          <h2 className="text-base font-semibold">SMTP details</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Used only when SMTP is the sending service. The password is stored encrypted and never shown again.
          </p>
          <div className="mt-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <SmtpSettingsForm saved={smtpValues} />
          </div>
        </section>
        <section>
          <h2 className="text-base font-semibold">Signature</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Every email below ends with this. Letters no longer need their own sign-off.
          </p>
          <div className="mt-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <SignatureForm saved={signature} savedLogoSrc={savedLogoSrc} />
          </div>
        </section>
        <EmailRoutingForm
          rows={emails.map((email) => ({
            key: email.key,
            name: email.name,
            group: email.group,
            trigger: email.trigger,
            to: email.to,
            cc: email.cc,
            subject: subjectOf.get(email.key) ?? "",
          }))}
          groups={GROUPS}
          routing={routing}
          defaultTransport={status.transport}
          configured={status.configured}
        />
      </div>
    </PageShell>
  );
}
