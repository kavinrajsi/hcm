import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";

/**
 * Which employees a person may see on HR/manager pages: managers only
 * their direct reports, HR admins everyone. Same rule as Leave and
 * Birthdays; apply it to every list, count and picker on such a page.
 */
export function teamEmployeeWhere(user: { id: string; role: Role }): Prisma.EmployeeWhereInput {
  return user.role === "MANAGER" ? { manager: { userId: user.id } } : {};
}
