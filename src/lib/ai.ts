import { llmChat } from "./llm";
import { heuristicExtract, type Extraction } from "./heuristic";
import { academicYearFor } from "./terms";
import type { AppSettings, EventType, TermName } from "./types";

const SCHEMA_HINT = [
  "Return ONLY JSON with this shape:",
  '{ "course": { "code": "DEPT 1234", "name": "Full course name", "instructor": "", "instructorEmail": "", "location": "", "meetingPattern": "e.g. MW 9:00-10:15", "term": "Fall"|"Spring"|"Summer", "year": 2026, "policies": [{"title":"","body":""}], "extraContext": "", "officeHours": [{"holder":"Name","location":"","days":["MO"],"start":"13:00","end":"14:00","notes":""}] },',
  '"events": [{ "title": "short title", "details": "FULL details", "type": "exam"|"quiz"|"assignment"|"project"|"lab"|"pset"|"reading"|"office_hour"|"lecture"|"other", "start": "ISO-8601 datetime", "end": "ISO-8601 or null", "allDay": false, "location": "", "weight": "", "recurrence": null | {"freq":"weekly","byDay":["MO","WE"],"until": null} }],',
  '"notes": [{"kind":"note"|"question"|"office_hours"|"resource"|"reminder","title":"","body":""}], "summary": "one paragraph" }',
  "Rules:",
  "- Event titles MUST start with the course code then a middot, like ENGL 1014 · Lecture or ECON 1115 · Problem set 1.",
  "- Never use Fall/Spring or a calendar year as the course code.",
  "- Only create weekly problem sets if the syllabus actually says problem set or homework is due every week. A writing seminar is not problem sets.",
  "- Never put recurrence on exams, quizzes, problem sets, homework, papers, drafts, or projects. Those are one dated item each. Lectures and office hours may be weekly.",
  "- Use the real name from the syllabus or Canvas (Problem set A, Homework 3), never a generic repeating “Problem Set 1” series.",
  "- Office hours: type office_hour; title like Rasheed Tazudeen — Office Hours · ENGL 1014.",
  "- Prefer America/New_York if timezone missing. Academic years start Fall 2026.",
  "- details must be the complete instruction, not just the title.",
].join("\n");

export async function extractWithAI(text: string, extra: string, settings?: AppSettings): Promise<Extraction> {
  const fallback = heuristicExtract(text, extra);
  try {
    const { text: raw } = await llmChat(
      [
        { role: "system", content: SCHEMA_HINT },
        {
          role: "user",
          content: `SYLLABUS TEXT:\n${text.slice(0, 80000)}\n\nADDITIONAL CONTEXT (Canvas/announcements/etc):\n${extra.slice(0, 20000)}`,
        },
      ],
      settings,
      true,
      true,
    );
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Extraction;
    return normalizeExtraction(parsed, fallback);
  } catch (err) {
    console.error("AI extract failed, using heuristic", err);
    return fallback;
  }
}

function normalizeExtraction(parsed: Extraction, fallback: Extraction): Extraction {
  const course = { ...fallback.course, ...parsed.course };
  const term = (["Fall", "Spring", "Summer"].includes(course.term) ? course.term : fallback.course.term) as TermName;
  const year = Number(course.year) || fallback.course.year;
  course.term = term;
  course.year = year;
  course.academicYear = academicYearFor(term, year);
  course.code = course.code || fallback.course.code;
  course.name = course.name || fallback.course.name;
  const events = (parsed.events?.length ? parsed.events : fallback.events).map((e) => ({
    ...e,
    type: (safeType(e.type) || "other") as EventType,
    details: e.details || e.title,
    title: e.title || "Untitled",
    location: e.location || "",
    weight: e.weight || "",
    end: e.end || null,
    recurrence: e.recurrence || null,
  }));
  return {
    course,
    events,
    notes: parsed.notes || [],
    summary: parsed.summary || fallback.summary,
  };
}

function safeType(t: string) {
  const allowed = [
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
  return allowed.includes(t) ? t : "other";
}
