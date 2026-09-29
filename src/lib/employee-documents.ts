// Employee document columns (private Vercel Blob keys) with display labels.
// Shared by the HR employee page, /me, and the /api/files access check.
export const EMPLOYEE_DOCUMENTS = [
  ["photoBlobKey", "Photo"],
  ["panBlobKey", "PAN"],
  ["aadhaarBlobKey", "Aadhaar"],
] as const;

// Letter columns on each PreviousEmployment (an experienced hire's earlier
// company), with the form's file-input suffix and display label.
export const PREVIOUS_EMPLOYMENT_DOCUMENTS = [
  ["offerLetterBlobKey", "offerLetter", "Offer letter"],
  ["experienceLetterBlobKey", "experienceLetter", "Experience letter"],
  ["relievingLetterBlobKey", "relievingLetter", "Relieving letter"],
] as const;

export type PreviousEmploymentDocs = {
  companyName: string;
} & Partial<
  Record<(typeof PREVIOUS_EMPLOYMENT_DOCUMENTS)[number][0], string | null>
>;

/** Download links for every letter across an employee's previous companies. */
export function previousEmploymentLinks(rows: PreviousEmploymentDocs[]) {
  return rows.flatMap((row) =>
    PREVIOUS_EMPLOYMENT_DOCUMENTS.flatMap(([column, , label]) => {
      const key = row[column];
      return key ? [{ key, label: `${row.companyName} — ${label}` }] : [];
    }),
  );
}
