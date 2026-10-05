import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDay } from "@/lib/format-date";
import type { Progress } from "@/lib/learning/progress";
import { CourseCover } from "./course-cover";
import { ProgressBar } from "./progress-bar";

export type CourseCardData = {
  id: string;
  title: string;
  instructor: string | null;
  coverKey: string | null;
  progress: Progress;
  dueDate?: Date | null;
};

/** Cover, title, instructor and progress — links to the course. */
export function CourseCard({ course }: { course: CourseCardData }) {
  // Due dates are calendar dates; overdue once that day has passed.
  const overdue = course.dueDate && course.dueDate.getTime() < new Date().getTime() - 86_400_000;
  return (
    <Link
      href={`/learning/courses/${course.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-zinc-200 bg-card p-3 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
    >
      <CourseCover title={course.title} coverKey={course.coverKey} />
      <div className="flex flex-1 flex-col gap-1 px-1">
        <span className="font-medium leading-snug group-hover:underline group-hover:underline-offset-4">
          {course.title}
        </span>
        {course.instructor && <span className="text-sm text-zinc-500">{course.instructor}</span>}
        {course.dueDate && (
          <Badge variant={overdue ? "destructive" : "secondary"} className="mt-1 w-fit">
            {overdue ? "Overdue" : "Due"} {formatDay(course.dueDate)}
          </Badge>
        )}
      </div>
      <div className="px-1 pb-1">
        <ProgressBar progress={course.progress} />
      </div>
    </Link>
  );
}
