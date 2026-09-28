import { describe, expect, it } from "vitest";
import {
  exitClearanceEmail,
  inviteEmail,
  letterEmail,
  probationReminderEmail,
  resetEmail,
} from "./emails";
import { escapeHtml, renderEmail } from "./email-template";

describe("escapeHtml", () => {
  it("escapes markup characters", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;",
    );
  });
});

describe("renderEmail", () => {
  it("renders the button and a copyable fallback link", () => {
    const html = renderEmail({
      preheader: "p",
      heading: "Hi",
      body: "Body",
      button: { label: "Go", url: "https://app/x?a=1&b=2" },
    });
    expect(html).toContain('href="https://app/x?a=1&amp;b=2"');
    expect(html).toContain("Button not working?");
    expect(html).toContain("HCM · Madarth");
  });
});

describe("inviteEmail", () => {
  it("greets by first name and carries the link and sign-in email", () => {
    const email = inviteEmail({
      name: "Asha Rao",
      email: "asha@madarth.com",
      link: "https://app/reset-password?token=t&invite=1",
    });
    expect(email.subject).toMatch(/set your password/i);
    expect(email.html).toContain("Hi Asha,");
    expect(email.html).toContain("asha@madarth.com");
    expect(email.html).toContain("Set your password");
    expect(email.html).toContain("expires in 7 days");
  });

  it("escapes a hostile name", () => {
    const email = inviteEmail({
      name: "<script>x</script>",
      email: "a@x.com",
      link: "https://app/l",
    });
    expect(email.html).not.toContain("<script>");
  });
});

describe("resetEmail", () => {
  it("says the link expires in 1 hour", () => {
    const email = resetEmail({ link: "https://app/reset-password?token=t" });
    expect(email.subject).toBe("Reset your HCM password");
    expect(email.html).toContain("expires in 1 hour");
  });
});

describe("exitClearanceEmail", () => {
  it("lists the checklist with a readable date and escapes the name", () => {
    const email = exitClearanceEmail({
      name: "Ravi <K>",
      empId: "E7",
      dateOfExit: "2026-10-31",
    });
    expect(email.subject).toBe("Exit clearance — Ravi <K> (E7)");
    expect(email.html).toContain("31 October 2026");
    expect(email.html).toContain("Return your ID card");
    expect(email.html).not.toContain("<K>");
  });
});

describe("probationReminderEmail", () => {
  it("lists each person, flags extensions and pluralises the subject", () => {
    const email = probationReminderEmail({
      rows: [
        { name: "A", empId: "E1", dueDate: "2026-10-05", status: "PENDING" },
        { name: "B", empId: "E2", dueDate: "2026-10-09", status: "EXTENDED" },
      ],
    });
    expect(email.subject).toBe("2 probation confirmations due soon");
    expect(email.html).toContain("5 October 2026");
    expect(email.html).toContain("(extended)");
    expect(email.html).toContain("/probation");
  });

  it("uses the singular for one person", () => {
    expect(
      probationReminderEmail({
        rows: [
          { name: "A", empId: "E1", dueDate: "2026-10-05", status: "PENDING" },
        ],
      }).subject,
    ).toBe("1 probation confirmation due soon");
  });
});

describe("letterEmail", () => {
  it("keeps the HR-written letter body as-is inside the frame", () => {
    const email = letterEmail({
      subject: "Offer letter",
      bodyHtml: "<p>Dear Asha, <strong>welcome</strong>.</p>",
    });
    expect(email.subject).toBe("Offer letter");
    expect(email.html).toContain("<p>Dear Asha, <strong>welcome</strong>.</p>");
  });
});
