import { describe, expect, it } from "vitest";
import { appendNote, formatNoteTime, parseNotes, removeNote } from "./notes";

const legacy =
  '[{"id":"1781072042221","text":"Gave assessment","timestamp":"2026-06-10T06:14:02.221Z"}]';

describe("candidate notes", () => {
  it("parses the Supabase JSON log", () => {
    expect(parseNotes(legacy)).toEqual([
      {
        id: "1781072042221",
        text: "Gave assessment",
        timestamp: "2026-06-10T06:14:02.221Z",
      },
    ]);
  });

  it("treats plain text as one undated note and empty as none", () => {
    expect(parseNotes("call back")).toEqual([
      { id: "legacy", text: "call back", timestamp: null },
    ]);
    expect(parseNotes(null)).toEqual([]);
    expect(parseNotes("  ")).toEqual([]);
  });

  it("formats in IST like 10 Jun 2026 at 11:44 am", () => {
    expect(formatNoteTime("2026-06-10T06:14:02.221Z")).toBe(
      "10 Jun 2026 at 11:44 am",
    );
    expect(formatNoteTime("2026-06-10T12:05:00Z")).toBe(
      "10 Jun 2026 at 5:35 pm",
    );
    expect(formatNoteTime(null)).toBeNull();
  });

  it("appends and removes in the same JSON shape", () => {
    const now = new Date("2026-09-24T10:00:00Z");
    const next = appendNote(legacy, "Called", now);
    expect(JSON.parse(next)).toHaveLength(2);
    expect(JSON.parse(next)[1]).toEqual({
      id: String(now.getTime()),
      text: "Called",
      timestamp: now.toISOString(),
    });
    expect(removeNote(next, "1781072042221")).toBe(
      JSON.stringify([
        {
          id: String(now.getTime()),
          text: "Called",
          timestamp: now.toISOString(),
        },
      ]),
    );
    expect(removeNote(legacy, "1781072042221")).toBeNull();
  });
});
