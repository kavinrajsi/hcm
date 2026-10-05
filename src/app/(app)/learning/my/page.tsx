import { requireUser } from "@/lib/rbac";
import { PageShell } from "@/components/page";
import { Segmented } from "@/components/segmented";
import { Input } from "@/components/ui/input";
import { myCourses } from "@/lib/learning/catalog";
import { CourseCard } from "../_components/course-card";

export const metadata = { title: "My learning" };

const TABS = ["active", "completed", "explore"] as const;
type Tab = (typeof TABS)[number];

export default async function MyLearningPage({ searchParams }: PageProps<"/learning/my">) {
  const user = await requireUser();
  const query = await searchParams;
  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : "active";
  const q = typeof query.q === "string" ? query.q.trim() : "";

  const lists = await myCourses(user);
  const needle = q.toLowerCase();
  const shown = lists[tab].filter(
    (course) =>
      !needle ||
      course.title.toLowerCase().includes(needle) ||
      course.instructor?.toLowerCase().includes(needle),
  );
  const href = (key: Tab) => `/learning/my?tab=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <PageShell>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">My learning</h1>
          <Segmented
            label="My learning"
            items={[
              { key: "active", label: `Active learning (${lists.active.length})`, href: href("active"), active: tab === "active" },
              { key: "completed", label: `Completed (${lists.completed.length})`, href: href("completed"), active: tab === "completed" },
              { key: "explore", label: `Explore (${lists.explore.length})`, href: href("explore"), active: tab === "explore" },
            ]}
          />
        </div>
        <form className="md:w-72" role="search">
          <input type="hidden" name="tab" value={tab} />
          <Input name="q" type="search" defaultValue={q} placeholder="Search courses" aria-label="Search courses" />
        </form>
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {q
            ? `No courses match “${q}”.`
            : tab === "active"
              ? "Nothing in progress. Courses assigned to you, and ones you start from Explore, show up here."
              : tab === "completed"
                ? "No completed courses yet."
                : "No open courses to explore right now."}
        </p>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((course) => (
            <li key={course.id}>
              <CourseCard course={{ ...course, dueDate: tab === "completed" ? null : course.dueDate }} />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
