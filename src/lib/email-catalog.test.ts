import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  appSetting: { findUnique: vi.fn().mockResolvedValue(null) },
  letterTemplate: { findUnique: vi.fn().mockResolvedValue(null) },
}));
vi.mock("@/lib/db", () => ({ db }));

const { emailCatalog, catalogEmail } = await import("./email-catalog");

describe("email catalogue", () => {
  it("lists every email with a unique key, and each renders", async () => {
    const emails = await emailCatalog();
    expect(new Set(emails.map((email) => email.key)).size).toBe(emails.length);
    expect(emails.map((email) => email.key)).toEqual(
      expect.arrayContaining(["invite", "reset", "type-change", "exit-clearance", "probation-digest", "ending-soon", "letter-offer", "device-request"]),
    );
    for (const email of emails) {
      const rendered = await email.render();
      expect(rendered.subject, email.key).toBeTruthy();
      expect(rendered.html, email.key).toContain("<html");
    }
  });

  it("shows the vendor email's real CC and reply-to defaults", async () => {
    const email = await catalogEmail("device-request");
    expect(email?.cc).toBe("admin@madarth.com, hr@madarth.com, finance@madarth.com");
    expect(email?.replyTo).toBe("admin@madarth.com");
    expect(await catalogEmail("nope")).toBeNull();
  });

  it("fills letter placeholders with the sample employee", async () => {
    const rendered = await (await catalogEmail("letter-offer"))!.render();
    expect(rendered.subject).toBe("Offer of Employment — Asha Rao");
    expect(rendered.html).not.toContain("{{");
  });
});
