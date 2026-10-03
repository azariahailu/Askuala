"use client";

import { format } from "date-fns";
import { happeningWithin, inferCourseId, upcomingMajors } from "@/lib/calendar-utils";
import { TYPE_LABELS, type Course, type CourseEvent } from "@/lib/types";
import { useBuddy } from "./BuddyProvider";
import { useMounted } from "@/lib/use-mounted";

export function UpcomingPins({
  events,
  courses,
  courseId,
  onOpen,
}: {
  events: CourseEvent[];
  courses: Course[];
  courseId?: string;
  onOpen?: (e: CourseEvent) => void;
}) {
  const { ui } = useBuddy();
  const mounted = useMounted();
  const scoped = courseId
    ? events.filter((e) => (inferCourseId(e, courses) || e.courseId) === courseId)
    : events;
  const urgent = mounted
    ? scoped.filter((e) => !e.canceled && happeningWithin(e, 48)).sort((a, b) => a.start.localeCompare(b.start))
    : [];
  const majors = mounted ? upcomingMajors(scoped, 14, courses) : [];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <PinCard
        title={ui("pins.urgent")}
        empty={ui("pins.urgentEmpty")}
        items={urgent}
        courses={courses}
        onOpen={onOpen}
      />
      <PinCard
        title={courseId ? ui("pins.majorsCourse") : ui("pins.majors")}
        empty={ui("pins.majorsEmpty")}
        items={majors}
        courses={courses}
        onOpen={onOpen}
      />
    </div>
  );
}

function PinCard({
  title,
  empty,
  items,
  courses,
  onOpen,
  footnote,
}: {
  title: string;
  empty: string;
  items: CourseEvent[];
  courses: Course[];
  onOpen?: (e: CourseEvent) => void;
  footnote?: string;
}) {
  return (
    <section className="rounded-2xl border border-gold/30 bg-urgent p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gold-2">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((e) => {
            const course = courses.find((c) => c.id === e.courseId);
            const row = (
              <>
                <span className="font-medium">{e.title}</span>
                <span className="text-muted">
                  {" "}
                  · {format(new Date(e.start), "EEE MMM d, h:mm a")} · {TYPE_LABELS[e.type]}
                  {course ? ` · ${course.code}` : ""}
                </span>
              </>
            );
            return (
              <li key={e.id}>
                {onOpen ? (
                  <button className="w-full text-left" onClick={() => onOpen(e)}>
                    {row}
                  </button>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
      {footnote && <p className="mt-2 text-xs text-muted">{footnote}</p>}
    </section>
  );
}
