"use client";

import { addWeeks, format, isBefore, isSameWeek, startOfWeek } from "date-fns";
import { expandEvents, inferCourseId, isDueWork, isWeeklyWork, collapseWeeklyByDay, stripCourseCode } from "@/lib/calendar-utils";
import type { Course, CourseEvent } from "@/lib/types";
import { useBuddy } from "./BuddyProvider";
import { useMounted } from "@/lib/use-mounted";

export function WeeklyPsetBoard({
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
  if (!mounted) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gold-2">
          {courseId ? ui("board.workCourse") : ui("board.work")}
        </h2>
        <p className="mb-3 text-sm text-muted">{ui("board.workBlurb")}</p>
      </section>
    );
  }
  const now = new Date();
  const rangeStart = startOfWeek(now, { weekStartsOn: 1 });
  const rangeEnd = addWeeks(rangeStart, 8);
  const scoped = events
    .filter((e) => !courseId || (inferCourseId(e, courses) || e.courseId) === courseId)
    .filter(isDueWork);
  const psets = collapseWeeklyByDay(
    expandEvents(
      scoped.filter(isWeeklyWork),
      rangeStart,
      rangeEnd,
    ),
    courses,
  );
  const other = expandEvents(
    scoped.filter((e) => !isWeeklyWork(e)),
    rangeStart,
    rangeEnd,
  );
  const expanded = [...psets, ...other].filter((e) => !isBefore(new Date(e.start), rangeStart));
  const weeks = new Map<string, CourseEvent[]>();
  for (const event of expanded) {
    const due = new Date(event.start);
    const key = startOfWeek(due, { weekStartsOn: 1 }).toISOString();
    const list = weeks.get(key) || [];
    const id = `${event.courseId || ""}|${event.title}|${due.toDateString()}`;
    if (!list.some((x) => `${x.courseId || ""}|${x.title}|${new Date(x.start).toDateString()}` === id)) list.push(event);
    weeks.set(key, list);
  }
  const rows = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gold-2">
        {courseId ? ui("board.workCourse") : ui("board.work")}
      </h2>
      <p className="mb-3 text-sm text-muted">{ui("board.workBlurb")}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{ui("board.empty")}</p>
      ) : (
        <div className="space-y-3">
          {rows.map(([key, items]) => {
            const week = new Date(key);
            const current = isSameWeek(week, now, { weekStartsOn: 1 });
            return (
              <div
                key={key}
                className={`rounded-xl border p-3 ${current ? "border-gold/50 bg-urgent" : "border-line"}`}
              >
                <h3 className="mb-2 text-sm font-medium">
                  Week of {format(week, "MMM d")}
                  {current ? " · this week" : ""}
                </h3>
                <ul className="space-y-2 text-sm">
                  {items
                    .sort((a, b) => a.start.localeCompare(b.start))
                    .map((e) => {
                    const course = courses.find((c) => c.id === (inferCourseId(e, courses) || e.courseId));
                    const row = (
                      <>
                        <span className="font-medium">{course?.code || "Course"}</span>
                        <span> · {stripCourseCode(e.title, course?.code) || e.title}</span>
                        {e.releasedAt && (
                          <span className="text-muted"> · posted {format(new Date(e.releasedAt), "EEE h:mm a")}</span>
                        )}
                        <span className="text-muted">
                          {" "}
                          · {e.type === "reading" ? "for class" : "due"} {format(new Date(e.start), "EEE MMM d, h:mm a")}
                        </span>
                      </>
                    );
                    return (
                      <li key={`${e.courseId}-${e.start}-${e.title}`}>
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
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
