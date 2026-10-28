import { db } from "@/lib/db";

// Who signs exit letters. HR sets it once on the exit letters page; it is
// stored as an AppSetting so it is not hard-coded and can change later.

export const EXIT_LETTER_SIGNATORY_KEY = "exitLetterSignatory";

export type ExitLetterSignatory = { name: string; designation: string };

export async function getExitLetterSignatory(): Promise<ExitLetterSignatory | null> {
  const setting = await db.appSetting.findUnique({
    where: { key: EXIT_LETTER_SIGNATORY_KEY },
    select: { value: true },
  });
  const value = setting?.value as Partial<ExitLetterSignatory> | null | undefined;
  if (!value?.name?.trim() || !value.designation?.trim()) return null;
  return { name: value.name.trim(), designation: value.designation.trim() };
}
