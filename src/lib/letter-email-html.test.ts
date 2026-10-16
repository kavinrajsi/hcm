import { describe, expect, it } from "vitest";
import { SIGNATURE_SLOT } from "./email-template";
import { letterEmailHtml, withoutOldSignOff } from "./letter-email-html";

describe("withoutOldSignOff", () => {
  it("drops a trailing Regards, HR Team in its usual shapes", () => {
    for (const ending of ["<p>Regards,<br/>HR Team</p>", "<p>Regards,<br>HR Team</p>\n", "<p> Regards <br /> <br/>HR Team.</p>"])
      expect(withoutOldSignOff(`<p>Dear Asha,</p>\n${ending}`)).toBe("<p>Dear Asha,</p>");
  });

  it("leaves one in the middle, and other sign-offs, alone", () => {
    const middle = "<p>Regards,<br/>HR Team</p><p>PS: welcome!</p>";
    expect(withoutOldSignOff(middle)).toBe(middle);
    expect(withoutOldSignOff("<p>Thanks,<br/>Finance</p>")).toBe("<p>Thanks,<br/>Finance</p>");
  });
});

describe("letterEmailHtml", () => {
  it("leaves the slot for sendEmail, or fills it for the editor preview", () => {
    expect(letterEmailHtml("Offer", "<p>Hi</p>")).toContain(SIGNATURE_SLOT);
    const preview = letterEmailHtml("Offer", "<p>Hi</p><p>Regards,<br/>HR Team</p>", "<p>SIGNED</p>");
    expect(preview).toContain("<p>SIGNED</p>");
    expect(preview).not.toContain(SIGNATURE_SLOT);
    expect(preview).not.toContain("HR Team");
  });
});
