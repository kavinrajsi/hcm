"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Circle, Download, Info, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { markLessonComplete, recordVisit } from "../../actions";
import { PdfViewer } from "../../_components/pdf-viewer";
import { downloadFile } from "../../_components/fetch-file";

// Client pieces of the course page: the lesson viewer, "Mark complete &
// next", the section list and the About drawer.

const KIND_LABEL = { PDF: "PDF", VIDEO: "Video", YOUTUBE: "YouTube video", VIMEO: "Vimeo video" } as const;
type Kind = keyof typeof KIND_LABEL;

/** Starts the enrollment / remembers the open lesson (not done during render). */
export function VisitRecorder({ courseId, lessonId }: { courseId: string; lessonId: string | null }) {
  useEffect(() => {
    void recordVisit(courseId, lessonId);
  }, [courseId, lessonId]);
  return null;
}

export type ViewerLesson = {
  id: string;
  kind: Kind;
  title: string;
  fileUrl: string | null;
  embedSrc: string | null;
  done: boolean;
};

export function LessonViewer({ courseId, lesson }: { courseId: string; lesson: ViewerLesson }) {
  const complete = useComplete(courseId, lesson.id);
  const frame = "aspect-video w-full rounded-xl bg-black";

  if (lesson.kind === "VIDEO" && lesson.fileUrl) {
    return (
      <video
        key={lesson.id}
        controls
        preload="metadata"
        playsInline
        src={lesson.fileUrl}
        className={frame}
        // Watching to the end counts as done.
        onEnded={() => {
          if (!lesson.done) complete.run({ advance: false });
        }}
      />
    );
  }
  if (lesson.kind === "PDF" && lesson.fileUrl) {
    return <PdfViewer key={lesson.id} src={lesson.fileUrl} title={lesson.title} />;
  }
  if (lesson.embedSrc) {
    return (
      <iframe
        key={lesson.id}
        title={lesson.title}
        src={lesson.embedSrc}
        className={frame}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }
  return (
    <div className={cn(frame, "flex items-center justify-center text-sm text-zinc-400")}>
      This lesson has no content yet.
    </div>
  );
}

function useComplete(courseId: string, lessonId: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  function run({ advance }: { advance: boolean }) {
    startTransition(async () => {
      const result = await markLessonComplete(lessonId);
      if (!result) {
        setMessage("Couldn't save. Try again.");
        return;
      }
      if (result.courseCompleted && !result.nextLessonId) setMessage("Course complete. Well done!");
      if (advance && result.nextLessonId) {
        router.push(`/learning/courses/${courseId}?lesson=${result.nextLessonId}`);
      } else {
        router.refresh();
      }
    });
  }
  return { run, pending, message };
}

export function LessonActions({
  courseId,
  lesson,
  hasNext,
}: {
  courseId: string;
  lesson: ViewerLesson;
  hasNext: boolean;
}) {
  const complete = useComplete(courseId, lesson.id);
  const label = lesson.done ? (hasNext ? "Next lesson" : "Completed") : hasNext ? "Mark complete & next" : "Mark complete";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {lesson.kind === "PDF" && lesson.fileUrl && (
          <DownloadButton url={lesson.fileUrl} name={`${lesson.title}.pdf`} />
        )}
        {lesson.kind === "VIDEO" && lesson.fileUrl && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Open in a new tab"
            nativeButton={false}
            render={<a href={lesson.fileUrl} target="_blank" rel="noreferrer" />}
          >
            <Maximize2 />
          </Button>
        )}
        <Button
          disabled={complete.pending || (lesson.done && !hasNext)}
          onClick={() => complete.run({ advance: true })}
          className={cn(!lesson.done && "bg-emerald-600 text-white hover:bg-emerald-700")}
        >
          <CheckCircle2 />
          {complete.pending ? "Saving…" : label}
        </Button>
      </div>
      {complete.message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{complete.message}</p>}
    </div>
  );
}

function DownloadButton({ url, name }: { url: string; name: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  return (
    <Button
      variant="outline"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          await downloadFile(url, name.replace(/[\\/:*?"<>|]+/g, "-"));
          setState("idle");
        } catch {
          setState("error");
        }
      }}
    >
      <Download />
      {state === "busy" ? "Downloading…" : state === "error" ? "Try again" : "Download"}
    </Button>
  );
}

export type OutlineSection = {
  id: string;
  title: string;
  lessons: { id: string; title: string; kind: Kind; done: boolean }[];
};

/** Sections as collapsible groups; the one with the open lesson starts open. */
export function CourseOutline({
  courseId,
  sections,
  currentLessonId,
}: {
  courseId: string;
  sections: OutlineSection[];
  currentLessonId: string | null;
}) {
  return (
    <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {sections.map((section) => {
        const done = section.lessons.filter((lesson) => lesson.done).length;
        const allDone = section.lessons.length > 0 && done === section.lessons.length;
        const hasCurrent = section.lessons.some((lesson) => lesson.id === currentLessonId);
        return (
          <Collapsible key={section.id} defaultOpen={hasCurrent} className="group/section">
            <CollapsibleTrigger className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50">
              {allDone ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Done" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
              )}
              <span className="flex-1">
                <span className="block font-medium">{section.title}</span>
                <span className="text-xs text-zinc-500">
                  {section.lessons.length} material{section.lessons.length === 1 ? "" : "s"}
                  {done > 0 && !allDone ? ` · ${done} done` : ""}
                </span>
              </span>
              <ChevronDown className="mt-0.5 size-4 shrink-0 text-zinc-500 transition-transform group-data-[open]/section:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="ml-6 border-l border-zinc-200 pb-2 dark:border-zinc-800">
                {section.lessons.map((lesson) => {
                  const current = lesson.id === currentLessonId;
                  return (
                    <li key={lesson.id}>
                      <Link
                        href={`/learning/courses/${courseId}?lesson=${lesson.id}`}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "-ml-px flex items-start gap-2 border-l-2 border-transparent px-4 py-2 text-sm hover:bg-muted/50",
                          current && "border-orange-600 bg-orange-50 dark:bg-orange-950/30",
                        )}
                      >
                        {lesson.done ? (
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-label="Done" />
                        ) : (
                          <Circle className="mt-0.5 size-3.5 shrink-0 text-zinc-400" aria-hidden />
                        )}
                        <span>
                          <span className="block">{lesson.title}</span>
                          <span className="text-xs text-zinc-500">{KIND_LABEL[lesson.kind]}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

/** The ⓘ button: cover, title and overview in a side drawer. */
export function AboutCourse({
  title,
  description,
  instructor,
  cover,
}: {
  title: string;
  description: string;
  instructor: string | null;
  cover: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="icon-sm" aria-label="About the course" />}>
        <Info />
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>About the course</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {cover}
          <h3 className="text-base font-semibold">{title}</h3>
          {instructor && <p className="text-sm text-zinc-500">{instructor}</p>}
          <h4 className="mt-2 font-medium">Overview</h4>
          <p className="text-sm whitespace-pre-line text-zinc-600 dark:text-zinc-300">
            {description || "No overview yet."}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
