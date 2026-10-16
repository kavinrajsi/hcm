import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ appSetting: { upsert: vi.fn(), deleteMany: vi.fn() } }));
const email = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  currentEmailTransport: vi.fn(),
  isTransportReady: vi.fn(),
  getSmtpSettings: vi.fn(),
  getEmailRouting: vi.fn(),
}));
const catalog = vi.hoisted(() => [
  { key: "invite", name: "Account invite" },
  { key: "probation-digest", name: "Probation confirmations overdue" },
  { key: "device-request", name: "Device request to vendor" },
]);
vi.mock("@/lib/email-catalog", () => ({ emailCatalog: async () => catalog }));
const blob = vi.hoisted(() => ({ uploadDocument: vi.fn(), deleteDocument: vi.fn() }));
vi.mock("@/lib/blob", () => blob);
const getSignature = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email-signature", () => ({ EMAIL_SIGNATURE_SETTING: "emailSignature", getSignature }));
const requireRole = vi.hoisted(() => vi.fn());
const encryptField = vi.hoisted(() => vi.fn((plain: string) => `enc(${plain.length})`));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/crypto", () => ({ encryptField }));
vi.mock("@/lib/email", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/email")>()), ...email }));
vi.mock("@/lib/rbac", () => ({ requireRole }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { removeSmtpSettings, saveEmailRouting, saveEmailTransport, saveSignature, saveSmtpSettings, sendTestEmail } =
  await import("./actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const SMTP_FORM = {
  host: "smtp.zoho.com",
  port: "465",
  username: "noreply@madarth.com",
  password: "app-pass",
  fromAddress: "noreply@madarth.com",
  fromName: "HCM",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireRole.mockResolvedValue({ id: "hr1", email: "hr@madarth.com" });
  email.isTransportReady.mockResolvedValue(true);
  email.currentEmailTransport.mockResolvedValue("smtp");
  email.getSmtpSettings.mockResolvedValue(null);
  email.getEmailRouting.mockResolvedValue({});
  getSignature.mockResolvedValue({ logoPathname: null });
  blob.uploadDocument.mockResolvedValue("email/signature-logo-new.png");
  blob.deleteDocument.mockResolvedValue(undefined);
  email.sendEmail.mockResolvedValue({ skipped: false, id: "m1" });
});

describe("saveEmailTransport", () => {
  it("is HR-only", async () => {
    await saveEmailTransport({}, form({ transport: "smtp" }));
    expect(requireRole).toHaveBeenCalledWith("HR_ADMIN");
  });

  it("saves the choice with who changed it", async () => {
    const state = await saveEmailTransport({}, form({ transport: "smtp" }));
    expect(db.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: "emailTransport" },
      create: { key: "emailTransport", value: { transport: "smtp" }, updatedById: "hr1" },
      update: { value: { transport: "smtp" }, updatedById: "hr1" },
    });
    expect(state.ok).toBe("Saved. HCM now sends email through SMTP.");
  });

  it("won't switch to SMTP before its details are saved", async () => {
    email.isTransportReady.mockResolvedValue(false);
    const state = await saveEmailTransport({}, form({ transport: "smtp" }));
    expect(state.fieldErrors?.transport?.[0]).toBe("Add the SMTP details first.");
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown service", async () => {
    const state = await saveEmailTransport({}, form({ transport: "gmail" }));
    expect(state.fieldErrors?.transport).toBeDefined();
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });
});

describe("saveSmtpSettings", () => {
  it("is HR-only", async () => {
    await saveSmtpSettings({}, form(SMTP_FORM));
    expect(requireRole).toHaveBeenCalledWith("HR_ADMIN");
  });

  it("stores the password encrypted, never as typed", async () => {
    expect((await saveSmtpSettings({}, form(SMTP_FORM))).ok).toBe("Saved.");
    expect(encryptField).toHaveBeenCalledWith("app-pass");
    const value = {
      host: "smtp.zoho.com",
      port: 465,
      username: "noreply@madarth.com",
      fromAddress: "noreply@madarth.com",
      fromName: "HCM",
      passwordEncrypted: "enc(8)",
    };
    expect(db.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: "emailSmtp" },
      create: { key: "emailSmtp", value, updatedById: "hr1" },
      update: { value, updatedById: "hr1" },
    });
    expect(JSON.stringify(db.appSetting.upsert.mock.calls)).not.toContain("app-pass");
  });

  it("keeps the saved password when the field is left blank", async () => {
    email.getSmtpSettings.mockResolvedValue({ passwordEncrypted: "k1:old" });
    await saveSmtpSettings({}, form({ ...SMTP_FORM, password: "", host: "smtp.zoho.in" }));
    expect(encryptField).not.toHaveBeenCalled();
    expect(db.appSetting.upsert.mock.calls[0][0].update.value).toMatchObject({ host: "smtp.zoho.in", passwordEncrypted: "k1:old" });
  });

  it("needs a password the first time", async () => {
    const state = await saveSmtpSettings({}, form({ ...SMTP_FORM, password: "" }));
    expect(state.fieldErrors?.password).toBeDefined();
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("checks the port and From address", async () => {
    const state = await saveSmtpSettings({}, form({ ...SMTP_FORM, port: "70000", fromAddress: "nope" }));
    expect(Object.keys(state.fieldErrors ?? {}).sort()).toEqual(["fromAddress", "port"]);
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });
});

describe("saveEmailRouting", () => {
  const routes = (values: Record<string, string>) =>
    form(Object.fromEntries(Object.entries(values).map(([key, value]) => [`route.${key}`, value])));

  it("is HR-only", async () => {
    await saveEmailRouting({}, routes({}));
    expect(requireRole).toHaveBeenCalledWith("HR_ADMIN");
  });

  it("stores only the overrides, with who changed them", async () => {
    const state = await saveEmailRouting(
      {},
      routes({ invite: "default", "probation-digest": "off", "device-request": "smtp" }),
    );
    expect(state.ok).toBe("Saved.");
    const value = { "probation-digest": "off", "device-request": "smtp" };
    expect(db.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: "emailRouting" },
      create: { key: "emailRouting", value, updatedById: "hr1" },
      update: { value, updatedById: "hr1" },
    });
  });

  it("allows turning off sign-in emails", async () => {
    await saveEmailRouting({}, routes({ invite: "off" }));
    expect(db.appSetting.upsert.mock.calls[0][0].update.value).toEqual({ invite: "off" });
  });

  it("won't route an email to SMTP before it's set up", async () => {
    email.isTransportReady.mockImplementation(async (transport: string) => transport !== "smtp");
    const state = await saveEmailRouting({}, routes({ "device-request": "smtp", invite: "off" }));
    expect(state.fieldErrors).toEqual({ "route.device-request": ["Add the SMTP details first."] });
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown choice", async () => {
    const state = await saveEmailRouting({}, routes({ invite: "gmail" }));
    expect(state.fieldErrors?.["route.invite"]).toBeDefined();
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });
});

describe("saveSignature", () => {
  const SIGNATURE = {
    enabled: "on",
    closing: " Regards, ",
    name: " Madarth's System Email ",
    website: "www.madarth.com",
    address: "#4, Alamelumangapuram,\nMylapore Chennai 4",
  };
  const withLogo = (file: File) => {
    const data = form(SIGNATURE);
    data.set("logo", file);
    return data;
  };
  const png = (bytes: number) => new File([new Uint8Array(bytes)], "logo.png", { type: "image/png" });

  it("is HR-only", async () => {
    await saveSignature({}, form(SIGNATURE));
    expect(requireRole).toHaveBeenCalledWith("HR_ADMIN");
  });

  it("saves the trimmed text and keeps the current logo", async () => {
    getSignature.mockResolvedValue({ logoPathname: "email/signature-logo-old.png" });
    expect((await saveSignature({}, form(SIGNATURE))).ok).toBe("Saved.");
    const value = {
      enabled: true,
      closing: "Regards,",
      name: "Madarth's System Email",
      website: "www.madarth.com",
      address: "#4, Alamelumangapuram,\nMylapore Chennai 4",
      logoPathname: "email/signature-logo-old.png",
    };
    expect(db.appSetting.upsert).toHaveBeenCalledWith({
      where: { key: "emailSignature" },
      create: { key: "emailSignature", value, updatedById: "hr1" },
      update: { value, updatedById: "hr1" },
    });
    expect(blob.uploadDocument).not.toHaveBeenCalled();
    expect(blob.deleteDocument).not.toHaveBeenCalled();
  });

  it("turns the signature off when the box is unticked", async () => {
    await saveSignature({}, form({ ...SIGNATURE, enabled: "" }));
    expect(db.appSetting.upsert.mock.calls[0][0].update.value.enabled).toBe(false);
  });

  it("uploads a new logo and removes the old one", async () => {
    getSignature.mockResolvedValue({ logoPathname: "email/signature-logo-old.png" });
    await saveSignature({}, withLogo(png(10_000)));
    expect(blob.uploadDocument).toHaveBeenCalledWith("email/signature-logo.png", expect.any(File));
    expect(db.appSetting.upsert.mock.calls[0][0].update.value.logoPathname).toBe("email/signature-logo-new.png");
    expect(blob.deleteDocument).toHaveBeenCalledWith("email/signature-logo-old.png");
  });

  it("goes back to the default logo", async () => {
    getSignature.mockResolvedValue({ logoPathname: "email/signature-logo-old.png" });
    const data = form({ ...SIGNATURE, defaultLogo: "on" });
    await saveSignature({}, data);
    expect(db.appSetting.upsert.mock.calls[0][0].update.value.logoPathname).toBeNull();
    expect(blob.deleteDocument).toHaveBeenCalledWith("email/signature-logo-old.png");
  });

  it("rejects big files and non-images", async () => {
    expect((await saveSignature({}, withLogo(png(2 * 1024 * 1024)))).fieldErrors?.logo?.[0]).toBe(
      "Keep the logo under 300 KB.",
    );
    const gif = new File(["x"], "logo.gif", { type: "image/gif" });
    expect((await saveSignature({}, withLogo(gif))).fieldErrors?.logo?.[0]).toBe("Use a PNG or JPG image.");
    expect(blob.uploadDocument).not.toHaveBeenCalled();
    expect(db.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("caps long text", async () => {
    const state = await saveSignature({}, form({ ...SIGNATURE, name: "x".repeat(81) }));
    expect(state.fieldErrors?.name).toBeDefined();
  });
});

describe("removeSmtpSettings", () => {
  it("refuses while SMTP is sending", async () => {
    expect((await removeSmtpSettings()).error).toContain("Switch to ZeptoMail first");
    expect(db.appSetting.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses while an email is set to SMTP", async () => {
    email.currentEmailTransport.mockResolvedValue("zeptomail");
    email.getEmailRouting.mockResolvedValue({ "device-request": "smtp", invite: "off" });
    expect((await removeSmtpSettings()).error).toBe(
      "These emails are set to SMTP: Device request to vendor. Change them first.",
    );
    expect(db.appSetting.deleteMany).not.toHaveBeenCalled();
  });

  it("removes the details otherwise", async () => {
    email.currentEmailTransport.mockResolvedValue("zeptomail");
    expect((await removeSmtpSettings()).ok).toBe("Removed.");
    expect(db.appSetting.deleteMany).toHaveBeenCalledWith({ where: { key: "emailSmtp" } });
  });
});

describe("sendTestEmail", () => {
  it("sends a test to the signed-in admin through the saved service", async () => {
    const state = await sendTestEmail();
    expect(email.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "test", to: "hr@madarth.com", sentById: "hr1", subject: "HCM test email via SMTP" }),
    );
    expect(state.ok).toBe("Test email sent to hr@madarth.com through SMTP.");
  });

  it("says why when nothing was sent", async () => {
    email.sendEmail.mockResolvedValue({ skipped: true, reason: "SMTP isn't set up." });
    expect((await sendTestEmail()).error).toBe("SMTP isn't set up.");
  });

  it("shows the server's error text", async () => {
    email.sendEmail.mockRejectedValue(new Error("Email send failed: 535 Authentication Failed"));
    expect((await sendTestEmail()).error).toBe("Email send failed: 535 Authentication Failed");
  });
});
