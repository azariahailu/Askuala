"use client";

import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isBefore, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { collapseWeeklyByDay, eventInCalendarLens, expandEvents, inferCourseId, isPastEvent, isWeeklyWork, dayKey, type CalendarLens } from "@/lib/calendar-utils";
import { chipStyle, NON_COURSE_COLOR } from "@/lib/course-colors";
import { TYPE_LABELS, type Course, type CourseEvent, type EventType } from "@/lib/types";
import { EventModal } from "./EventModal";
import { UpcomingPins } from "./UpcomingPins";
import { WeeklyPsetBoard } from "./WeeklyPsetBoard";
import { SchoolCalHint } from "./SchoolCalHint";
import { SignInGoogle } from "./SignInGoogle";
import { useBuddy } from "./BuddyProvider";
import { useTheme } from "./ThemeProvider";
import { useMounted } from "@/lib/use-mounted";

type SortKey = "due" | "course" | "type";
type Filters = {
  officeHours: boolean;
  nonCourse: boolean;
  allCourses: boolean;
  activeOnly: boolean;
};

const LENSES: { id: CalendarLens; href: string }[] = [
  { id: "all", href: "/calendar" },
  { id: "majors", href: "/calendar?view=majors" },
  { id: "office", href: "/calendar?view=office" },
  { id: "psets", href: "/calendar?view=psets" },
  { id: "course", href: "/calendar?view=course" },
  { id: "other", href: "/calendar?view=other" },
];

function lensFromSearch() {
  if (typeof window === "undefined") return "all" as CalendarLens;
  const v = new URLSearchParams(window.location.search).get("view");
  if (v === "majors" || v === "office" || v === "psets" || v === "course" || v === "other") return v;
  return "all";
}

const TYPE_OPTIONS: EventType[] = [
  "exam",
  "quiz",
  "assignment",
  "project",
  "lab",
  "pset",
  "reading",
  "office_hour",
  "lecture",
  "other",
];

export function CalendarBoard({ courseId }: { courseId?: string }) {
  const { data, refresh, ui } = useBuddy();
  const { resolved } = useTheme();
  const [month, setMonth] = useState(() => new Date(0));
  const mounted = useMounted();
  const [sort, setSort] = useState<SortKey>("due");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [courseFilter, setCourseFilter] = useState<string>(courseId || "all");
  const [filters, setFilters] = useState<Filters>({
    officeHours: true,
    nonCourse: true,
    allCourses: true,
    activeOnly: true,
  });
  const [dayOpen, setDayOpen] = useState<Date | null>(null);
  const [editing, setEditing] = useState<CourseEvent | null | "new">(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [lens, setLens] = useState<CalendarLens>("all");
  const googleOn = Boolean(data?.settings.googleConnected);
  const googleReady = Boolean(data?.settings.appGoogleReady);

  useEffect(() => {
    setMonth(new Date());
    if (!courseId) setLens(lensFromSearch());
  }, [courseId]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("google") === "error") setSyncMsg(q.get("message") || "Google connect failed");
    if (q.get("google") === "connected") setSyncMsg("Google Calendar connected. Events sync both ways.");
    if (q.get("google") === "unavailable") setSyncMsg("Google Calendar isn’t available. You can still use this calendar.");
  }, []);

  useEffect(() => {
    if (!googleOn) return;
    if ((data?.courses.length || 0) + (data?.events.length || 0) > 0) return;
    if (sessionStorage.getItem("askuala-empty-resync") === "1") return;
    sessionStorage.setItem("askuala-empty-resync", "1");
    void syncCal();
  }, [googleOn, data?.courses.length, data?.events.length]);

  const courses = data?.courses || [];
  const rangeStart = startOfWeek(startOfMonth(month));
  const rangeEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const applyFilters = (events: CourseEvent[]) => {
    let next = events;
    if (courseId) next = next.filter((e) => e.courseId === courseId);
    if (!courseId) next = next.filter((e) => eventInCalendarLens(e, lens));
    if (lens === "all" && !filters.officeHours) {
      next = next.filter((e) => e.type !== "office_hour" && !/\boffice\s*hours?\b/i.test(e.title));
    }
    if (!filters.nonCourse) next = next.filter((e) => e.courseId);
    if (!filters.allCourses) next = next.filter((e) => !e.courseId || e.type === "office_hour");
    if (filters.activeOnly) {
      const active = new Set(courses.filter((c) => !c.dropped).map((c) => c.id));
      next = next.filter((e) => !e.courseId || active.has(e.courseId));
    }
    if (courseFilter !== "all") next = next.filter((e) => e.courseId === courseFilter);
    if (typeFilter !== "all") next = next.filter((e) => e.type === typeFilter);
    const weekly = collapseWeeklyByDay(next.filter(isWeeklyWork), courses);
    const rest = next.filter((e) => !isWeeklyWork(e));
    return [...weekly, ...rest];
  };

  const visible = useMemo(() => {
    return applyFilters(expandEvents(data?.events || [], addDays(rangeStart, -2), addDays(rangeEnd, 2)));
  }, [data, filters, courseFilter, typeFilter, courseId, rangeStart, rangeEnd, courses, lens]);

  const list = useMemo(() => {
    if (!mounted) return [];
    const now = new Date();
    const upcoming = applyFilters(expandEvents(data?.events || [], addDays(now, -1), addDays(now, 21))).filter((e) => !isPastEvent(e));
    return [...upcoming].sort((a, b) => {
      if (sort === "due") return a.start.localeCompare(b.start);
      if (sort === "type") return a.type.localeCompare(b.type) || a.start.localeCompare(b.start);
      const ac = courseLabel(courses, a);
      const bc = courseLabel(courses, b);
      return ac.localeCompare(bc) || a.start.localeCompare(b.start);
    });
  }, [data, filters, courseFilter, typeFilter, courseId, courses, sort, mounted, lens]);

  async function syncCal() {
    setSyncMsg("Syncing…");
    try {
      if (!data?.settings.googleConnected) {
        const start = await fetch("/api/google");
        const startJson = await start.json();
        if (startJson.authUrl) {
          window.location.href = startJson.authUrl;
          return;
        }
      }
      const res = await fetch("/api/google", { method: "POST" });
      const json = await res.json();
      const extra = json.extra || json;
      if (extra.authUrl) {
        window.location.href = extra.authUrl;
        return;
      }
      if (extra.reconnect || extra.reason === "auth") {
        setSyncMsg(extra.message || "Google Calendar login expired. Reconnect to continue.");
        window.location.href = "/api/auth/google?intent=connect";
        return;
      }
      if (!res.ok) {
        const raw = String(extra.message || json.error || extra.error || "Could not sync Google Calendar.");
        if (/invalid_grant/i.test(raw)) {
          setSyncMsg("Google Calendar login expired. Reconnect and click Allow.");
          window.location.href = "/api/auth/google?intent=connect";
          return;
        }
        setSyncMsg(/disabled_client/i.test(raw)
          ? "Google’s login client for this app is disabled. Sync cannot run until you put a new GOOGLE_CLIENT_ID / SECRET from a Cloud project you still own in .env.local, then connect your personal Gmail. The buddy.askuala appeal will not fix this by itself."
          : raw);
        return;
      }
      setSyncMsg(extra.ok === false ? extra.message || "Could not sync Google Calendar." : "Calendar is up to date.");
      await refresh();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Sync failed");
    }
  }

  if (!mounted) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold sm:text-2xl">{courseId ? ui("cal.courseTitle") : ui("cal.title")}</h1>
        <p className="text-sm text-muted">{ui("cal.blurb")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">
            {courseId ? ui("cal.courseTitle") : ui(lens === "all" ? "cal.title" : `cal.lens.${lens}`)}
          </h1>
          <p className="text-sm text-muted">{ui("cal.blurb")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEditing("new")} className="flex items-center gap-1 rounded-lg bg-gold px-3 py-2 text-sm text-on-gold">
            <Plus size={16} /> {ui("cal.add")}
          </button>
          {googleReady && (
            <button onClick={syncCal} className="rounded-lg border border-gold/50 px-3 py-2 text-sm text-gold-2">
              {googleOn ? "Sync Google Calendar" : "Connect / Sync Google"}
            </button>
          )}
        </div>
      </div>
      {syncMsg && <p className="text-sm text-gold-2">{syncMsg}</p>}
      <SchoolCalHint />

      {!courseId && (
        <div className="relative z-10 -mx-1 flex gap-1 overflow-x-auto pb-1 text-sm">
          {LENSES.map((item) => (
            <a
              key={item.id}
              href={item.href}
              onClick={(e) => {
                e.preventDefault();
                setLens(item.id);
                window.history.replaceState(null, "", item.href);
              }}
              className={`flex min-h-11 shrink-0 items-center rounded-full px-4 ${lens === item.id ? "bg-gold text-on-gold" : "bg-surface"}`}
            >
              {ui(`cal.lens.${item.id}`)}
            </a>
          ))}
        </div>
      )}

      {!googleOn && googleReady && (
        <section className="rounded-xl border border-gold/40 bg-surface p-4 text-sm">
          <h2 className="font-medium text-gold-2">Connect Google Calendar</h2>
          <p className="mt-1 text-muted">
            Connect Google Calendar, then we import every calendar you have checked in Google: lectures, psets, and the rest, not only the primary calendar.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <SignInGoogle
              intent="connect"
              className="flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-on-gold"
            />
            <SignInGoogle
              intent="switch"
              className="flex items-center gap-2 rounded-lg border border-line px-3 py-2"
            />
          </div>
        </section>
      )}
      {!googleOn && !googleReady && (
        <section className="rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          Google Calendar isn’t available. You can still add and edit events here.
        </section>
      )}
      {googleOn && (
        <p className="text-sm text-muted">
          Google Calendar connected{data?.settings.googleEmail ? ` as ${data.settings.googleEmail}` : ""}.{" "}
          <SignInGoogle intent="switch" className="inline-flex items-center gap-1 text-gold-2 underline" label="Switch account" />
        </p>
      )}

      {lens === "all" && (
        <>
          <UpcomingPins events={data?.events || []} courses={courses} courseId={courseId} onOpen={setEditing} />
          <WeeklyPsetBoard events={data?.events || []} courses={courses} courseId={courseId} onOpen={setEditing} />
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 text-sm">
        <label>
          Sort
          <select className="ml-2 bg-input px-2 py-1" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="due">Due date</option>
            <option value="course">Course</option>
            <option value="type">Activity type</option>
          </select>
        </label>
        <label>
          Course
          <select className="ml-2 bg-input px-2 py-1" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
            <option value="all">All</option>
            {courses.filter((c) => !c.dropped).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select className="ml-2 bg-input px-2 py-1" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All activities</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {lens === "all" && (
        <EyeBtn on={!filters.officeHours} label="Office hours" onClick={() => setFilters((f) => ({ ...f, officeHours: !f.officeHours }))} />
        )}
        <EyeBtn on={!filters.nonCourse} label="Non-course" onClick={() => setFilters((f) => ({ ...f, nonCourse: !f.nonCourse }))} />
        <EyeBtn on={!filters.allCourses} label="All courses" onClick={() => setFilters((f) => ({ ...f, allCourses: !f.allCourses }))} />
        <EyeBtn on={!filters.activeOnly} label="Active courses only" onClick={() => setFilters((f) => ({ ...f, activeOnly: !f.activeOnly }))} />
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setMonth(addMonths(month, -1))} className="rounded p-2 hover:bg-hover">
          ‹
        </button>
        <h2 className="text-lg font-medium">{format(month, "MMMM yyyy")}</h2>
        <button onClick={() => setMonth(addMonths(month, 1))} className="rounded p-2 hover:bg-hover">
          ›
        </button>
      </div>

      <div className="-mx-3 overflow-x-auto sm:mx-0">
        <div className="grid min-w-[36rem] grid-cols-7 gap-px overflow-hidden rounded-none border-y border-line bg-line sm:min-w-0 sm:rounded-xl sm:border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-input p-1 text-center text-[10px] text-muted sm:p-2 sm:text-xs">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const pastDay = mounted && isBefore(day, startOfDay(new Date()));
          const today = mounted && isSameDay(day, new Date());
          const items = visible.filter((e) => dayKey(e.start) === dayKey(day.toISOString()));
          const shown = items.slice(0, 3);
          const more = items.length - shown.length;
          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => setDayOpen(day)}
              className={`min-h-14 bg-surface p-1 text-left sm:min-h-28 ${isSameMonth(day, month) ? "" : "opacity-40"} ${pastDay ? "opacity-60" : ""} ${today ? "ring-1 ring-inset ring-gold" : ""}`}
            >
              <div className={`px-1 text-xs ${today ? "font-semibold text-gold-2" : "text-muted"}`}>{format(day, "d")}</div>
              <div className="mt-1 flex flex-wrap gap-0.5 px-1 sm:hidden">
                {items.slice(0, 4).map((e) => (
                  <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ background: colorFor(courses, e) }} />
                ))}
              </div>
              <div className="hidden sm:block">
                {shown.map((e) => (
                  <span
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEditing(e);
                    }}
                    className={`mb-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[11px] font-medium ${pastDay || isPastEvent(e) ? "opacity-70" : ""}`}
                    style={chipStyle(colorFor(courses, e), resolved)}
                    title={e.title}
                  >
                    {e.allDay ? e.title : `${format(new Date(e.start), "h:mma")} ${e.title}`}
                  </span>
                ))}
                {more > 0 && <span className="px-1 text-[11px] text-gold-2">+{more} more</span>}
              </div>
            </button>
          );
        })}
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-medium">{ui("cal.upcoming")}</h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="bg-input text-muted">
              <tr>
                <th className="p-2">When</th>
                <th className="p-2">Title</th>
                <th className="p-2">Course</th>
                <th className="p-2">Type</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td className="p-3 text-muted" colSpan={5}>
                    Nothing upcoming in the next several months with these filters.
                  </td>
                </tr>
              ) : (
              list.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="p-2 whitespace-nowrap">{e.allDay ? format(new Date(e.start), "MMM d") + " (all day)" : format(new Date(e.start), "MMM d, h:mm a")}</td>
                  <td className="p-2">
                    <button className="rounded px-1.5 py-0.5 text-left font-medium hover:opacity-90" style={chipStyle(colorFor(courses, e), resolved)} onClick={() => setEditing(e)}>
                      {e.title}
                    </button>
                    <div className="line-clamp-2 text-xs text-muted">{e.details}</div>
                  </td>
                  <td className="p-2">
                    <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={chipStyle(colorFor(courses, e), resolved)}>
                      {courseLabel(courses, e)}
                    </span>
                  </td>
                  <td className="p-2">{TYPE_LABELS[e.type]}</td>
                  <td className="p-2">
                    <button onClick={() => setEditing(e)} className="text-gold-2">
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {dayOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-overlay p-4" onClick={() => setDayOpen(null)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl border border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-medium">{format(dayOpen, "EEEE, MMM d")}</h3>
            {visible
              .filter((e) => isSameDay(new Date(e.start), dayOpen))
              .map((e) => (
                <button
                  key={e.id}
                  className="mb-2 block w-full rounded-lg border border-line p-3 text-left hover:border-gold"
                  onClick={() => {
                    setEditing(e);
                    setDayOpen(null);
                  }}
                >
                  <div className="font-medium">{e.title}</div>
                  <div className="text-xs text-muted">
                    {format(new Date(e.start), "h:mm a")} · {TYPE_LABELS[e.type]} · {courseLabel(courses, e)}
                  </div>
                  <p className="mt-1 text-sm text-muted">{e.details}</p>
                </button>
              ))}
          </div>
        </div>
      )}

      {editing && (
        <EventModal
          event={editing === "new" ? null : editing}
          courseId={courseId || null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EyeBtn({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 rounded-full border border-line px-2 py-1" title={on ? `Show ${label}` : `Hide ${label}`}>
      {on ? <EyeOff size={14} /> : <Eye size={14} />} {label}
    </button>
  );
}

function courseLabel(courses: Course[], e: CourseEvent) {
  const id = inferCourseId(e, courses);
  if (!id) return "Non-course";
  const c = courses.find((x) => x.id === id);
  return c ? c.code : "Course";
}

function colorFor(courses: Course[], e: CourseEvent) {
  const id = inferCourseId(e, courses);
  if (!id) return NON_COURSE_COLOR;
  return courses.find((c) => c.id === id)?.color || "#e4c56a";
}
