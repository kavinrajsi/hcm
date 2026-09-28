import { renderEmail } from "@/lib/email-template";

// The full branded HTML of a letter email. Shared by the sender
// (letterEmail) and the editor's Preview tab so they can't drift apart.
export function letterEmailHtml(subject: string, bodyHtml: string): string {
  return renderEmail({ preheader: subject, heading: subject, body: bodyHtml });
}
