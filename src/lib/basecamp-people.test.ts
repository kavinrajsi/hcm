import { beforeEach, describe, expect, it, vi } from "vitest";

// Basecamp people sync against mocked Basecamp, blob storage and database.

const db = vi.hoisted(() => ({
  employee: { findMany: vi.fn(), update: vi.fn() },
}));
const basecamp = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  listPeople: vi.fn(),
  downloadAvatar: vi.fn(),
}));
const blob = vi.hoisted(() => ({
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/basecamp", () => basecamp);
vi.mock("@/lib/blob", () => blob);
vi.mock("@/lib/leave-sync", () => ({
  leaveSyncUserId: vi.fn(async () => "hr-user"),
}));
vi.mock("@/lib/employee-pii", () => ({
  readPii: (row: { personalEmail: string | null }) => ({
    personalEmail: row.personalEmail,
  }),
}));

const { buildEmailIndex, isPerson, matchPerson, syncBasecampPeople } =
  await import("./basecamp-people");

const person = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  name: "Asha Rao",
  email_address: "Asha@Madarth.com",
  avatar_url: "https://bc/avatars/asha-v2.png",
  title: null,
  personable_type: "User",
  client: false,
  ...overrides,
});

const employee = (overrides: Record<string, unknown> = {}) => ({
  id: "e1",
  empId: "PBCH0001",
  workEmail: "asha@madarth.com",
  personalEmail: null,
  personalEmailEnc: null,
  basecampPersonId: null,
  avatarBlobKey: null,
  avatarSourceUrl: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  basecamp.getAccessToken.mockResolvedValue({
    accessToken: "token",
    accountId: "acc",
  });
  basecamp.downloadAvatar.mockResolvedValue({
    bytes: Buffer.from("png"),
    contentType: "image/png",
  });
  blob.uploadDocument.mockResolvedValue("avatars/PBCH0001-abc.png");
  blob.deleteDocument.mockResolvedValue(undefined);
  db.employee.update.mockResolvedValue({});
});

describe("matching", () => {
  it("prefers work email over personal and ignores case", () => {
    const index = buildEmailIndex([
      { id: "a", workEmail: "shared@madarth.com", personalEmail: null },
      {
        id: "b",
        workEmail: "b@madarth.com",
        personalEmail: "Shared@madarth.com",
      },
      { id: "c", workEmail: "c@madarth.com", personalEmail: "c@gmail.com" },
    ]);
    expect(
      matchPerson(
        person({ email_address: "SHARED@madarth.com" }) as never,
        index,
      ),
    ).toBe("a");
    expect(
      matchPerson(person({ email_address: "c@GMAIL.com" }) as never, index),
    ).toBe("c");
    expect(
      matchPerson(person({ email_address: null }) as never, index),
    ).toBeNull();
  });

  it("skips clients and non-users", () => {
    expect(isPerson(person() as never)).toBe(true);
    expect(isPerson(person({ client: true }) as never)).toBe(false);
    expect(isPerson(person({ personable_type: "Integration" }) as never)).toBe(
      false,
    );
  });
});

describe("syncBasecampPeople", () => {
  it("downloads a new picture, stores it and drops the old one", async () => {
    basecamp.listPeople.mockResolvedValue([person()]);
    db.employee.findMany.mockResolvedValue([
      employee({
        avatarBlobKey: "avatars/PBCH0001-old.png",
        avatarSourceUrl: "https://bc/avatars/asha-v1.png",
      }),
    ]);
    const result = await syncBasecampPeople();
    expect(result).toMatchObject({
      people: 1,
      matched: 1,
      updated: 1,
      failed: 0,
    });
    expect(blob.uploadDocument).toHaveBeenCalledWith(
      "avatars/PBCH0001.png",
      expect.any(Buffer),
    );
    expect(db.employee.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: {
        basecampPersonId: "11",
        avatarBlobKey: "avatars/PBCH0001-abc.png",
        avatarSourceUrl: "https://bc/avatars/asha-v2.png",
      },
    });
    expect(blob.deleteDocument).toHaveBeenCalledWith(
      "avatars/PBCH0001-old.png",
    );
  });

  it("doesn't re-download an unchanged picture", async () => {
    basecamp.listPeople.mockResolvedValue([person()]);
    db.employee.findMany.mockResolvedValue([
      employee({
        basecampPersonId: "11",
        avatarSourceUrl: "https://bc/avatars/asha-v2.png",
      }),
    ]);
    const result = await syncBasecampPeople();
    expect(result).toMatchObject({ matched: 1, updated: 0, unchanged: 1 });
    expect(basecamp.downloadAvatar).not.toHaveBeenCalled();
    expect(db.employee.update).not.toHaveBeenCalled();
  });

  it("keeps a hand-made link when the Basecamp email differs", async () => {
    basecamp.listPeople.mockResolvedValue([
      person({ id: 77, email_address: "arivu@madarth.com" }),
    ]);
    db.employee.findMany.mockResolvedValue([
      employee({ workEmail: "arivukkarasi@madarth.com", basecampPersonId: "77" }),
    ]);
    const result = await syncBasecampPeople();
    expect(result).toMatchObject({ matched: 1, unmatched: [] });
    expect(basecamp.downloadAvatar).toHaveBeenCalled();
  });

  it("reports unmatched people and keeps going after a failed download", async () => {
    basecamp.listPeople.mockResolvedValue([
      person(),
      person({ id: 12, name: "Ravi", email_address: "ravi@madarth.com" }),
      person({ id: 13, name: "Guest", email_address: "guest@client.com" }),
      person({ id: 14, name: "Client", client: true }),
    ]);
    db.employee.findMany.mockResolvedValue([
      employee(),
      employee({ id: "e2", empId: "PBCH0002", workEmail: "ravi@madarth.com" }),
    ]);
    basecamp.downloadAvatar
      .mockRejectedValueOnce(new Error("403"))
      .mockResolvedValueOnce({
        bytes: Buffer.from("x"),
        contentType: "image/jpeg",
      });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await syncBasecampPeople();
    expect(result.people).toBe(3); // client skipped
    expect(result.matched).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.unmatched).toEqual([
      { name: "Guest", email: "guest@client.com" },
    ]);
  });

  it("fails clearly when Basecamp isn't connected", async () => {
    basecamp.getAccessToken.mockResolvedValue(null);
    await expect(syncBasecampPeople()).rejects.toThrow("isn't connected");
  });
});
