import type { AppState, CourseEvent, EventType } from "./types";
import {
  assessmentStamp,
  collapseDuplicateSeries,
  dayKey,
  foldTitle,
  formatCourseEventTitle,
  inferCourseId,
  isGenericWorkTitle,
  isRoutineNoise,
  looksAllDay,
  looksLikeOfficeHour,
  psetNumber,
  shouldNotRecur,
  tidyCourseEventTitle,
  workFamily,
} from "./calendar-utils";
import { syllabusOwnsProblemSets } from "./syllabus-parse";

function classifyType(event: CourseEvent): EventType {
  const t = event.title || "";
  if (/\bno lecture\b/i.test(t)) return event.type === "lecture" ? "lecture" : event.type;
  if (looksLikeOfficeHour(event) || /\bOH\b/.test(t)) return "office_hour";
  if (/^read\b|\bread ·|\breading period/i.test(t)) return "reading";
  if (/\b(paper|draft|essay|proposal)\b/i.test(t) && !/\bread\b/i.test(t)) return "assignment";
  if (/\b(midterm|final exam|\bexams?\b)\b/i.test(t)) return "exam";
  if (/\bquiz\b/i.test(t)) return "quiz";
  if (/problem set|p-?set|\bhomework\b|\bhw\s*\d/i.test(t)) return "pset";
  if (/\bproject\b|\bpresentation\b/i.test(t)) return "project";
  if (/\(\s*FA\d{2}\s*\):/i.test(t)) return "lecture";
  if (/\blecture\b/i.test(t) || /\bL\d+\b/.test(t)) return "lecture";
  if (/\bread(ing)?\b/i.test(t)) return "reading";
  return event.type;
}

function specificScore(e: CourseEvent) {
  const folded = foldTitle(e.title);
  return (
    (looksAllDay(e) ? 0 : 5) +
    (e.source === "google" ? 1 : 0) +
    (e.source === "syllabus" ? 2 : 0) +
    (isGenericWorkTitle(e.title) ? 0 : 3) +
    (folded === "exam" || folded === "quiz" ? -4 : 0) +
    (/\bearly\s+midterm\b/i.test(e.title) ? -2 : 0) +
    (/\b(midterm|final)\b/i.test(e.title) ? 2 : 0) +
    (e.details?.length || 0) / 200 +
    (e.googleEventId ? 1 : 0)
  );
}

function preferSpecific(a: CourseEvent, b: CourseEvent) {
  return specificScore(a) >= specificScore(b) ? a : b;
}

function clusterByStart(events: CourseEvent[], withinHours: number) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const out: CourseEvent[][] = [];
  let current: CourseEvent[] = [];
  let anchor = 0;
  for (const event of sorted) {
    const t = new Date(event.start).getTime();
    if (!current.length || t - anchor <= withinHours * 3600 * 1000) {
      if (!current.length) anchor = t;
      current.push(event);
      continue;
    }
    out.push(current);
    current = [event];
    anchor = t;
  }
  if (current.length) out.push(current);
  return out;
}

function isWeeklyWorkish(event: CourseEvent) {
  return event.type === "pset" || /problem set|homework|p-?set|\bhw\s*\d/i.test(event.title);
}

function titleQuality(event: CourseEvent) {
  const folded = foldTitle(event.title);
  return (
    (looksAllDay(event) ? 0 : 5) +
    (folded === "exam" || folded === "quiz" ? -4 : 0) +
    (/\bearly\s+midterm\b/i.test(event.title) ? -2 : 0) +
    (/\bskill check\b/i.test(event.title) ? 4 : 0) +
    (/\bmidterm\s*\d/i.test(event.title) ? 3 : 0) +
    (/\bfinal exam\b/i.test(event.title) ? 3 : 0) +
    (event.title?.length || 0) / 80
  );
}

function absorb(keep: CourseEvent, drop: CourseEvent) {
  if (!keep.googleEventId && drop.googleEventId) {
    keep.googleEventId = drop.googleEventId;
    keep.googleCalendarId = drop.googleCalendarId;
  }
  if (drop.details && drop.details.length > (keep.details?.length || 0)) keep.details = drop.details;
  if (drop.location && !keep.location) keep.location = drop.location;
  if (titleQuality(drop) > titleQuality(keep)) keep.title = drop.title;
  if (looksAllDay(keep) && !looksAllDay(drop)) {
    keep.start = drop.start;
    keep.end = drop.end;
    keep.allDay = drop.allDay;
  }
}

/** One pass that keeps dated, named work and drops repeating generic copies: every course. */
export function normalizePlannerEvents(state: AppState) {
  const courses = state.courses || [];
  for (const event of state.events) {
    if (event.canceled) continue;
    const id = inferCourseId(event, courses);
    if (id) event.courseId = id;
    event.type = classifyType(event);
    const course = id ? courses.find((c) => c.id === id) : undefined;
    event.title = tidyCourseEventTitle(event.title, course?.code);
    const stamp = assessmentStamp(event, course?.code);
    if (course && stamp === "midterm-1" && /early/i.test(event.title) && !/skill check/i.test(event.title)) {
      event.title = formatCourseEventTitle(course.code, "Midterm 1");
    }
    if (course && stamp === "midterm-2" && /second/i.test(event.title) && !/skill check/i.test(event.title)) {
      event.title = formatCourseEventTitle(course.code, "Midterm 2");
    }
    if (shouldNotRecur(event) && event.recurrence) event.recurrence = null;
    if (isRoutineNoise(event)) {
      event.googleAlerts = false;
      event.alerts = [];
    }
  }

  collapseDuplicateSeries(state);

  const googleNums = new Map<string, Set<string>>();
  const googleAny = new Set<string>();
  for (const event of state.events) {
    if (event.canceled || event.source !== "google" || !event.courseId) continue;
    if (!isWeeklyWorkish(event)) continue;
    googleAny.add(event.courseId);
    const n = psetNumber(event.title);
    if (!n) continue;
    const set = googleNums.get(event.courseId) || new Set<string>();
    set.add(n);
    googleNums.set(event.courseId, set);
  }

  const drop = new Set<string>();
  for (const event of state.events) {
    if (event.canceled || !event.courseId) continue;
    if (event.source === "google") continue;
    if (!isWeeklyWorkish(event)) continue;
    const n = psetNumber(event.title);
    const nums = googleNums.get(event.courseId);
    if (n && nums?.has(n)) {
      drop.add(event.id);
      continue;
    }
    const code = courses.find((c) => c.id === event.courseId)?.code;
    const course = courses.find((c) => c.id === event.courseId);
    if (course && !syllabusOwnsProblemSets(course.syllabusText || "") && event.source === "syllabus" && isGenericWorkTitle(event.title, code)) {
      drop.add(event.id);
      continue;
    }
    if (
      isGenericWorkTitle(event.title, code) &&
      googleAny.has(event.courseId) &&
      (event.source === "syllabus" || event.source === "assistant")
    ) {
      drop.add(event.id);
    }
    if (workFamily(event.title, code) === "pset-generic") drop.add(event.id);
  }

  mergeSameSlotPsets(state, drop, courses);

  const buckets = new Map<string, CourseEvent[]>();
  for (const event of state.events) {
    if (event.canceled || drop.has(event.id)) continue;
    const courseId = event.courseId || "none";
    const code = courses.find((c) => c.id === courseId)?.code;
    const examish = event.type === "exam" || event.type === "quiz";
    const workish = isWeeklyWorkish(event) || event.type === "assignment" || event.type === "reading";
    if (!examish && !workish) continue;
    const folded = foldTitle(event.title, code);
    const stamp = examish ? assessmentStamp(event, code) : null;
    const paper = folded.match(/\bpaper\s+(one|two|three|\d+)\b/);
    const draftish = /\b(draft|due)\b/.test(folded) && !/\b(workshop|presentation)\b/.test(folded);
    const stem = folded.replace(/^(assignment|read)\s+/, "");
    const key = examish
      ? stamp
        ? `${courseId}|${stamp}`
        : `${courseId}|exam|${dayKey(event.start)}`
      : paper && draftish
        ? `${courseId}|paper-${paper[1]}|${dayKey(event.start)}`
        : `${courseId}|${stem}|${dayKey(event.start)}`;
    const list = buckets.get(key) || [];
    list.push(event);
    buckets.set(key, list);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    // Same named assessment on nearby dates is one item; the same name a month later is a real second sitting.
    for (const cluster of clusterByStart(list, 48)) {
      if (cluster.length < 2) continue;
      cluster.sort((a, b) => specificScore(b) - specificScore(a) || a.id.localeCompare(b.id));
      const keep = cluster[0];
      for (const extra of cluster.slice(1)) {
        absorb(keep, extra);
        drop.add(extra.id);
      }
    }
  }

  const namedExams = state.events.filter((e) => !e.canceled && !drop.has(e.id) && (e.type === "exam" || e.type === "quiz") && assessmentStamp(e, courses.find((c) => c.id === e.courseId)?.code));
  for (const event of state.events) {
    if (event.canceled || drop.has(event.id) || (event.type !== "exam" && event.type !== "quiz")) continue;
    const code = courses.find((c) => c.id === event.courseId)?.code;
    if (assessmentStamp(event, code)) continue;
    const folded = foldTitle(event.title, code);
    if (folded !== "exam" && folded !== "quiz") continue;
    const t = new Date(event.start).getTime();
    const hit = namedExams.find(
      (n) => n.courseId === event.courseId && Math.abs(new Date(n.start).getTime() - t) < 48 * 3600 * 1000,
    );
    if (hit) {
      absorb(hit, event);
      drop.add(event.id);
    }
  }

  if (drop.size) state.events = state.events.filter((e) => !drop.has(e.id));
  collapseDuplicateSeries(state);
  renumberNumericProblemSets(state);
}

function mergeSameSlotPsets(state: AppState, drop: Set<string>, courses: AppState["courses"]) {
  const groups = new Map<string, CourseEvent[]>();
  for (const event of state.events) {
    if (event.canceled || drop.has(event.id)) continue;
    const code = courses.find((c) => c.id === event.courseId)?.code;
    const fam = workFamily(event.title, code);
    if (!fam || fam === "pset-generic") continue;
    const key = `${event.courseId || "none"}|${fam}|${dayKey(event.start)}`;
    const list = groups.get(key) || [];
    list.push(event);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => specificScore(b) - specificScore(a) || a.start.localeCompare(b.start));
    const keep = list[0];
    for (const extra of list.slice(1)) {
      absorb(keep, extra);
      drop.add(extra.id);
    }
  }

  const leftover = state.events.filter((e) => {
    if (e.canceled || drop.has(e.id)) return false;
    const code = courses.find((c) => c.id === e.courseId)?.code;
    const fam = workFamily(e.title, code);
    return Boolean(fam && fam !== "pset-generic");
  });
  leftover.sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < leftover.length; i++) {
    const a = leftover[i];
    const code = courses.find((c) => c.id === a.courseId)?.code;
    const fam = workFamily(a.title, code);
    for (let j = i + 1; j < leftover.length; j++) {
      const b = leftover[j];
      if (b.courseId !== a.courseId) continue;
      if (workFamily(b.title, code) !== fam) continue;
      if (Math.abs(new Date(b.start).getTime() - new Date(a.start).getTime()) > 36 * 3600 * 1000) continue;
      if (drop.has(a.id) || drop.has(b.id)) continue;
      const keep = specificScore(a) >= specificScore(b) ? a : b;
      const extra = keep === a ? b : a;
      absorb(keep, extra);
      drop.add(extra.id);
    }
  }
}

function renumberNumericProblemSets(state: AppState) {
  const courses = state.courses || [];
  const byCourse = new Map<string, CourseEvent[]>();
  for (const event of state.events) {
    if (event.canceled) continue;
    const code = courses.find((c) => c.id === event.courseId)?.code;
    if (workFamily(event.title, code) !== "pset") continue;
    const n = psetNumber(event.title);
    if (!n || !event.courseId) continue;
    const list = byCourse.get(event.courseId) || [];
    list.push(event);
    byCourse.set(event.courseId, list);
  }
  for (const [courseId, list] of byCourse) {
    if (list.some((e) => !/^\d+$/.test(psetNumber(e.title) || ""))) continue;
    const code = courses.find((c) => c.id === courseId)?.code;
    if (!code) continue;
    list.sort((a, b) => a.start.localeCompare(b.start));
    list.forEach((event, i) => {
      event.type = "pset";
      event.title = formatCourseEventTitle(code, `Problem Set ${i + 1}`);
    });
  }
}

export { preferSpecific };
