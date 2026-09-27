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
    expect(html).toContain("HRM · Madarth");
  });
});

describe("inviteEmail", () => {
  it("greets by first name and carries the link and sign-in email", () => {
    const e = inviteEmail({
      name: "Asha Rao",
      email: "asha@madarth.com",
      link: "https://app/reset-password?token=t&invite=1",
    });
    expect(e.subject).toMatch(/set your password/i);
    expect(e.html).toContain("Hi Asha,");
    expect(e.html).toContain("asha@madarth.com");
    expect(e.html).toContain("Set your password");
    expect(e.html).toContain("expires in 7 days");
  });

  it("escapes a hostile name", () => {
    const e = inviteEmail({
      name: "<script>x</script>",
      email: "a@x.com",
      link: "https://app/l",
    });
    expect(e.html).not.toContain("<script>");
  });
});

describe("resetEmail", () => {
  it("says the link expires in 1 hour", () => {
    const e = resetEmail({ link: "https://app/reset-password?token=t" });
    expect(e.subject).toBe("Reset your HRM password");
    expect(e.html).toContain("expires in 1 hour");
  });
});

describe("exitClearanceEmail", () => {
  it("lists the checklist with a readable date and escapes the name", () => {
    const e = exitClearanceEmail({
      name: "Ravi <K>",
      empId: "E7",
      dateOfExit: "2026-10-31",
    });
    expect(e.subject).toBe("Exit clearance — Ravi <K> (E7)");
    expect(e.html).toContain("31 October 2026");
    expect(e.html).toContain("Return your ID card");
    expect(e.html).not.toContain("<K>");
  });
});

describe("probationReminderEmail", () => {
  it("lists each person, flags extensions and pluralises the subject", () => {
    const e = probationReminderEmail({
      rows: [
        { name: "A", empId: "E1", dueDate: "2026-10-05", status: "PENDING" },
        { name: "B", empId: "E2", dueDate: "2026-10-09", status: "EXTENDED" },
      ],
    });
    expect(e.subject).toBe("2 probation confirmations due soon");
    expect(e.html).toContain("5 October 2026");
    expect(e.html).toContain("(extended)");
    expect(e.html).toContain("/probation");
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
    const e = letterEmail({
      subject: "Offer letter",
      bodyHtml: "<p>Dear Asha, <strong>welcome</strong>.</p>",
    });
    expect(e.subject).toBe("Offer letter");
    expect(e.html).toContain("<p>Dear Asha, <strong>welcome</strong>.</p>");
  });
});
