import { requirePageRole } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { AUTHOR_ROLES } from "@/lib/learning/access";
import { CourseForm } from "../forms";

export const metadata = { title: "New course" };

export default async function NewCoursePage() {
  await requirePageRole(...AUTHOR_ROLES);
  return (
    <PageShell width="md">
      <h1 className="mb-6 text-xl font-semibold tracking-tight md:text-2xl">New course</h1>
      <CourseForm />
    </PageShell>
  );
}
