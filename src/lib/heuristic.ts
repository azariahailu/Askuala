import { academicYearFor } from "./terms";
import { codesInText } from "./calendar-utils";
import type { EventType, Recurrence, TermName } from "./types";
import { parseSyllabus } from "./syllabus-parse";

export type ExtractedCourse = {
  code: string;
  name: string;
  instructor: string;
  instructorEmail: string;
  location: string;
  meetingPattern: string;
  term: TermName;
  year: number;
  academicYear: number;
  policies: { title: string; body: string }[];
  extraContext: string;
  officeHours: {
    holder: string;
    location: string;
    days: string[];
    start: string;
    end: string;
    notes: string;
  }[];
};

export type ExtractedEvent = {
  title: string;
  details: string;
  type: EventType;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string;
  weight: string;
  recurrence: Recurrence | null;
  releasedAt?: string | null;
};

export type Extraction = {
  course: ExtractedCourse;
  events: ExtractedEvent[];
  notes: { kind: "note" | "question" | "office_hours" | "resource" | "reminder"; title: string; body: string }[];
  summary: string;
};

function guessTermYear(text: string): { term: TermName; year: number } {
  const fall = text.match(/fall\s*(20)?(\d{2})/i);
  const spring = text.match(/spring\s*(20)?(\d{2})/i);
  const summer = text.match(/summer\s*(20)?(\d{2})/i);
  const pick = (m: RegExpMatchArray | null, term: TermName) => {
    if (!m) return null;
    const yy = Number(m[2]);
    const year = yy < 100 ? 2000 + yy : yy;
    return { term, year };
  };
  return pick(fall, "Fall") || pick(spring, "Spring") || pick(summer, "Summer") || { term: "Fall" as TermName, year: 2026 };
}

function weekdayFromText(text: string) {
  const map: [RegExp, string][] = [
    [/\bsun/i, "SU"],
    [/\bmon/i, "MO"],
    [/\btue/i, "TU"],
    [/\bwed/i, "WE"],
    [/\bthu/i, "TH"],
    [/\bfri/i, "FR"],
    [/\bsat/i, "SA"],
  ];
  return map.filter(([re]) => re.test(text)).map(([, code]) => code);
}

function fallbackExtract(text: string, extra = ""): Extraction {
  const blob = `${text}\n${extra}`;
  const code = codesInText(blob)[0] || "NEW 000";
  const { term, year } = guessTermYear(blob);
  return {
    course: {
      code,
      name: blob.split("\n").map((l) => l.trim()).find((l) => /micro|macro|intro|seminar|course/i.test(l) && l.length < 90) || "Untitled course",
      instructor: blob.match(/Prof\.?\s+[^\n]+/)?.[0] || "",
      instructorEmail: blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "",
      location: blob.match(/Location:\s*([^\n]+)/i)?.[1]?.trim() || "",
      meetingPattern: blob.match(/Class:\s*([^\n]+)/i)?.[1]?.trim() || "",
      term,
      year,
      academicYear: academicYearFor(term, year),
      policies: [],
      extraContext: extra,
      officeHours: [],
    },
    events: [],
    notes: extra ? [{ kind: "note", title: "Announcement / extra context", body: extra }] : [],
    summary: `Parsed ${code} (${term} ${year}).`,
  };
}

export function heuristicExtract(text: string, extra = ""): Extraction {
  const blob = stripCanvas(`${text}\n${extra}`);
  const structured = parseSyllabus(blob, extra);
  const realCode = structured.course.code && !/^COURSE |^NEW /i.test(structured.course.code);
  if (realCode && (structured.events.length >= 1 || structured.course.meetingPattern || structured.course.officeHours.length)) {
    return structured;
  }
  const fallback = fallbackExtract(blob, extra);
  if (structured.events.length >= fallback.events.length && structured.course.name !== "Untitled course") {
    return structured;
  }
  return fallback;
}

function stripCanvas(raw: string) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export { weekdayFromText };
export { guessType } from "./syllabus-parse";
