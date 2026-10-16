import { beforeEach, describe, expect, it, vi } from "vitest";

const readDocument = vi.hoisted(() => vi.fn());
const getSignature = vi.hoisted(() => vi.fn());
vi.mock("@/lib/blob", () => ({ readDocument }));
vi.mock("@/lib/email-signature", () => ({ DEFAULT_LOGO_PATH: "/email/madarth-logo.png", getSignature }));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_URL", "https://connect.madarth.com");
});

describe("GET /api/email-logo", () => {
  it("serves HR's logo publicly with a day's caching", async () => {
    getSignature.mockResolvedValue({ logoPathname: "email/signature-logo-a1.png" });
    readDocument.mockResolvedValue({ stream: new Blob(["png"]).stream(), headers: new Headers({ "content-type": "image/png" }) });
    const response = await GET();
    expect(readDocument).toHaveBeenCalledWith("email/signature-logo-a1.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(await response.text()).toBe("png");
  });

  it("sends mail clients to the default logo when none is uploaded", async () => {
    getSignature.mockResolvedValue({ logoPathname: null });
    const response = await GET();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://connect.madarth.com/email/madarth-logo.png");
    expect(readDocument).not.toHaveBeenCalled();
  });

  it("falls back to the default if the upload is gone", async () => {
    getSignature.mockResolvedValue({ logoPathname: "email/missing.png" });
    readDocument.mockRejectedValue(new Error("not found"));
    expect((await GET()).status).toBe(302);
  });
});
