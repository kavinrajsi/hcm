import { formatNoteTime, parseNotes } from "@/app/(app)/candidates/notes";
import { cleanNoteHtml } from "@/app/(app)/candidates/note-html";
import type { FreelancerDetail } from "./freelancer-sheets";

// Turns a freelancer row into what the detail sheet and full page show.
// Notes are the timeline log, cleaned for display and given IST times.

export function toFreelancerDetail(row: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  skillset: string;
  profileUrl: string | null;
  designation: string | null;
  workMode: FreelancerDetail["workMode"];
  notes: string | null;
}): FreelancerDetail {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    skillset: row.skillset,
    profileUrl: row.profileUrl,
    designation: row.designation,
    workMode: row.workMode,
    timeline: parseNotes(row.notes).map((note) => ({
      ...note,
      text: cleanNoteHtml(note.text),
      when: formatNoteTime(note.timestamp),
    })),
  };
}
