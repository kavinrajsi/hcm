import { describe, expect, it } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "./draft";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (name: string) => data.get(name) ?? null,
    setItem: (name: string, value: string) => void data.set(name, value),
    removeItem: (name: string) => void data.delete(name),
    size: () => data.size,
  };
};

describe("chat drafts", () => {
  it("keeps each chat's draft separately", () => {
    const store = memory();
    saveDraft("1", "hello", store);
    saveDraft("2", "other", store);
    expect(loadDraft("1", store)).toBe("hello");
    expect(loadDraft("2", store)).toBe("other");
    expect(loadDraft("3", store)).toBe("");
  });

  it("clears a draft, and saving empty text clears it too", () => {
    const store = memory();
    saveDraft("1", "hello", store);
    clearDraft("1", store);
    expect(loadDraft("1", store)).toBe("");
    saveDraft("2", "x", store);
    saveDraft("2", "", store);
    expect(store.size()).toBe(0);
  });

  it("copes with storage that is missing or throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadDraft("1", broken)).toBe("");
    expect(() => saveDraft("1", "x", broken)).not.toThrow();
    expect(() => clearDraft("1", broken)).not.toThrow();
    expect(loadDraft("1", null)).toBe("");
  });
});
