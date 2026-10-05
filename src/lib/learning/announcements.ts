import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { isAuthor, learnerCourseWhere } from "./access";

/** Announcements this person may read: everyone-wide ones, plus those of courses open to them. */
export async function announcementWhere(user: { id: string; role: Role }): Promise<Prisma.AnnouncementWhereInput> {
  if (isAuthor(user)) return {};
  return { OR: [{ courseId: null }, { course: await learnerCourseWhere(user) }] };
}
