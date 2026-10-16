import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderEmail, SIGNATURE_SLOT } from "./email-template";
import { DEFAULT_SIGNATURE, fillSignature, logoUrl, readSignature, signatureHtml } from "./email-signature-html";

beforeEach(() => {
  vi.stubEnv("AUTH_URL", "https://connect.madarth.com");
});

describe("readSignature", () => {
  it("starts with Kavinraj's sign-off and the Madarth logo", () => {
    expect(readSignature(undefined)).toEqual(DEFAULT_SIGNATURE);
    expect(DEFAULT_SIGNATURE).toMatchObject({
      enabled: true,
      closing: "Regards,",
      name: "Kavinraj Ilangovan",
      website: "www.madarth.com",
      address: "#4, Alamelumangapuram,\nMylapore Chennai 4",
      logoPathname: null,
    });
  });

  it("keeps saved values, trimmed, and fills gaps from the defaults", () => {
    expect(readSignature({ enabled: false, name: "  Asha  ", website: "" })).toEqual({
      ...DEFAULT_SIGNATURE,
      enabled: false,
      name: "Asha",
      website: "",
    });
    expect(readSignature({ logoPathname: "email/logo-abc.png" }).logoPathname).toBe("email/logo-abc.png");
  });
});

describe("signatureHtml", () => {
  it("shows the closing, name, website link, address lines and logo", () => {
    const html = signatureHtml(DEFAULT_SIGNATURE);
    expect(html).toContain("Regards,<br>Kavinraj Ilangovan");
    expect(html).toContain('href="https://www.madarth.com"');
    expect(html).toContain(">www.madarth.com</a>");
    expect(html).toContain("#4, Alamelumangapuram,<br>Mylapore Chennai 4");
    expect(html).toContain('src="https://connect.madarth.com/email/madarth-logo.png"');
    expect(html).toContain('alt="Madarth"');
  });

  it("escapes what HR types", () => {
    const html = signatureHtml({ ...DEFAULT_SIGNATURE, name: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps a website that already has a scheme", () => {
    expect(signatureHtml({ ...DEFAULT_SIGNATURE, website: "http://madarth.com" })).toContain('href="http://madarth.com"');
  });

  it("leaves out empty lines", () => {
    const html = signatureHtml({ ...DEFAULT_SIGNATURE, website: "", address: "" });
    expect(html).not.toContain("website");
    expect(html).not.toContain("address");
  });

  it("is empty when turned off", () => {
    expect(signatureHtml({ ...DEFAULT_SIGNATURE, enabled: false })).toBe("");
  });

  it("uses HR's uploaded logo through the public route, and a preview src when given", () => {
    expect(logoUrl({ logoPathname: "email/signature-logo-Xy12.png" })).toBe(
      "https://connect.madarth.com/api/email-logo?v=ogo-Xy12.png",
    );
    expect(signatureHtml(DEFAULT_SIGNATURE, { logoSrc: "blob:abc" })).toContain('src="blob:abc"');
  });
});

describe("the signature slot", () => {
  it("appears once in every rendered email", () => {
    const html = renderEmail({ preheader: "P", heading: "H", body: "B" });
    expect(html.split(SIGNATURE_SLOT)).toHaveLength(2);
  });

  it("is filled with the signature, or removed when it's off", () => {
    const html = renderEmail({ preheader: "P", heading: "H", body: "B" });
    expect(fillSignature(html, DEFAULT_SIGNATURE)).toContain("Kavinraj Ilangovan");
    const off = fillSignature(html, { ...DEFAULT_SIGNATURE, enabled: false });
    expect(off).not.toContain(SIGNATURE_SLOT);
    expect(off).not.toContain("Kavinraj");
  });
});
