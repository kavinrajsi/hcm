// Employee document columns (private Vercel Blob keys) with display labels.
// Shared by the HR employee page, /me, and the /api/files access check.
export const EMPLOYEE_DOCUMENTS = [
  ["photoBlobKey", "Photo"],
  ["panBlobKey", "PAN"],
  ["aadhaarBlobKey", "Aadhaar"],
  ["offerLetterBlobKey", "Offer letter"],
  ["experienceLetterBlobKey", "Experience letter"],
  ["relievingLetterBlobKey", "Relieving letter"],
] as const;
