import { heuristicExtract, type Extraction } from "./heuristic";
import { syllabusFingerprint } from "./checkpoint";
import { nid, nowIso, nextCourseColor, officeHourTitle, phoneAlertRules } from "./ids";
import { academicYearFor } from "./terms";
import { dedupeEvents, findMatchingEvent, formatCourseEventTitle, isRoutineNoise, isWeeklyWork, normalizeCourseCode, shouldNotRecur } from "./calendar-utils";
import type { AppState, Course, CourseEvent, EventType, Recurrence } from "./types";

function usableCode(code: string) {
  const n = normalizeCourseCode(code || "");
  if (!n || /^NEW\s/i.test(n) || /^COURSE\s/i.test(n)) return "";
  return n;
}

function usableName(name: string) {
  const n = (name || "").trim();
  if (!n || /^untitled/i.test(n)) return "";
  return n;
}

function mergeText(old: string, add: string) {
  const a = (add || "").trim();
  if (!a) return old || "";
  if ((old || "").includes(a.slice(0, Math.min(240, a.length)))) return old;
  return [old, a].filter(Boolean).join("\n\n");
}

export function applyExtraction(
  state: AppState,
  extraction: Extraction,
  opts?: { courseId?: string; extraContext?: string; eventSource?: CourseEvent["source"] },
) {
  const incomingCode = usableCode(extraction.course.code);
  const existing = opts?.courseId
    ? state.courses.find((c) => c.id === opts.courseId)
    : state.courses.find(
        (c) =>
          !c.dropped &&
          incomingCode &&
          normalizeCourseCode(c.code) === incomingCode &&
          c.term === extraction.course.term &&
          c.year === extraction.course.year,
      ) ||
      state.courses.find((c) => !c.dropped && incomingCode && normalizeCourseCode(c.code) === incomingCode);

  const color = existing
    ? { hex: existing.color, google: existing.googleColorId }
    : nextCourseColor(state.courses.length);
  const now = nowIso();
  const paste = (opts?.extraContext || extraction.course.extraContext || "").trim();
  const pasteIsSyllabus = paste.length > 600;
  const course: Course = existing
    ? {
        ...existing,
        code: incomingCode || existing.code,
        name: usableName(extraction.course.name) || existing.name,
        instructor: extraction.course.instructor || existing.instructor,
        instructorEmail: extraction.course.instructorEmail || existing.instructorEmail,
        location: extraction.course.location || existing.location,
        meetingPattern: extraction.course.meetingPattern || existing.meetingPattern,
        term: extraction.course.term || existing.term,
        year: extraction.course.year || existing.year,
        academicYear: academicYearFor(extraction.course.term || existing.term, extraction.course.year || existing.year),
        extraContext: pasteIsSyllabus ? existing.extraContext : [existing.extraContext, paste].filter(Boolean).join("\n\n"),
        syllabusText: mergeText(existing.syllabusText, paste || extraction.summary),
        syllabusFp: paste ? undefined : existing.syllabusFp,
        policies: extraction.course.policies.length
          ? extraction.course.policies.map((p) => {
              const old = existing.policies.find((x) => x.title.toLowerCase() === p.title.toLowerCase());
              return { id: old?.id || nid(), title: p.title, body: p.body };
            })
          : existing.policies,
        updatedAt: now,
      }
    : {
        id: nid(),
        code: extraction.course.code,
        name: extraction.course.name,
        instructor: extraction.course.instructor,
        instructorEmail: extraction.course.instructorEmail,
        location: extraction.course.location,
        meetingPattern: extraction.course.meetingPattern,
        term: extraction.course.term,
        year: extraction.course.year,
        academicYear: extraction.course.academicYear,
        color: color.hex,
        googleColorId: color.google,
        googleCalendarId: null,
        policies: extraction.course.policies.map((p) => ({ id: nid(), ...p })),
        extraContext: pasteIsSyllabus ? "" : paste || extraction.course.extraContext || "",
        officeHours: "",
        syllabusText: [paste, extraction.summary].filter(Boolean).join("\n\n"),
        dropped: false,
        createdAt: now,
        updatedAt: now,
      };

  if (!existing) state.courses.push(course);
  else {
    const idx = state.courses.findIndex((c) => c.id === existing.id);
    state.courses[idx] = course;
    if (!extraction.events.some((e) => e.type === "pset")) {
      state.events = state.events.filter(
        (e) => !(e.courseId === course.id && e.source === "syllabus" && (e.type === "pset" || /problem set/i.test(e.title))),
      );
    }
  }

  for (const oh of extraction.course.officeHours || []) {
    const byDay = oh.days?.length ? oh.days : ["MO"];
    const start = combineTime(extraction.course.year, extraction.course.term, oh.start);
    const end = combineTime(extraction.course.year, extraction.course.term, oh.end, 1);
    upsertEvent(state, {
      courseId: course.id,
      title: officeHourTitle(oh.holder || course.instructor, course.code, oh.location),
      details: oh.notes || `${oh.holder || course.instructor} office hours for ${course.code}${oh.location ? ` at ${oh.location}` : ""}.`,
      type: "office_hour",
      start,
      end,
      allDay: false,
      location: oh.location || course.location,
      weight: "",
      source: opts?.eventSource || "syllabus",
      recurrence: { freq: "weekly", byDay, until: termEnd(extraction.course.term, extraction.course.year) },
    });
  }

  const hasGoogleWork = state.events.some((e) => e.courseId === course.id && e.source === "google" && !e.canceled && isWeeklyWork(e));
  for (const ev of extraction.events) {
    if (hasGoogleWork && (ev.type === "pset" || /problem set|homework/i.test(ev.title))) continue;
    upsertEvent(state, {
      courseId: course.id,
      title: formatCourseEventTitle(course.code, ev.type === "office_hour" ? officeHourTitle(course.instructor, course.code) : ev.title),
      details: ev.details,
      type: ev.type,
      start: ev.start,
      end: ev.end,
      allDay: ev.allDay,
      location: ev.location,
      weight: ev.weight,
      source: opts?.eventSource || "syllabus",
      recurrence: shouldNotRecur({ title: ev.title, type: ev.type }) ? null : ev.recurrence,
      releasedAt: ev.releasedAt ?? null,
    });
  }

  for (const note of extraction.notes || []) {
    state.notes.push({
      id: nid(),
      courseId: course.id,
      kind: note.kind,
      title: note.title,
      body: note.body,
      catalogDate: now.slice(0, 10),
      reminderAt: null,
      alerts: [],
      transcript: "",
      summary: "",
      audioPath: null,
      attachments: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  dedupeEvents(state);
  return course;
}

/** Re-read every course syllabus so papers, drafts, readings, and psets land on the weekly board: not only problem sets. */
export function hydrateSyllabusWork(state: AppState) {
  for (const course of state.courses) {
    if (course.dropped) continue;
    try {
      const text = (course.syllabusText || "").trim();
      if (text.length >= 400) {
        const keep = text;
        const fp = syllabusFingerprint(text);
        if (course.syllabusFp !== fp) {
          const extraction = heuristicExtract(text, "");
          extraction.notes = [];
          if (!/\b(problem sets?|p-?sets?|homework)\b/i.test(text)) {
            extraction.events = extraction.events.filter((e) => e.type !== "pset" && !/problem set/i.test(e.title));
          }
          applyExtraction(state, extraction, { courseId: course.id, extraContext: "", eventSource: "syllabus" });
          const live = state.courses.find((c) => c.id === course.id);
          if (live) {
            live.syllabusText = keep;
            live.syllabusFp = fp;
          }
        }
      }
    } catch (e) {
      console.error("hydrateSyllabusWork", course.code, e);
    }
  }
}

function mergePolicies(
  current: Course["policies"],
  incoming: { title: string; body: string }[],
) {
  const map = new Map(current.map((p) => [p.title.toLowerCase(), p]));
  for (const p of incoming) {
    const hit = map.get(p.title.toLowerCase());
    if (hit) hit.body = p.body || hit.body;
    else current.push({ id: nid(), title: p.title, body: p.body });
  }
  return current;
}

function upsertEvent(
  state: AppState,
  input: {
    courseId: string;
    title: string;
    details: string;
    type: EventType;
    start: string;
    end: string | null;
    allDay: boolean;
    location: string;
    weight: string;
    source: CourseEvent["source"];
    recurrence: Recurrence | null;
    releasedAt?: string | null;
    googleAlerts?: boolean;
  },
) {
  const dup = findMatchingEvent(state.events, input, state.courses);
  const now = nowIso();
  if (dup) {
    dup.courseId = input.courseId;
    dup.title = input.title || dup.title;
    dup.details = input.details || dup.details;
    dup.type = input.type;
    dup.start = input.start;
    dup.end = input.end ?? dup.end;
    dup.location = input.location || dup.location;
    dup.weight = input.weight || dup.weight;
    dup.recurrence = shouldNotRecur({ ...dup, ...input }) ? null : input.recurrence;
    if (input.releasedAt !== undefined) dup.releasedAt = input.releasedAt;
    dup.source = input.source;
    if (input.googleAlerts != null) dup.googleAlerts = input.googleAlerts;
    else if (input.source === "assistant" || input.source === "manual") dup.googleAlerts = !isRoutineNoise(input);
    if (isRoutineNoise(dup) || dup.googleAlerts === false) {
      dup.googleAlerts = false;
      dup.alerts = [];
    } else if (dup.googleAlerts && !dup.alerts?.length) dup.alerts = phoneAlertRules();
    dup.updatedAt = now;
    return dup;
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
    googleAlerts: input.googleAlerts ?? ((input.source === "assistant" || input.source === "manual") && !isRoutineNoise(input)),
    alerts: input.googleAlerts === false || isRoutineNoise(input) ? [] : phoneAlertRules(),
  };
  if (shouldNotRecur(event)) event.recurrence = null;
  state.events.push(event);
  return event;
}

export function combineTime(year: number, term: string, hhmm: string, addHours = 0) {
  const [h, m] = (hhmm || "13:00").split(":").map(Number);
  const month = term === "Fall" ? 8 : term === "Spring" ? 0 : 5;
  const d = new Date(year, month, term === "Fall" ? 1 : 15, h || 13, m || 0);
  if (addHours) d.setHours(d.getHours() + addHours);
  return d.toISOString();
}

export function termEnd(term: string, year: number) {
  if (term === "Fall") return new Date(year, 11, 20).toISOString();
  if (term === "Spring") return new Date(year, 4, 15).toISOString();
  return new Date(year, 7, 15).toISOString();
}
