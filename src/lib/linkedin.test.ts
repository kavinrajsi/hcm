import { describe, expect, it } from "vitest";
import { LINKEDIN_ID, linkedinIdFrom, linkedinUrl } from "./linkedin";

describe("linkedinIdFrom", () => {
  it("keeps a bare ID", () => {
    expect(linkedinIdFrom("kavinrajsi")).toBe("kavinrajsi");
    expect(linkedinIdFrom("  kavinrajsi  ")).toBe("kavinrajsi");
  });

  it("takes the ID out of a pasted profile link", () => {
    expect(linkedinIdFrom("https://www.linkedin.com/in/kavinrajsi")).toBe("kavinrajsi");
    expect(linkedinIdFrom("https://www.linkedin.com/in/kavinrajsi/")).toBe("kavinrajsi");
    expect(linkedinIdFrom("linkedin.com/in/kavin-raj-123/?utm_source=share")).toBe("kavin-raj-123");
    expect(linkedinIdFrom("https://in.linkedin.com/in/r%C3%A9mi")).toBe("rémi");
  });

  it("drops a leading @", () => {
    expect(linkedinIdFrom("@kavinrajsi")).toBe("kavinrajsi");
  });
});

describe("LINKEDIN_ID", () => {
  it("accepts real IDs and rejects links or spaces", () => {
    expect(LINKEDIN_ID.test("kavinrajsi")).toBe(true);
    expect(LINKEDIN_ID.test("kavin-raj_123")).toBe(true);
    expect(LINKEDIN_ID.test("https://x")).toBe(false);
    expect(LINKEDIN_ID.test("two words")).toBe(false);
    expect(LINKEDIN_ID.test("ab")).toBe(false);
  });
});

describe("linkedinUrl", () => {
  it("builds the profile link", () => {
    expect(linkedinUrl("kavinrajsi")).toBe("https://www.linkedin.com/in/kavinrajsi");
  });
});
