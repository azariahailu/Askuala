"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useBuddy } from "@/components/BuddyProvider";
import { CalendarBoard } from "@/components/CalendarBoard";
import { CourseNotes } from "@/components/CourseNotes";
import { AddCourseModal } from "@/components/AddCourseModal";
import { CourseEditor } from "@/components/CourseEditor";
import { UpcomingPins } from "@/components/UpcomingPins";
import { WeeklyPsetBoard } from "@/components/WeeklyPsetBoard";
import { APP_NAME } from "@/lib/brand";

type CourseTab = "overview" | "calendar" | "notes";

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const q = searchParams.get("tab");
  const [tab, setTab] = useState<CourseTab>(q === "notes" || q === "calendar" ? q : "overview");
  const { data, postJson, ui } = useBuddy();
  const course = data?.courses.find((c) => c.id === id);
  const [update, setUpdate] = useState(false);
  const [edit, setEdit] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "notes" || t === "calendar") setTab(t);
  }, [id]);

  function go(next: CourseTab) {
    setTab(next);
    const url = next === "overview" ? `/courses/${id}` : `/courses/${id}?tab=${next}`;
    window.history.replaceState(null, "", url);
  }

  if (!course) return <p>Course not found.</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {course.term} {course.year} · Year {course.academicYear}
          </p>
          <h1 className="text-3xl font-semibold">
            <span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ background: course.color }} />
            {course.code}
          </h1>
          <p className="text-lg text-ink">{course.name}</p>
          <p className="text-sm text-muted">
            {course.instructor || "Instructor TBD"} · {course.meetingPattern || "Schedule from syllabus"} · {course.location || "Location TBD"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEdit(true)} className="rounded-lg bg-gold px-3 py-2 text-sm text-on-gold">
            {ui("course.edit")}
          </button>
          <button onClick={() => setUpdate(true)} className="rounded-lg border border-gold/40 px-3 py-2 text-sm text-gold-2">
            {ui("course.update")}
          </button>
          <button
            className="rounded-lg border border-line px-3 py-2 text-sm"
            onClick={() =>
              course.dropped
                ? postJson("/api/courses", { id: course.id }, "POST")
                : postJson("/api/courses", { id: course.id, drop: true }, "DELETE")
            }
          >
            {course.dropped ? ui("course.restore") : ui("course.drop")}
          </button>
          <button
            className="rounded-lg border border-red-400/50 px-3 py-2 text-sm text-red-400"
            onClick={() => {
              if (window.confirm(`Remove this course from ${APP_NAME}? This deletes it here; it is not a Yale add/drop.`)) {
                postJson("/api/courses", { id: course.id, drop: false }, "DELETE");
              }
            }}
          >
            {ui("course.delete")}
          </button>
        </div>
      </div>
      <div className="relative z-10 -mx-1 flex gap-1 overflow-x-auto pb-1 text-sm">
        {(["overview", "calendar", "notes"] as const).map((t) => (
          <a
            key={t}
            href={t === "overview" ? `/courses/${course.id}` : `/courses/${course.id}?tab=${t}`}
            onClick={(e) => {
              e.preventDefault();
              go(t);
            }}
            className={`flex min-h-11 shrink-0 items-center rounded-full px-4 capitalize ${tab === t ? "bg-gold text-on-gold" : "bg-surface"}`}
          >
            {ui(`course.tab.${t}`)}
          </a>
        ))}
        <a href="/calendar" className="flex min-h-11 shrink-0 items-center rounded-full bg-surface px-4">
          {ui("nav.calendar")}
        </a>
      </div>
      {tab === "overview" && (
        <div className="space-y-4">
          <UpcomingPins events={data?.events || []} courses={data?.courses || []} courseId={course.id} />
          <WeeklyPsetBoard events={data?.events || []} courses={data?.courses || []} courseId={course.id} />
          <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-line bg-surface p-4 md:col-span-2">
            <h2 className="font-medium">{ui("course.policies")}</h2>
            <p className="mt-1 text-sm text-muted">{ui("course.policiesBlurb")}</p>
            {course.policies.length === 0 && <p className="mt-2 text-sm text-muted">None extracted yet. Update from file/text, or add them in Edit course.</p>}
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              {course.policies.map((p) => (
                <article key={p.id}>
                  <h3 className="text-sm font-medium text-gold-2">{p.title}</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
                    {p.body
                      .split(/\n+/)
                      .map((line) => line.replace(/^[-•*]\s*/, "").trim())
                      .filter(Boolean)
                      .map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
          {course.extraContext.trim() && course.extraContext.length < 800 && (
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-medium">Your notes</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{course.extraContext}</p>
          </section>
          )}
          </div>
        </div>
      )}
      {tab === "calendar" && <CalendarBoard courseId={course.id} />}
      <div className={tab === "notes" ? "" : "hidden"}>
        <CourseNotes key={course.id} courseId={course.id} />
      </div>
      {update && <AddCourseModal courseId={course.id} onClose={() => setUpdate(false)} />}
      {edit && <CourseEditor course={course} onClose={() => setEdit(false)} />}
    </div>
  );
}
