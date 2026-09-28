import { addDays, addHours, addMinutes, addMonths, addWeeks, addYears, endOfDay, isAfter, isBefore } from "date-fns";
import type { AppState, Course, CourseEvent, Recurrence } from "./types";

const DAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

export function expandEvents(events: CourseEvent[], rangeStart: Date, rangeEnd: Date) {
  const out: CourseEvent[] = [];
  for (const event of events) {
    if (event.canceled) continue;
    if (!event.recurrence || shouldNotRecur(event)) {
      const start = new Date(event.start);
      if (!isAfter(start, rangeEnd) && !isBefore(start, addDays(rangeStart, -1))) {
        out.push(event);
      }
      continue;
    }
    out.push(...expandRecurrence(event, rangeStart, rangeEnd));
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

function expandRecurrence(event: CourseEvent, rangeStart: Date, rangeEnd: Date) {
  const rec = event.recurrence as Recurrence;
  const seed = new Date(event.start);
  const until = rec.until ? new Date(rec.until) : rangeEnd;
  const endCap = until < rangeEnd ? until : rangeEnd;
  const duration = event.end ? new Date(event.end).getTime() - seed.getTime() : 60 * 60 * 1000;
  const interval = Math.max(1, rec.interval || 1);
  const maxCount = rec.count && rec.count > 0 ? rec.count : 2500;
  const instances: CourseEvent[] = [];

  function pushAt(start: Date) {
    if (instances.length >= maxCount) return;
    if (start < seed || start > endCap || start < rangeStart || start > rangeEnd) return;
    instances.push({
      ...event,
      id: `${event.id}::${start.toISOString()}`,
      start: start.toISOString(),
      end: new Date(start.getTime() + duration).toISOString(),
    });
  }

  if (rec.freq === "hourly") {
    let t = new Date(seed);
    while (t <= endCap && instances.length < maxCount) {
      pushAt(t);
      t = addHours(t, interval);
    }
    return instances;
  }
  if (rec.freq === "daily") {
    let t = new Date(seed);
    while (t <= endCap && instances.length < maxCount) {
      pushAt(t);
      t = addDays(t, interval);
    }
    return instances;
  }
  if (rec.freq === "monthly") {
    let t = new Date(seed);
    while (t <= endCap && instances.length < maxCount) {
      pushAt(t);
      t = addMonths(t, interval);
    }
    return instances;
  }
  if (rec.freq === "yearly") {
    let t = new Date(seed);
    while (t <= endCap && instances.length < maxCount) {
      pushAt(t);
      t = addYears(t, interval);
    }
    return instances;
  }

  const mapped = (rec.byDay?.length ? rec.byDay : [["SU", "MO", "TU", "WE", "TH", "FR", "SA"][seed.getDay()]])
    .map((d) => DAY_MAP[d.toUpperCase()] ?? -1)
    .filter((d) => d >= 0);
  // An unrecognised day token must not make the event vanish from the calendar.
  const days = mapped.length ? mapped : [seed.getDay()];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  const guard = addWeeks(endCap, interval + 1);
  while (cursor <= guard && instances.length < maxCount) {
    if (days.includes(cursor.getDay())) {
      const start = new Date(cursor);
      start.setHours(seed.getHours(), seed.getMinutes(), seed.getSeconds(), 0);
      const weekDelta = Math.floor((start.getTime() - seed.getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (weekDelta >= 0 && weekDelta % interval === 0) pushAt(start);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return instances;
}

export function alertFireAt(when: Date, amount: number, unit: "minutes" | "hours" | "days" | "weeks") {
  if (unit === "minutes") return addMinutes(when, -amount);
  if (unit === "hours") return addHours(when, -amount);
  if (unit === "days") return addDays(when, -amount);
  return addWeeks(when, -amount);
}

export function eventEndAt(event: CourseEvent) {
  if (event.end) return new Date(event.end);
  const start = new Date(event.start);
  if (start.getHours() === 0 && start.getMinutes() === 0) return endOfDay(start);
  return start;
}

export function isPastEvent(event: CourseEvent) {
  return eventEndAt(event).getTime() < Date.now();
}

export function inNextHours(iso: string, hours: number) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  return t >= now && t <= now + hours * 60 * 60 * 1000;
}

export function isWeeklyWork(event: CourseEvent) {
  if (/\b(midterm|final exam)\b/i.test(event.title)) return false;
  if (event.type === "exam" || event.type === "quiz") return false;
  if (event.type === "pset") return true;
  return /\b(problem set|p-?set|homework)\b/i.test(event.title);
}

/** Numbered/dated work is one due date, never a repeating series. Weekly classwork (explorations, OH, lectures) may still recur. */
export function shouldNotRecur(event: Pick<CourseEvent, "title" | "type">) {
  if (["exam", "quiz", "pset", "project", "lab"].includes(event.type)) return true;
  if (psetNumber(event.title)) return true;
  return /\b(midterm|final exam|problem set|p-?set|homework|\bhw\s*\d|paper\b|draft\b|essay|proposal)\b/i.test(event.title);
}

export function weekKey(iso: string) {
  const [y, m, d] = dayKey(iso).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

/** Anything due that belongs on the weekly work board (psets, papers, drafts, homework). */
export function isDueWork(event: CourseEvent) {
  if (event.canceled) return false;
  if (["lecture", "office_hour", "exam"].includes(event.type)) return false;
  if (/\b(midterm|final exam)\b/i.test(event.title)) return false;
  if (isWeeklyWork(event)) return true;
  if (["assignment", "project", "quiz", "pset", "reading"].includes(event.type)) return true;
  return /\b(paper|draft|essay|assignment|homework|reading response|workshop)\b/i.test(event.title);
}

export function isMajorAssessment(event: CourseEvent) {
  if (["lecture", "office_hour", "pset", "reading"].includes(event.type)) return false;
  if (isWeeklyWork(event)) return false;
  if (!event.courseId && event.source === "google") return false;
  if (["exam", "quiz", "project"].includes(event.type)) return true;
  return /\b(midterms?|finals?|exams?|quizzes|quiz|projects?|papers?|thesis|theses|presentations?|essays?|orals?)\b/i.test(
    event.title,
  );
}

export function upcomingMajors(events: CourseEvent[], days = 14, courses: { id: string; code: string }[] = []) {
  const list = events
    .filter((e) => !e.canceled && isMajorAssessment(e) && inNextHours(e.start, days * 24))
    .sort((a, b) => a.start.localeCompare(b.start));
  const seen = new Set<string>();
  const out: CourseEvent[] = [];
  for (const e of list) {
    const courseId = inferCourseId(e, courses) || e.courseId || "";
    const code = courses.find((c) => c.id === courseId)?.code;
    const stamp = assessmentStamp(e, code) || foldTitle(e.title, code);
    const key = `${courseId}|${stamp}|${dayKey(e.start)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function eventSignature(e: CourseEvent) {
  return `${e.courseId || ""}|${e.title.trim().toLowerCase()}|${e.start.slice(0, 16)}|${e.recurrence ? "R" : "S"}`;
}

export function dayKey(iso: string) {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const FAKE_DEPTS = new Set(
  "FALL SPRING SUMMER WINTER JANUARY FEBRUARY MARCH APRIL MAY JUNE JULY AUGUST SEPTEMBER OCTOBER NOVEMBER DECEMBER MONDAY TUESDAY WEDNESDAY THURSDAY FRIDAY SATURDAY SUNDAY CHAPTER SECTION WEEK PAGE PAGES UNIT UNITS".split(
    " ",
  ),
);

export function looksLikeCourseCode(dept: string, num: string) {
  const d = dept.replace(/\s+/g, "").replace(/&/g, "").toUpperCase();
  if (!d || d.length < 2 || FAKE_DEPTS.has(d)) return false;
  const n = parseInt(num, 10);
  if (!Number.isFinite(n)) return false;
  if (n >= 1900 && n <= 2100) return false;
  if (num.replace(/[A-Za-z]/g, "").length < 3) return false;
  return true;
}

export function normalizeCourseCode(raw: string) {
  const m = raw.trim().match(/^([A-Za-z]{2,6}(?:\s*&\s*[A-Za-z]{2,4})?)\s+(\d{3,5}[A-Za-z]?)$/);
  if (!m) return raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (!looksLikeCourseCode(m[1], m[2])) return raw.trim().toUpperCase().replace(/\s+/g, " ");
  const dept = m[1].replace(/\s+/g, "").replace(/&/g, "&").toUpperCase();
  return `${dept} ${m[2].toUpperCase()}`;
}

export function codesInText(text: string) {
  const out: string[] = [];
  const re = /\b([A-Za-z]{2,6}(?:\s*&\s*[A-Za-z]{2,4})?)\s*[-–:]?\s*(\d{3,5}[A-Za-z]?)\b/g;
  let m: RegExpExecArray | null;
  const hay = text || "";
  while ((m = re.exec(hay))) {
    if (!looksLikeCourseCode(m[1], m[2])) continue;
    out.push(normalizeCourseCode(`${m[1]} ${m[2]}`));
  }
  return [...new Set(out)];
}

export function stripCourseCode(title: string, code?: string) {
  let t = (title || "").trim();
  if (code) {
    const c = normalizeCourseCode(code);
    t = t.replace(new RegExp(`^${c.replace(/\s+/g, "\\s*")}\\s*[·:\\-–—]\\s*`, "i"), "");
    t = t.replace(new RegExp(`\\s*[·]\\s*${c.replace(/\s+/g, "\\s*")}$`, "i"), "");
  }
  t = t.replace(/^\s*[A-Za-z]{2,6}(?:\s*&\s*[A-Za-z]{2,4})?\s+\d{3,5}[A-Za-z]?\s*[·:\\-–—]\s*/, "");
  return t.replace(/\s+due$/i, "").trim();
}

/** Calendar titles: `ECON 1115 · Problem set 1` so the course is always in the name. */
export function formatCourseEventTitle(code: string, title: string) {
  const rest = stripCourseCode(title, code) || title.trim();
  const c = normalizeCourseCode(code);
  const parts = c.split(/\s+/);
  if (parts.length < 2 || !looksLikeCourseCode(parts[0], parts[1]) || !rest) return rest;
  if (rest.toLowerCase().includes(c.toLowerCase())) return rest;
  return `${c} · ${rest}`;
}

export function tidyCourseEventTitle(title: string, code?: string) {
  let t = (title || "").trim();
  t = t.replace(/\s*\[[^\]]{2,80}\]\s*/g, " ");
  t = t.replace(/\s+\d{1,3}\s*\(\s*(?:FA|SP|SU)\d{2}\s*\):\s*/i, " · ");
  t = t.replace(/\s*[-–—]\s*Due\b.+$/i, "");
  t = t.replace(/\s+due\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.+$/i, "");
  t = t.replace(/\s+due\s+\d{1,2}:\d{2}\s*(?:am|pm)?\s*$/i, "");
  t = t.replace(/\bS&DS\s+1000\s*\/\s*5000\s*[—–-]\s*/i, "");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/\bproblem sets?\b/gi, (s) => (s.toLowerCase().endsWith("s") ? "Problem Sets" : "Problem Set"));
  t = t.replace(/\bhomework\b/gi, "Homework");
  if (code) return formatCourseEventTitle(code, t);
  return t;
}

export function isGenericWorkTitle(title: string, code?: string) {
  const t = foldTitle(title, code);
  // Numbered/lettered work ("Problem Set 3") is a real item. Only the bare label is generic.
  return /^(problem set|homework|pset|hw|lecture)$/.test(t);
}

export function inferCourseId(event: CourseEvent, courses: { id: string; code: string; name?: string }[] = []) {
  if (event.courseId && courses.some((c) => c.id === event.courseId)) return event.courseId;
  const hay = `${event.title} ${event.details || ""}`;
  const found = codesInText(hay);
  for (const code of found) {
    const hit = courses.find((c) => normalizeCourseCode(c.code) === code);
    if (hit) return hit.id;
  }
  const lower = hay.toLowerCase();
  for (const c of courses) {
    const code = normalizeCourseCode(c.code).toLowerCase();
    const packed = code.replace(/\s+/g, "");
    if (lower.includes(code) || lower.includes(packed)) return c.id;
  }
  return null;
}

export function titleLooksLikeOfficeHour(title: string) {
  return /\boffice\s*hours?\b/i.test(title || "");
}

export function looksLikeOfficeHour(event: Pick<CourseEvent, "title" | "details" | "type">) {
  if (event.type === "office_hour") return true;
  if (titleLooksLikeOfficeHour(event.title)) return true;
  return /\boffice\s*hours?\b/i.test(event.details || "");
}

/** Lectures, problem sets, readings, office hours — on the calendar, but no pings until the student opts in. */
export function isRoutineNoise(event: Pick<CourseEvent, "title" | "details" | "type">) {
  if (looksLikeOfficeHour(event)) return true;
  if (event.type === "lecture" || event.type === "reading" || event.type === "pset") return true;
  if (/\b(midterm|final exam)\b/i.test(event.title)) return false;
  return isWeeklyWork(event as CourseEvent);
}

export function foldTitle(title: string, code?: string) {
  return stripCourseCode(title, code)
    .toLowerCase()
    .replace(/[—–−]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Same midterm/final/quiz even when Google used an em dash, all-day midnight, or “Early Midterm”. */
export function assessmentStamp(event: Pick<CourseEvent, "title" | "type">, code?: string) {
  const t = foldTitle(event.title, code);
  if (/\bfinal\b/.test(t) && /\bexam\b/.test(t)) return "final";
  if (/\b(early|first)\s+midterm\b/.test(t) || /\bmidterm(?:\s*exam)?\s*(?:#\s*)?1\b/.test(t)) return "midterm-1";
  if (/\bsecond\s+midterm\b/.test(t) || /\bmidterm(?:\s*exam)?\s*(?:#\s*)?2\b/.test(t)) return "midterm-2";
  const mid = t.match(/\bmidterm(?:\s*exam)?\s*(?:#\s*)?(\d+)\b/);
  if (mid) return `midterm-${mid[1]}`;
  if (/\bmidterm\b/.test(t)) return "midterm";
  const quiz = t.match(/\bquiz\s*(?:#\s*)?(\d+)\b/);
  if (quiz) return `quiz-${quiz[1]}`;
  const pset = psetNumber(event.title);
  if (pset) return `pset-${pset}`;
  return null;
}

function nyHour(iso: string) {
  const map: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso))) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return Number(map.hour);
}

export function looksAllDay(event: Pick<CourseEvent, "start" | "end" | "allDay">) {
  if (event.allDay) return true;
  const hour = nyHour(event.start);
  if (hour > 0 && hour < 23) return false;
  if (!event.end) return hour === 0;
  return new Date(event.end).getTime() - new Date(event.start).getTime() >= 12 * 60 * 60 * 1000;
}

function parseClockToken(raw: string, fallbackMer: "am" | "pm" | "" = "") {
  const m = raw.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || fallbackMer).replace(/\./g, "").toLowerCase();
  if (ap.startsWith("p") && h < 12) h += 12;
  if (ap.startsWith("a") && h === 12) h = 0;
  if (!ap && h > 0 && h <= 7) h += 12;
  return { h, min };
}

function onNyDate(iso: string, h: number, min: number) {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso))) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day), h, min).toISOString();
}

/** Honor “from 7-9pm” / “at 9am” on exam rows instead of leaving Google all-day midnight. */
export function applyStatedExamTimes(event: CourseEvent) {
  if (event.type !== "exam" && event.type !== "quiz" && !assessmentStamp(event)) return;
  const text = `${event.title} ${event.details || ""}`;
  const range = text.match(
    /(?:from\s+)?(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)?\s*[-–to]+\s*(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)/i,
  );
  if (range) {
    const mer = (range[4] || range[2] || "pm").replace(/\./g, "").toLowerCase();
    const start = parseClockToken(range[1], mer.startsWith("p") ? "pm" : mer.startsWith("a") ? "am" : "");
    const end = parseClockToken(range[3], mer.startsWith("p") ? "pm" : mer.startsWith("a") ? "am" : "");
    if (start && end) {
      event.start = onNyDate(event.start, start.h, start.min);
      event.end = onNyDate(event.start, end.h, end.min);
      event.allDay = false;
      return;
    }
  }
  const at = text.match(/\bat\s+(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)/i);
  if (at) {
    const start = parseClockToken(`${at[1]} ${at[2]}`);
    if (start) {
      event.start = onNyDate(event.start, start.h, start.min);
      event.end = onNyDate(event.start, start.h + 3, start.min);
      event.allDay = false;
    }
  }
}

function preferAssessment(a: CourseEvent, b: CourseEvent) {
  const score = (e: CourseEvent) =>
    (looksAllDay(e) ? 0 : 5) +
    (e.source === "syllabus" ? 3 : 0) +
    (e.source === "manual" ? 2 : 0) +
    (e.details?.length || 0) / 200 +
    (e.location && !/^tbd$/i.test(e.location) ? 1 : 0);
  return score(a) >= score(b) ? a : b;
}

export type CalendarLens = "all" | "majors" | "office" | "psets" | "course" | "other";

export function eventInCalendarLens(event: CourseEvent, lens: CalendarLens) {
  if (lens === "all") return true;
  if (lens === "office") return looksLikeOfficeHour(event);
  if (lens === "psets") return isWeeklyWork(event) || event.type === "pset";
  if (lens === "majors") {
    return (
      isMajorAssessment(event) ||
      event.type === "exam" ||
      event.type === "quiz" ||
      event.type === "project" ||
      event.type === "assignment"
    );
  }
  if (lens === "course") return Boolean(event.courseId) && !looksLikeOfficeHour(event);
  return !event.courseId;
}

/** Turn dozens of Google-expanded weekly copies into one recurring row so the calendar stays fast. */
export function collapseGoogleSeries(state: Pick<AppState, "events">) {
  const groups = new Map<string, CourseEvent[]>();
  for (const e of state.events) {
    if (e.source !== "google" || e.recurrence || e.canceled) continue;
    if (shouldNotRecur(e) || isWeeklyWork(e) || e.type === "exam" || e.type === "quiz" || assessmentStamp(e)) continue;
    const d = new Date(e.start);
    const key = `${(e.title || "").trim().toLowerCase()}|${e.googleCalendarId || ""}|${d.getDay()}|${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    const list = groups.get(key) || [];
    list.push(e);
    groups.set(key, list);
  }
  const drop = new Set<string>();
  const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
  for (const list of groups.values()) {
    if (list.length < 4) continue;
    list.sort((a, b) => a.start.localeCompare(b.start));
    const keep = list[0];
    const last = list[list.length - 1];
    keep.recurrence = {
      freq: "weekly",
      interval: 1,
      byDay: [days[new Date(keep.start).getDay()]],
      until: last.end || last.start,
    };
    for (const extra of list.slice(1)) drop.add(extra.id);
  }
  if (drop.size) state.events = state.events.filter((e) => !drop.has(e.id));
  collapseDuplicateSeries(state);
}

/** Two weekly office-hour/lecture rows at the same weekday and time are one series (Google import IDs often differ by one character). */
export function collapseDuplicateSeries(state: Pick<AppState, "events"> & { courses?: AppState["courses"] }) {
  const courses = "courses" in state ? state.courses || [] : [];
  const groups = new Map<string, CourseEvent[]>();
  for (const event of state.events) {
    if (event.canceled || !event.recurrence) continue;
    if (event.type !== "office_hour" && event.type !== "lecture") continue;
    if (shouldNotRecur(event) || isWeeklyWork(event)) continue;
    const code = courses.find((c) => c.id === event.courseId)?.code;
    const key = recurringSlotKey(event, code);
    const list = groups.get(key) || [];
    list.push(event);
    groups.set(key, list);
  }
  const drop = new Set<string>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => {
      const score = (e: CourseEvent) => (e.source === "google" ? 2 : 0) + (e.googleEventId ? 1 : 0) + (e.details?.length || 0) / 400;
      return score(b) - score(a) || a.start.localeCompare(b.start);
    });
    const keep = list[0];
    for (const extra of list.slice(1)) {
      absorbGoogle(keep, extra);
      if (extra.location && !keep.location) keep.location = extra.location;
      if (extra.start < keep.start) {
        keep.start = extra.start;
        keep.end = extra.end;
      }
      drop.add(extra.id);
    }
  }
  if (drop.size) state.events = state.events.filter((e) => !drop.has(e.id));
}

export function attachEventsToCourses(state: { events: CourseEvent[]; courses: { id: string; code: string; name?: string }[] }) {
  for (const event of state.events) {
    if (event.canceled) continue;
    const id = inferCourseId(event, state.courses);
    if (id) event.courseId = id;
    if (looksLikeOfficeHour(event) && event.type !== "exam") event.type = "office_hour";
    const course = id ? state.courses.find((c) => c.id === id) : undefined;
    if (course && (event.source === "syllabus" || event.source === "assistant" || /^(problem set|homework|lecture|midterm|final exam)\b/i.test(event.title))) {
      event.title = formatCourseEventTitle(course.code, event.title);
    }
    if ((event.type === "exam" || event.type === "quiz" || shouldNotRecur(event)) && event.recurrence) event.recurrence = null;
    applyStatedExamTimes(event);
    if (course) event.title = tidyCourseEventTitle(event.title, course.code);
    if (isRoutineNoise(event)) {
      event.googleAlerts = false;
      event.alerts = [];
    }
  }
}

export function psetNumber(title: string) {
  const m = title.match(/(?:problem\s*set|p-?set|pset|homework|hw)\s*#?\s*([A-Za-z]|\d+)/i);
  return m?.[1]?.toUpperCase() || null;
}

/** Same family of weekly work, ignoring the set number so PS 2 and PS 3 on one due slot are one item. */
export function workFamily(title: string, code?: string) {
  const t = foldTitle(title, code);
  if (/weekly\s+problem\s+sets?/.test(t) && !/\d/.test(t)) return "pset-generic";
  if (/problem set|p-?set|\bpset\b/.test(t)) return "pset";
  if (/\bhomework\b|\bhw\b/.test(t)) return "hw";
  return null;
}

function clockBucket(iso: string) {
  const d = new Date(iso);
  return Math.round((d.getUTCHours() * 60 + d.getUTCMinutes()) / 15);
}

function recurringDays(event: CourseEvent) {
  const fromRec = event.recurrence?.byDay?.map((d) => d.toUpperCase()).filter(Boolean);
  if (fromRec?.length) return [...fromRec].sort().join(",");
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][new Date(event.start).getUTCDay()];
}

function seriesWho(title: string, code?: string) {
  return foldTitle(title, code)
    .replace(/\b[a-z]{2,6}(?:\s*&\s*[a-z]{2,4})?\s+\d{3,5}[a-z]?\b/g, " ")
    .replace(/\b(peer tutor|undergraduate|teaching fellow|ta|tf|prof|professor|instructor|office hours|oh)\b/g, " ")
    .replace(/\b(st|street|rm|room|bldg|building|trumbull)\b.*$/g, " ")
    .replace(/\b\d+[a-z]?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function recurringSlotKey(event: CourseEvent, code?: string) {
  return `${event.courseId || "none"}|${event.type}|${seriesWho(event.title, code)}|${recurringDays(event)}|${clockBucket(event.start)}`;
}

function weeklySlotKey(event: CourseEvent, courses: { id: string; code: string }[] = []) {
  const courseId = inferCourseId(event, courses) || "none";
  const code = courses.find((c) => c.id === courseId)?.code;
  const family = workFamily(event.title, code) || foldTitle(event.title, code) || "weekly";
  return `${courseId}|${dayKey(event.start)}|${family}`;
}

function preferEvent(a: CourseEvent, b: CourseEvent) {
  const aScore =
    (a.source === "syllabus" ? 4 : 0) +
    (psetNumber(a.title) ? 3 : 0) +
    (a.details?.length || 0) / 200 +
    (a.releasedAt ? 1 : 0);
  const bScore =
    (b.source === "syllabus" ? 4 : 0) +
    (psetNumber(b.title) ? 3 : 0) +
    (b.details?.length || 0) / 200 +
    (b.releasedAt ? 1 : 0);
  return aScore >= bScore ? a : b;
}

function absorbGoogle(keep: CourseEvent, drop: CourseEvent) {
  if (!keep.googleEventId && drop.googleEventId) {
    keep.googleEventId = drop.googleEventId;
    keep.googleCalendarId = drop.googleCalendarId;
  }
  if (!keep.courseId && drop.courseId) keep.courseId = drop.courseId;
  if (drop.details && drop.details.length > (keep.details?.length || 0)) keep.details = drop.details;
}

export function collapseWeeklyByDay(events: CourseEvent[], courses: { id: string; code: string }[] = []) {
  const map = new Map<string, CourseEvent>();
  for (const event of events) {
    if (event.canceled || !isWeeklyWork(event)) continue;
    const key = weeklySlotKey(event, courses);
    const prev = map.get(key);
    map.set(key, prev ? preferEvent(prev, event) : event);
  }
  return [...map.values()];
}

export function findMatchingEvent(
  events: CourseEvent[],
  input: Pick<CourseEvent, "courseId" | "title" | "start" | "type" | "recurrence">,
  courses: { id: string; code: string }[] = [],
) {
  const inputNum = psetNumber(input.title);
  const inputDay = dayKey(input.start);
  const inputCode = courses.find((c) => c.id === input.courseId)?.code;
  const inputStamp = assessmentStamp(input, inputCode);
  const foldedIn = foldTitle(input.title, inputCode);
  return events.find((e) => {
    if (e.canceled) return false;
    const sameCourse = e.courseId === input.courseId || inferCourseId(e, courses) === input.courseId;
    if (!sameCourse) return false;
    const code = courses.find((c) => c.id === e.courseId)?.code || inputCode;
    if (e.title.trim().toLowerCase() === input.title.trim().toLowerCase() && e.start.slice(0, 16) === input.start.slice(0, 16)) {
      return true;
    }
    if (foldTitle(e.title, code) === foldedIn && inputDay === dayKey(e.start)) return true;
    const stamp = assessmentStamp(e, code);
    if (inputStamp && stamp && inputStamp === stamp && inputDay === dayKey(e.start)) return true;
    const famIn = workFamily(input.title, inputCode);
    const famE = workFamily(e.title, code);
    if (famIn && famIn === famE && famIn !== "pset-generic") {
      const close = Math.abs(new Date(e.start).getTime() - new Date(input.start).getTime()) < 36 * 3600 * 1000;
      if (inputDay === dayKey(e.start) || close) return true;
    }
    if (inputNum && psetNumber(e.title) === inputNum && weekKey(e.start) === weekKey(input.start)) return true;
    const otherNum = psetNumber(e.title);
    if (inputNum && otherNum && inputNum !== otherNum && famIn !== famE) return false;
    const nearby =
      isWeeklyWork({ title: input.title, type: input.type } as CourseEvent) &&
      isWeeklyWork(e) &&
      Math.abs(new Date(e.start).getTime() - new Date(input.start).getTime()) < 6.5 * 86400000;
    if (nearby && (!inputNum || !otherNum) && foldTitle(e.title, code) === foldedIn) return true;
    if (["assignment", "reading", "project", "quiz"].includes(input.type) && ["assignment", "reading", "project", "quiz", "pset"].includes(e.type) && dayKey(e.start) === inputDay) {
      const a = foldTitle(e.title, code);
      const b = foldedIn;
      if (a && b && (a.includes(b.slice(0, 18)) || b.includes(a.slice(0, 18)))) return true;
    }
    return false;
  });
}

export function dedupeEvents(state: { events: CourseEvent[]; courses?: Course[] }) {
  const courses = state.courses || [];
  const removed: CourseEvent[] = [];
  const datedLectureCourses = new Set(
    state.events.filter((e) => e.type === "lecture" && !e.recurrence && /^L\d+/i.test(e.title)).map((e) => inferCourseId(e, courses) || e.courseId),
  );
  const datedPsetCourses = new Set(
    state.events.filter((e) => isWeeklyWork(e) && !e.recurrence).map((e) => inferCourseId(e, courses) || e.courseId),
  );
  const byGoogle = new Map<string, CourseEvent>();
  const bySig = new Map<string, CourseEvent>();
  const keep: CourseEvent[] = [];
  for (const event of state.events) {
    if (event.canceled) {
      keep.push(event);
      continue;
    }
    const courseId = inferCourseId(event, courses) || event.courseId;
    if (event.type === "lecture" && event.recurrence && courseId && datedLectureCourses.has(courseId)) {
      removed.push(event);
      continue;
    }
    if (event.recurrence && isWeeklyWork(event) && courseId && datedPsetCourses.has(courseId)) {
      removed.push(event);
      continue;
    }
    if (event.googleEventId && byGoogle.has(event.googleEventId)) {
      const prev = byGoogle.get(event.googleEventId)!;
      if (event.details.length > prev.details.length) prev.details = event.details;
      removed.push(event);
      continue;
    }
    const sig = eventSignature(event);
    if (bySig.has(sig)) {
      const prev = bySig.get(sig)!;
      absorbGoogle(prev, event);
      if (event.details.length > prev.details.length) prev.details = event.details;
      removed.push(event);
      continue;
    }
    if (event.googleEventId) byGoogle.set(event.googleEventId, event);
    bySig.set(sig, event);
    keep.push(event);
  }

  const weekly = new Map<string, CourseEvent>();
  const merged: CourseEvent[] = [];
  for (const event of keep) {
    if (event.canceled || !isWeeklyWork(event)) {
      merged.push(event);
      continue;
    }
    const key = weeklySlotKey(event, courses);
    const prev = weekly.get(key);
    if (!prev) {
      if (!event.courseId) event.courseId = inferCourseId(event, courses);
      weekly.set(key, event);
      merged.push(event);
      continue;
    }
    const winner = preferEvent(prev, event);
    const loser = winner === prev ? event : prev;
    absorbGoogle(winner, loser);
    removed.push(loser);
    if (!winner.courseId) winner.courseId = inferCourseId(winner, courses) || inferCourseId(loser, courses);
    if (winner !== prev) {
      weekly.set(key, winner);
      const idx = merged.indexOf(prev);
      if (idx >= 0) merged[idx] = winner;
    }
  }

  const byAssess = new Map<string, CourseEvent>();
  const out: CourseEvent[] = [];
  for (const event of merged) {
    if (event.canceled) {
      out.push(event);
      continue;
    }
    const courseId = inferCourseId(event, courses) || event.courseId || "none";
    const code = courses.find((c) => c.id === courseId)?.code;
    const stamp = assessmentStamp(event, code);
    if (!stamp) {
      out.push(event);
      continue;
    }
    const key = `${courseId}|${stamp}|${dayKey(event.start)}`;
    const prev = byAssess.get(key);
    if (!prev) {
      byAssess.set(key, event);
      out.push(event);
      continue;
    }
    const winner = preferAssessment(prev, event);
    const loser = winner === prev ? event : prev;
    absorbGoogle(winner, loser);
    if (loser.details && loser.details.length > (winner.details?.length || 0)) winner.details = loser.details;
    if (looksAllDay(winner) && !looksAllDay(loser)) {
      winner.start = loser.start;
      winner.end = loser.end;
      winner.allDay = loser.allDay;
    }
    applyStatedExamTimes(winner);
    removed.push(loser);
    if (winner !== prev) {
      byAssess.set(key, winner);
      const idx = out.indexOf(prev);
      if (idx >= 0) out[idx] = winner;
    }
  }

  state.events = out;
  return removed;
}

