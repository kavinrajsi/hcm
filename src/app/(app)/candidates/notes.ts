// candidates.notes holds a JSON log written by the previous (Supabase) app:
// [{ "id": "<ms epoch>", "text": "…", "timestamp": "<ISO>" }]. Keep writing
// the same shape so both apps can read it. Plain text is tolerated as one
// undated note.

export type CandidateNote = {
  id: string;
  text: string;
  timestamp: string | null;
};

export function parseNotes(raw: string | null): CandidateNote[] {
  const value = raw?.trim();
  if (!value) return [];
  if (value.startsWith("[")) {
    try {
      const list = JSON.parse(value) as unknown[];
      return list.flatMap((n, i) => {
        if (!n || typeof n !== "object") return [];
        const { id, text, timestamp } = n as Record<string, unknown>;
        if (typeof text !== "string" || !text.trim()) return [];
        return [
          {
            id:
              typeof id === "string" || typeof id === "number"
                ? String(id)
                : String(i),
            text,
            timestamp: typeof timestamp === "string" ? timestamp : null,
          },
        ];
      });
    } catch {
      // fall through: not JSON after all
    }
  }
  return [{ id: "legacy", text: value, timestamp: null }];
}

export function appendNote(
  raw: string | null,
  text: string,
  now = new Date(),
): string {
  const notes = parseNotes(raw);
  notes.push({ id: String(now.getTime()), text, timestamp: now.toISOString() });
  return JSON.stringify(notes);
}

export function removeNote(raw: string | null, noteId: string): string | null {
  const notes = parseNotes(raw).filter((n) => n.id !== noteId);
  return notes.length ? JSON.stringify(notes) : null;
}

/** "10 Jun 2026 at 11:44 am" in Asia/Kolkata. */
export function formatNoteTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year} at ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toLowerCase()}`;
}
