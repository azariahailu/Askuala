import { officeHourTitle } from "./ids";
import { combineTime, termEnd } from "./apply-extraction";
import { findMatchingEvent, formatCourseEventTitle, isRoutineNoise } from "./calendar-utils";
import { nid, nowIso, phoneAlertRules } from "./ids";
import { datedAssignmentEvents } from "./syllabus-parse";
import type { AppState, Course, CourseEvent } from "./types";

const DAYS: [RegExp, string][] = [
  [/\b(mondays?|mon)\b/i, "MO"],
  [/\b(tuesdays?|tue|tues)\b/i, "TU"],
  [/\b(wednesdays?|wed)\b/i, "WE"],
  [/\b(thursdays?|thu|thur|thurs)\b/i, "TH"],
  [/\b(fridays?|fri)\b/i, "FR"],
  [/\b(saturdays?|sat)\b/i, "SA"],
  [/\b(sundays?|sun)\b/i, "SU"],
];

function daysIn(text: string) {
  if (/\bMWF\b/i.test(text)) return ["MO", "WE", "FR"];
  if (/\bMW\b/i.test(text) || /mon(?:day)?\/wed/i.test(text)) return ["MO", "WE"];
  if (/\bTTh\b|\bTR\b/i.test(text) || /tue(?:sday)?\/thu/i.test(text)) return ["TU", "TH"];
  const out: string[] = [];
  for (const [re, d] of DAYS) if (re.test(text) && !out.includes(d)) out.push(d);
  return out;
}

function clock(raw: string, fallbackH: number, fallbackM = 0) {
  const m = raw.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return `${String(fallbackH).padStart(2, "0")}:${String(fallbackM).padStart(2, "0")}`;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || "").replace(/\./g, "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && h <= 7) h += 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function parseMeetingPattern(pattern: string) {
  const text = pattern || "";
  const byDay = daysIn(text);
  const times = text.match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*[- to ]\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
  if (!byDay.length || !times) return null;
  return { byDay, start: clock(times[1], 11, 35), end: clock(times[2], 12, 50) };
}

export function parseOfficeHourBlobs(blob: string, assume = false) {
  const out: { days: string[]; start: string; end: string; location: string }[] = [];
  const chunks = blob.split(/\n+/);
  for (const line of chunks) {
    if (!assume && !/\boffice\s*hours?\b|\bOH\b/i.test(line) && !/\bdrop-?in\b/i.test(line)) continue;
    const times = line.match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
    if (!times) continue;
    const days = daysIn(line);
    const loc = line.match(/\b(LC|WLH|HQ|SSS|DL|AKW|ML|KLINE|LINSLEY|STOECKEL|BECTON)\s*\d+[A-Z]?\b/i)?.[0] || "";
    out.push({
      days: days.length ? days : ["WE"],
      start: clock(times[1], 16, 0),
      end: clock(times[2], 17, 0),
      location: loc,
    });
  }
  const loose = blob.match(
    /\boffice\s*hours?\b[:\s]*([A-Za-z]{1,9})[^\n]{0,12}(\d{1,2}(?::\d{2})?)\s*[- to ]\s*(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)?/i,
  );
  if (loose && !out.length) {
    const mer = loose[4] || "pm";
    out.push({
      days: daysIn(loose[1]) || ["WE"],
      start: clock(`${loose[2]} ${mer}`, 16),
      end: clock(`${loose[3]} ${mer}`, 17),
      location: "",
    });
  }
  return out;
}

function pushOrMerge(
  state: AppState,
  input: Omit<CourseEvent, "id" | "createdAt" | "updatedAt" | "googleEventId" | "googleCalendarId" | "viewOnly" | "canceled" | "googleAlerts" | "releasedAt"> & {
    releasedAt?: string | null;
    googleAlerts?: boolean;
    alerts?: CourseEvent["alerts"];
  },
) {
  const ping = !isRoutineNoise(input);
  const alerts = input.alerts?.length ? input.alerts : ping ? phoneAlertRules() : [];
  const googleAlerts = input.googleAlerts ?? ping;
  const dup = findMatchingEvent(state.events, input, state.courses);
  const now = nowIso();
  if (dup) {
    Object.assign(dup, input, { updatedAt: now, canceled: false, googleAlerts, alerts: dup.alerts?.length ? dup.alerts : alerts });
    return;
  }
  state.events.push({
    id: nid(),
    googleEventId: null,
    googleCalendarId: null,
    viewOnly: false,
    releasedAt: input.releasedAt ?? null,
    canceled: false,
    createdAt: now,
    updatedAt: now,
    ...input,
    googleAlerts,
    alerts,
  });
}

type ScheduleInput = Parameters<typeof pushOrMerge>[1];

function clockKey(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function slotKey(byDay: string[] | undefined, startIso: string) {
  return `${(byDay || []).join(",")}|${clockKey(startIso)}`;
}

/** Keep the row that Google already knows about so its id survives. */
function stablest(events: CourseEvent[]) {
  return [...events].sort((a, b) => Number(Boolean(b.googleEventId)) - Number(Boolean(a.googleEventId)))[0];
}

/**
 * Rewrite generated rows without changing their ids: a new id every read would orphan the
 * Google copy and make the next sync add a duplicate.
 */
function reconcile(state: AppState, existing: CourseEvent[], desired: { key: string; input: ScheduleInput }[]) {
  const pool = [...existing];
  const take = (key: string) => {
    const exact = pool.findIndex((e) => slotKey(e.recurrence?.byDay, e.start) === key || e.title.toLowerCase() === key);
    const idx = exact >= 0 ? exact : pool.length ? 0 : -1;
    return idx >= 0 ? pool.splice(idx, 1)[0] : null;
  };
  for (const { key, input } of desired) {
    const hit = take(key);
    if (!hit) {
      pushOrMerge(state, input);
      continue;
    }
    Object.assign(hit, input, { id: hit.id, createdAt: hit.createdAt, updatedAt: nowIso(), canceled: false });
  }
  for (const leftover of pool) {
    if (leftover.googleEventId) leftover.canceled = true;
    else state.events = state.events.filter((e) => e.id !== leftover.id);
  }
}

/** After a course edit, rewrite that course's repeating lecture + instructor office hours on the calendar. */
export function applyCourseSchedule(state: AppState, course: Course) {
  const until = termEnd(course.term, course.year);
  const meeting = parseMeetingPattern(course.meetingPattern || "");
  if (meeting) {
    const start = combineTime(course.year, course.term, meeting.start);
    const existing = state.events.filter(
      (e) =>
        !e.canceled &&
        e.courseId === course.id &&
        e.type === "lecture" &&
        e.recurrence &&
        (e.source === "syllabus" || e.source === "manual" || e.source === "assistant"),
    );
    const keep = stablest(existing);
    reconcile(state, keep ? [keep, ...existing.filter((e) => e !== keep)] : [], [
      {
        key: slotKey(meeting.byDay, start),
        input: {
          courseId: course.id,
          title: formatCourseEventTitle(course.code, "Lecture"),
          details: `${course.meetingPattern} · ${course.location || ""}`.trim(),
          type: "lecture",
          start,
          end: combineTime(course.year, course.term, meeting.end),
          allDay: false,
          location: course.location,
          weight: "",
          source: "manual",
          recurrence: { freq: "weekly", interval: 1, byDay: meeting.byDay, until },
        },
      },
    ]);
  }

  const ohs = [
    ...parseOfficeHourBlobs(course.officeHours || "", true),
    ...parseOfficeHourBlobs(`${course.extraContext || ""}\n${course.meetingPattern || ""}`),
  ];
  if (ohs.length) {
    const existing = state.events.filter(
      (e) =>
        !e.canceled &&
        e.courseId === course.id &&
        e.type === "office_hour" &&
        e.recurrence &&
        (e.source === "syllabus" || e.source === "manual" || e.source === "assistant") &&
        !/TA |peer tutor|TF /i.test(e.title),
    );
    reconcile(
      state,
      existing,
      ohs.map((oh) => {
        const start = combineTime(course.year, course.term, oh.start);
        return {
          key: slotKey(oh.days, start),
          input: {
            courseId: course.id,
            title: officeHourTitle(course.instructor || "Instructor", course.code, oh.location),
            details: `Weekly office hours ${oh.start} to ${oh.end}${oh.location ? ` at ${oh.location}` : ""}.`,
            type: "office_hour" as const,
            start,
            end: combineTime(course.year, course.term, oh.end),
            allDay: false,
            location: oh.location || course.location,
            weight: "",
            source: "manual" as const,
            recurrence: { freq: "weekly" as const, interval: 1, byDay: oh.days, until },
          },
        };
      }),
    );
  }

  const extraWork = datedAssignmentEvents(`${course.extraContext || ""}\n${course.officeHours || ""}`, course.year, course.term, course.code);
  if (extraWork.length) {
    const titles = new Set(extraWork.map((e) => e.title.toLowerCase()));
    const existing = state.events.filter(
      (e) => !e.canceled && e.courseId === course.id && e.source === "manual" && titles.has(e.title.toLowerCase()),
    );
    reconcile(
      state,
      existing,
      extraWork.map((ev) => ({
        key: ev.title.toLowerCase(),
        input: {
          courseId: course.id,
          title: ev.title,
          details: ev.details,
          type: ev.type,
          start: ev.start,
          end: ev.end,
          allDay: ev.allDay,
          location: ev.location || course.location,
          weight: ev.weight,
          source: "manual" as const,
          recurrence: ev.recurrence,
        },
      })),
    );
  }
}

const JUNK_NAME =
  /^(course summary|untitled( course)?|new course|date\s*details)$/i;

function isJunkName(name: string) {
  const n = (name || "").trim();
  if (!n) return true;
  if (JUNK_NAME.test(n)) return true;
  if (/calendar items|parsed \w/i.test(n)) return true;
  return false;
}

export function salvageCourseName(course: Course) {
  if (!isJunkName(course.name)) return course.name.trim();
  const text = course.syllabusText || "";
  const code = course.code.replace(/\s+/g, "\\s*");
  const titled = text.match(new RegExp(`${code}\\s*[:\\-]\\s*([^\\n]{8,90})`, "i"));
  if (titled) {
    const name = titled[1].replace(/\s+/g, " ").trim();
    if (!isJunkName(name)) return name;
  }
  return course.code;
}
