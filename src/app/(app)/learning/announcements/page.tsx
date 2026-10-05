import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import type { Urgency } from "@/generated/prisma/enums";
import { PageShell } from "@/components/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollapsibleForm } from "@/components/collapsible-form";
import { isAuthor, learnerCourseWhere } from "@/lib/learning/access";
import { announcementWhere } from "@/lib/learning/announcements";
import { formatDateTime } from "@/lib/format-date";
import { RichText } from "../_components/rich-text";
import { deleteAnnouncement } from "../actions";
import { AutoSubmit, MarkRead, NewAnnouncementForm } from "./client";

export const metadata = { title: "Announcements" };

const URGENCIES = [
  ["HIGH", "High"],
  ["MEDIUM", "Medium"],
  ["LOW", "Low"],
  ["NONE", "Not set"],
] as const;

const list = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []);

export default async function AnnouncementsPage({ searchParams }: PageProps<"/learning/announcements">) {
  const user = await requireUser();
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const unreadOnly = query.unread === "1";
  const urgencies = list(query.urgency).filter((value): value is Urgency =>
    URGENCIES.some(([key]) => key === value),
  );
  const courseIds = list(query.course);
  const author = isAuthor(user);

  const [visible, courses] = await Promise.all([
    announcementWhere(user),
    db.course.findMany({
      where: author ? {} : await learnerCourseWhere(user),
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
  ]);

  const announcements = await db.announcement.findMany({
    where: {
      AND: [
        visible,
        q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] } : {},
        unreadOnly ? { reads: { none: { userId: user.id } } } : {},
        urgencies.length ? { urgency: { in: urgencies } } : {},
        courseIds.length ? { courseId: { in: courseIds } } : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      course: { select: { id: true, title: true } },
      reads: { where: { userId: user.id }, select: { id: true } },
    },
  });
  const unreadIds = announcements.filter((announcement) => announcement.reads.length === 0).map((row) => row.id);

  return (
    <PageShell>
      <MarkRead ids={unreadIds} />
      <AutoSubmit formId="announcement-filters" />
      <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Announcements</h1>

      {/* Filter inputs join this form via form="…", so the list (with its own forms) isn't nested in it. */}
      <form id="announcement-filters" role="search" aria-label="Filter announcements" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              form="announcement-filters"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search announcements"
              aria-label="Search announcements"
              className="max-w-md flex-1"
            />
            <label className="flex items-center gap-2 text-sm">
              <input form="announcement-filters" type="checkbox" name="unread" value="1" defaultChecked={unreadOnly} className="size-4" />
              Show unread
            </label>
          </div>

          {author && (
            <div className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
              <CollapsibleForm label="New announcement">
                <NewAnnouncementForm courses={courses} />
              </CollapsibleForm>
            </div>
          )}

          {announcements.length === 0 ? (
            <p className="py-16 text-center text-sm text-zinc-500">No announcements</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {announcements.map((announcement) => (
                <li key={announcement.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <div className="flex flex-wrap items-center gap-2">
                    {announcement.reads.length === 0 && (
                      <span className="size-2 rounded-full bg-sky-500" aria-label="Unread" />
                    )}
                    <span className="font-medium">{announcement.title}</span>
                    {announcement.urgency !== "NONE" && (
                      <Badge variant={announcement.urgency === "HIGH" ? "destructive" : "secondary"}>
                        {announcement.urgency.charAt(0) + announcement.urgency.slice(1).toLowerCase()}
                      </Badge>
                    )}
                    <span className="text-xs text-zinc-500">
                      {announcement.course ? announcement.course.title : "Everyone"} · {formatDateTime(announcement.createdAt)}
                    </span>
                  </div>
                  <RichText html={announcement.body} />
                  {author && (
                    <form action={deleteAnnouncement.bind(null, announcement.id)} className="mt-2">
                      <Button type="submit" variant="ghost" size="sm" className="text-red-600">
                        Delete
                      </Button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="flex flex-col gap-6 text-sm">
          <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Filters</h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-medium">Urgency</legend>
            {URGENCIES.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input form="announcement-filters" type="checkbox" name="urgency" value={key} defaultChecked={urgencies.includes(key)} className="size-4" />
                {label}
              </label>
            ))}
          </fieldset>
          {courses.length > 0 && (
            <fieldset className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <legend className="mb-2 font-medium">Course</legend>
              {courses.map((course) => (
                <label key={course.id} className="flex items-start gap-2">
                  <input
                    form="announcement-filters"
                    type="checkbox"
                    name="course"
                    value={course.id}
                    defaultChecked={courseIds.includes(course.id)}
                    className="mt-0.5 size-4"
                  />
                  {course.title}
                </label>
              ))}
            </fieldset>
          )}
          <noscript>
            <Button type="submit" variant="outline" form="announcement-filters">
              Apply
            </Button>
          </noscript>
        </aside>
      </div>
    </PageShell>
  );
}
