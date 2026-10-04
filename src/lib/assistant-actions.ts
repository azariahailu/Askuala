import { applyCourseSchedule, parseOfficeHourBlobs } from "./course-schedule";
import { combineTime, termEnd } from "./apply-extraction";
import { findMatchingEvent, inferCourseId, isRoutineNoise, normalizeCourseCode, shouldNotRecur } from "./calendar-utils";
import { nid, nowIso, officeHourTitle, phoneAlertRules } from "./ids";
import { addPlannedCourse, deleteCourse } from "./planned-courses";
import { markCourseDriveSync } from "./google-drive";
import { resolveUiKey } from "./ui-copy";
import type { AppState, Course, CourseEvent, CourseNote, EventType, Recurrence, TermName } from "./types";

export type PlannerAction = {
  op:
    | "update_course"
    | "add_course"
    | "drop_course"
    | "delete_course"
    | "restore_course"
    | "add_event"
    | "update_event"
    | "delete_event"
    | "add_note"
    | "update_note"
    | "delete_note"
    | "set_office_hours"
    | "set_meeting"
    | "set_ui";
  course?: string;
  match?: string;
  id?: string;
  title?: string;
  body?: string;
  summary?: string;
  details?: string;
  type?: EventType;
  start?: string;
  end?: string;
  location?: string;
  fields?: Record<string, string>;
  recurrence?: Recurrence | null;
  officeHours?: string;
  meetingPattern?: string;
};

const DAYS: [RegExp, string][] = [
  [/\b(mondays?|mon)\b/i, "MO"],
  [/\b(tuesdays?|tue|tues)\b/i, "TU"],
  [/\b(wednesdays?|wed)\b/i, "WE"],
  [/\b(thursdays?|thu|thur|thurs)\b/i, "TH"],
  [/\b(fridays?|fri)\b/i, "FR"],
  [/\b(saturdays?|sat)\b/i, "SA"],
  [/\b(sundays?|sun)\b/i, "SU"],
];

export function wantsPlannerEdit(message: string) {
  return /\b(add|update|change|edit|set|move|delete|remove|drop|cancel|create|schedule|put|save|rename|apply|mark)\b/i.test(
    message,
  );
}

export function findCourse(state: AppState, hint: string | undefined | null) {
  const q = (hint || "").trim();
  if (!q) return null;
  const code = normalizeCourseCode(q);
  const qn = q.toLowerCase();
  const active = state.courses.filter((c) => !c.dropped);
  const pool = [...active, ...state.courses.filter((c) => c.dropped)];
  return (
    pool.find((c) => normalizeCourseCode(c.code) === code) ||
    pool.find((c) => qn.includes(c.code.toLowerCase())) ||
    pool.find((c) => c.code.replace(/\s+/g, "").toLowerCase() === q.replace(/\s+/g, "").toLowerCase()) ||
    pool.find((c) => c.name.toLowerCase().includes(qn)) ||
    pool.find((c) => /roadmap|b\.?s\.?\s*\/\s*m\.?a/i.test(`${c.code} ${c.name}`) && /roadmap|degree|plan|delete|remove/i.test(qn)) ||
    null
  );
}

function courseFromMessage(state: AppState, message: string) {
  const m = message.match(/\b([A-Z]{2,6})\s*-?\s*(\d{3,4}[A-Z]?)\b/i);
  if (m) return findCourse(state, `${m[1]} ${m[2]}`);
  for (const c of state.courses) {
    if (!c.dropped && message.toLowerCase().includes(c.code.toLowerCase())) return c;
  }
  return null;
}

function clockIn(text: string) {
  const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || "").replace(/\./g, "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && h > 0 && h <= 7) h += 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function daysIn(text: string) {
  const out: string[] = [];
  for (const [re, d] of DAYS) if (re.test(text) && !out.includes(d)) out.push(d);
  return out;
}

function parseWhen(raw: string, course?: Course | null) {
  const iso = Date.parse(raw);
  if (!Number.isNaN(iso) && /\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(raw).toISOString();
  const clock = clockIn(raw);
  if (clock && course) return combineTime(course.year, course.term, clock);
  return new Date().toISOString();
}

function recFromText(text: string, course?: Course | null, type?: EventType): Recurrence | null {
  if (type === "exam" || type === "quiz" || type === "project" || type === "pset" || type === "assignment" || type === "lab") return null;
  if (/\bnever\b|\bonce\b|\bthis (date|time|day) only\b|\bmidterm\b|\bfinal exam\b|\bproblem set\b|\bhomework\b/i.test(text)) return null;
  const until = course ? termEnd(course.term, course.year) : null;
  const intervalM = text.match(/every\s+(\d+)\s*(hour|day|week|month|year)/i);
  const interval = intervalM ? Number(intervalM[1]) : 1;
  if (/\bhourly\b|every hour/i.test(text) || intervalM?.[2] === "hour") return { freq: "hourly", interval, until };
  if (/\bdaily\b|every day/i.test(text) || intervalM?.[2] === "day") return { freq: "daily", interval, until };
  if (/\bmonthly\b|every month/i.test(text) || intervalM?.[2] === "month") return { freq: "monthly", interval, until };
  if (/\byearly\b|every year/i.test(text) || intervalM?.[2] === "year") return { freq: "yearly", interval, until };
  const weeklyCue = /\bweekly\b|every week|each week|every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(text);
  const pluralDays = /\b(mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b/i.test(text);
  if (weeklyCue || intervalM?.[2] === "week" || pluralDays) {
    const byDay = daysIn(text);
    return { freq: "weekly", interval, byDay: byDay.length ? byDay : undefined, until };
  }
  return null;
}

function pushEvent(state: AppState, input: Omit<CourseEvent, "id" | "createdAt" | "updatedAt" | "googleEventId" | "googleCalendarId" | "viewOnly" | "canceled" | "googleAlerts" | "releasedAt"> & { releasedAt?: string | null }) {
  const quiet = isRoutineNoise(input);
  const hit = findMatchingEvent(state.events, input, state.courses);
  const now = nowIso();
  if (hit) {
    hit.title = input.title || hit.title;
    hit.details = input.details || hit.details;
    hit.type = input.type;
    hit.start = input.start;
    hit.end = input.end ?? hit.end;
    hit.location = input.location || hit.location;
    if (input.recurrence !== undefined) hit.recurrence = shouldNotRecur({ ...hit, ...input }) ? null : input.recurrence;
    hit.updatedAt = now;
    hit.canceled = false;
    if (quiet) {
      hit.googleAlerts = false;
      hit.alerts = [];
    }
    return hit;
  }
  const event: CourseEvent = {
    id: nid(),
    googleEventId: null,
    googleCalendarId: null,
    viewOnly: false,
    releasedAt: input.releasedAt ?? null,
    canceled: false,
    createdAt: now,
    updatedAt: now,
    ...input,
    googleAlerts: !quiet,
    alerts: quiet ? [] : phoneAlertRules(),
  };
  if (shouldNotRecur(event)) event.recurrence = null;
  state.events.push(event);
  return event;
}

function matchEvent(state: AppState, course: Course | null, match: string) {
  const q = match.toLowerCase();
  return state.events.find(
    (e) =>
      !e.canceled &&
      (!course || inferCourseId(e, state.courses) === course.id) &&
      (e.title.toLowerCase().includes(q) || e.details.toLowerCase().includes(q) || e.type === q),
  );
}

export function executeJsonActions(state: AppState, actions: PlannerAction[]) {
  const logs: string[] = [];
  for (const a of actions) {
    const course = findCourse(state, a.course) || courseFromMessage(state, `${a.course || ""} ${a.title || ""}`);
    try {
      if (a.op === "add_course" && (a.title || a.course || a.fields?.code || a.fields?.name)) {
        const termRaw = String(a.fields?.term || "");
        const term = (["Fall", "Spring", "Summer"].includes(termRaw) ? termRaw : "Fall") as TermName;
        const year = Number(a.fields?.year || a.start?.slice(0, 4) || 2026);
        const { course: added, created } = addPlannedCourse(state, {
          code: String(a.fields?.code || a.course || "PLAN"),
          name: String(a.fields?.name || a.title || a.details || "Planned course"),
          term,
          year,
        });
        markCourseDriveSync(added);
        logs.push(created ? `Added ${added.code}: ${added.name} (${added.term} ${added.year}).` : `${added.code} was already on ${added.term} ${added.year}.`);
      } else if (a.op === "update_course" && course && a.fields) {
        markCourseDriveSync(course, { code: course.code, name: course.name, year: course.year, term: course.term });
        Object.assign(course, a.fields, { updatedAt: nowIso() });
        applyCourseSchedule(state, course);
        logs.push(`Updated ${course.code}.`);
      } else if (a.op === "delete_course" && course) {
        const label = `${course.code}: ${course.name}`;
        deleteCourse(state, course);
        logs.push(`Deleted ${label} (removed, not dropped).`);
      } else if (a.op === "drop_course" && course) {
        course.dropped = true;
        course.updatedAt = nowIso();
        logs.push(`Dropped ${course.code}.`);
      } else if (a.op === "restore_course" && course) {
        course.dropped = false;
        course.updatedAt = nowIso();
        logs.push(`Restored ${course.code}.`);
      } else if (a.op === "set_meeting" && course) {
        course.meetingPattern = a.meetingPattern || a.fields?.meetingPattern || course.meetingPattern;
        course.updatedAt = nowIso();
        applyCourseSchedule(state, course);
        logs.push(`Set ${course.code} meetings to ${course.meetingPattern}.`);
      } else if (a.op === "set_office_hours" && course) {
        const blob = a.officeHours || a.details || a.title || "";
        course.officeHours = blob;
        course.updatedAt = nowIso();
        applyCourseSchedule(state, course);
        logs.push(`Set weekly office hours on the calendar for ${course.code}: ${blob}`);
      } else if (a.op === "add_event" && a.title) {
        const c = course;
        const start = a.start ? parseWhen(a.start, c) : new Date().toISOString();
        const end = a.end ? parseWhen(a.end, c) : null;
        const ev = pushEvent(state, {
          courseId: c?.id ?? null,
          title: a.title,
          details: a.details || "",
          type: a.type || "other",
          start,
          end,
          allDay: false,
          location: a.location || "",
          weight: "",
          source: "assistant",
          recurrence: a.recurrence === undefined ? recFromText(`${a.title} ${a.details || ""}`, c, a.type) : a.recurrence,
        });
        logs.push(`Added event “${ev.title}”${c ? ` on ${c.code}` : ""}.`);
      } else if (a.op === "update_event") {
        const id = a.id?.split("::")[0];
        const ev = (id && state.events.find((e) => e.id === id)) || matchEvent(state, course, a.match || a.title || "");
        if (!ev) {
          logs.push("Could not find that event.");
          continue;
        }
        if (a.title) ev.title = a.title;
        if (a.details != null) ev.details = a.details;
        if (a.type) ev.type = a.type;
        if (a.start) ev.start = parseWhen(a.start, course);
        if (a.end) ev.end = parseWhen(a.end, course);
        if (a.location != null) ev.location = a.location;
        if (a.recurrence !== undefined) ev.recurrence = shouldNotRecur(ev) ? null : a.recurrence;
        if (shouldNotRecur(ev)) ev.recurrence = null;
        ev.updatedAt = nowIso();
        logs.push(`Updated “${ev.title}”.`);
      } else if (a.op === "delete_event") {
        const id = a.id?.split("::")[0];
        const ev = (id && state.events.find((e) => e.id === id)) || matchEvent(state, course, a.match || a.title || "");
        if (!ev) {
          logs.push("Could not find that event to delete.");
          continue;
        }
        ev.canceled = true;
        ev.updatedAt = nowIso();
        logs.push(`Removed “${ev.title}”.`);
      } else if (a.op === "add_note" && course) {
        const note: CourseNote = {
          id: nid(),
          courseId: course.id,
          kind: "note",
          title: a.title || "Assistant note",
          body: a.body || "",
          catalogDate: nowIso().slice(0, 10),
          reminderAt: null,
          alerts: [],
          transcript: "",
          summary: a.summary || "",
          audioPath: null,
          attachments: [],
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        state.notes.push(note);
        logs.push(`Saved a note on ${course.code}: ${note.title}`);
      } else if (a.op === "update_note") {
        const note = state.notes.find((n) => n.id === a.id || n.title.toLowerCase() === (a.match || a.title || "").toLowerCase());
        if (!note) {
          logs.push("Could not find that note.");
          continue;
        }
        if (a.title) note.title = a.title;
        if (a.body != null) note.body = a.body;
        if (a.summary != null) note.summary = a.summary;
        note.updatedAt = nowIso();
        logs.push(`Updated note “${note.title}”.`);
      } else if (a.op === "delete_note") {
        const idx = state.notes.findIndex((n) => n.id === a.id || n.title.toLowerCase() === (a.match || a.title || "").toLowerCase());
        if (idx < 0) {
          logs.push("Could not find that note to delete.");
          continue;
        }
        const title = state.notes[idx].title;
        state.notes.splice(idx, 1);
        logs.push(`Deleted note “${title}”.`);
      } else if (a.op === "set_ui") {
        const key = resolveUiKey(a.id || a.match || a.title || "");
        const text = (a.body || a.details || a.fields?.text || "").trim();
        if (!key || !text) {
          logs.push("Need a UI key and the new wording.");
          continue;
        }
        state.uiText = { ...(state.uiText || {}), [key]: text };
        logs.push(`On-screen “${key}” now says “${text}”.`);
      } else {
        logs.push(`Skipped ${a.op} (need a matching course or event).`);
      }
    } catch (err) {
      logs.push(`Could not run ${a.op}: ${err instanceof Error ? err.message : "error"}`);
    }
  }
  return logs.join(" ");
}

/** Direct natural-language edits so the assistant does not wait on the model to mutate. */
export function executeAssistantIntent(state: AppState, message: string) {
  const course = courseFromMessage(state, message);
  const logs: string[] = [];
  const lower = message.toLowerCase();

  if (course && /\boffice\s*hours?\b/i.test(message) && /\b(add|set|update|change|schedule|put)\b/i.test(message)) {
    const blobs = parseOfficeHourBlobs(message);
    const days = daysIn(message);
    const times = message.match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
    const loc = message.match(/\b(LC|WLH|HQ|SSS|DL|AKW|ML)\s*\d+[A-Z]?\b/i)?.[0] || "";
    const line =
      blobs.length || times
        ? message
        : days.length
          ? `Office hours ${days.join("/")} ${clockIn(message) || "16:00"}-${clockIn(message.replace(clockIn(message) || "", "")) || "17:00"} ${loc}`
          : "";
    if (line) {
      course.officeHours = [course.officeHours, `Office hours: ${message}`].filter(Boolean).join("\n");
      course.updatedAt = nowIso();
      applyCourseSchedule(state, course);
      logs.push(`Put weekly office hours on the ${course.code} calendar from what you said.`);
    }
  }

  if (course && /\b(meeting pattern|class (time|meets)|lecture (time|schedule))\b/i.test(message) && /\b(set|change|update|to)\b/i.test(message)) {
    const after = message.split(/\bto\b/i).pop()?.trim();
    if (after && after.length < 80) {
      course.meetingPattern = after.replace(/[.?!].*/, "").trim();
      course.updatedAt = nowIso();
      applyCourseSchedule(state, course);
      logs.push(`Updated ${course.code} meetings to ${course.meetingPattern} and synced the calendar.`);
    }
  }

  if (course && /\b(delete|remove)\b/i.test(message) && /\b(course|roadmap|degree plan)\b/i.test(message) && !/\bdrop\b/i.test(message)) {
    const label = `${course.code}: ${course.name}`;
    deleteCourse(state, course);
    logs.push(`Deleted ${label} (removed, not dropped).`);
  } else if (course && /\bdrop (the )?course\b/i.test(message)) {
    course.dropped = true;
    course.updatedAt = nowIso();
    logs.push(`Dropped ${course.code}.`);
  }

  if (/\b(add|create|schedule)\b/i.test(lower) && /\b(event|quiz|exam|pset|assignment|lecture|lab|reading|paper|draft)\b/i.test(lower) && course) {
    const type: EventType = /\bexam\b/i.test(message)
      ? "exam"
      : /\bquiz\b/i.test(message)
        ? "quiz"
        : /\bpset|problem set\b/i.test(message)
          ? "pset"
          : /\blecture\b/i.test(message)
            ? "lecture"
            : /\blab\b/i.test(message)
              ? "lab"
              : /\breading\b/i.test(message)
                ? "reading"
                : /\b(paper|draft|essay)\b/i.test(message)
                  ? "assignment"
                  : "other";
    const titleMatch = message.match(/titled\s+["“]([^"”]+)["”]/i) || message.match(/called\s+["“]([^"”]+)["”]/i);
    const title = titleMatch?.[1] || message.slice(0, 80);
    if (!/\boffice\s*hours?\b/i.test(message)) {
      pushEvent(state, {
        courseId: course.id,
        title,
        details: message,
        type,
        start: parseWhen(message, course),
        end: null,
        allDay: !clockIn(message),
        location: "",
        weight: "",
        source: "assistant",
        recurrence: recFromText(message, course, type),
      });
      logs.push(`Added a ${type} on ${course.code}.`);
    }
  }

  return { log: logs.join(" "), course };
}

export function parseActionsFromReply(text: string): { actions: PlannerAction[]; cleaned: string } {
  const fence = text.match(/```(?:actions|json)\s*([\s\S]*?)```/i);
  const raw = fence?.[1]?.trim() || "";
  if (!raw) return { actions: [], cleaned: text };
  try {
    const parsed = JSON.parse(raw) as PlannerAction[] | { actions: PlannerAction[] };
    const actions = Array.isArray(parsed) ? parsed : parsed.actions || [];
    const cleaned = text.replace(fence![0], "").trim();
    return { actions, cleaned };
  } catch {
    return { actions: [], cleaned: text };
  }
}

export const ACTION_GUIDE = `You can READ every course, event, note (including transcripts/summaries), policy, chat, and setting in PLANNER DATA.

You can EDIT the planner when the student asks. After any edit, confirm what you changed. Do not give a generic product tour.

If you need to mutate something that is not already listed in ACTION RESULT, include exactly one fenced block before your answer:

\`\`\`actions
[{"op":"set_office_hours","course":"ENGL 1014","officeHours":"Wed 4:00-5:00pm LC 101"}]
\`\`\`

ops: add_course, update_course, delete_course, drop_course, restore_course, add_event, update_event, delete_event, add_note, update_note, delete_note, set_office_hours, set_meeting, set_ui.

add_course = names only (code, name, term, year). Use this for degree roadmaps / four-year plans: never invent lectures, psets, or policies from a plan. delete_course permanently removes a course (and its events/notes). drop_course is only for an enrolled class the student is dropping this term. If they say delete/remove, use delete_course.

set_ui changes labels the student sees (sidebar, headings, buttons). Keys are in PLANNER DATA uiLabels, e.g. {"op":"set_ui","id":"pins.urgent","body":"Due soon"}.

Then write a normal answer to what they actually asked. Never invent due dates.`;
