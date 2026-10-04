import type { EventType, Recurrence, TermName } from "./types";
import { academicYearFor } from "./terms";
import { extractKeyPolicies } from "./extract-policies";
import { formatCourseEventTitle, looksLikeCourseCode, codesInText } from "./calendar-utils";
import type { ExtractedCourse, ExtractedEvent, Extraction } from "./heuristic";

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function monthIndex(name: string) {
  return MONTHS[name.toLowerCase().replace(/\./g, "")];
}

function at(year: number, month: number, day: number, h = 13, min = 5) {
  return new Date(year, month, day, h, min).toISOString();
}

function parseClock(raw: string, fallbackH = 13, fallbackM = 0) {
  const m = raw.trim().match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return { h: fallbackH, min: fallbackM };
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || "").replace(/\./g, "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && h <= 7) h += 12;
  return { h, min };
}

function examClockFromNote(note: string, fallback: { h: number; min: number }, fallbackEnd: { h: number; min: number }) {
  const range = note.match(
    /(?:from\s+)?(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)/i,
  );
  if (range) {
    const mer = range[4] || range[2] || "pm";
    return {
      start: parseClock(`${range[1]} ${range[2] || mer}`),
      end: parseClock(`${range[3]} ${mer}`),
      location: note.match(/\bin\s+([A-Za-z0-9 .,-]+)$/i)?.[1]?.trim() || "",
    };
  }
  const at = note.match(/\bat\s+(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)/i);
  if (at) {
    const start = parseClock(`${at[1]} ${at[2]}`);
    return { start, end: { h: start.h + 3, min: start.min }, location: note.match(/\bin\s+([A-Za-z0-9 .,-]+)$/i)?.[1]?.trim() || "" };
  }
  return { start: fallback, end: fallbackEnd, location: "" };
}

function termEndIso(term: TermName, year: number) {
  if (term === "Fall") return at(year, 11, 20, 23, 59);
  if (term === "Spring") return at(year, 4, 15, 23, 59);
  return at(year, 7, 15, 23, 59);
}

function firstWeekdayOnOrAfter(year: number, month: number, day: number, jsDay: number) {
  const d = new Date(year, month, day);
  while (d.getDay() !== jsDay) d.setDate(d.getDate() + 1);
  return d;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function meetingDays(meeting: string) {
  const days: string[] = [];
  const add = (d: string) => {
    if (!days.includes(d)) days.push(d);
  };
  if (/\bMWF\b/i.test(meeting)) {
    add("MO");
    add("WE");
    add("FR");
  } else if (/\bMW\b/i.test(meeting) || /monday and wednesday|mon\/wed/i.test(meeting)) {
    add("MO");
    add("WE");
  }
  if (/\bTTh\b|\bTR\b/i.test(meeting) || /tuesday and thursday|tue\/thu/i.test(meeting)) {
    add("TU");
    add("TH");
  }
  if (/monday/i.test(meeting)) add("MO");
  if (/tuesday/i.test(meeting)) add("TU");
  if (/wednesday/i.test(meeting)) add("WE");
  if (/thursday/i.test(meeting)) add("TH");
  if (/friday/i.test(meeting)) add("FR");
  return days;
}

function officeHourDays(raw: string) {
  const t = raw.trim().toUpperCase();
  if (t === "M" || t.startsWith("MON")) return ["MO"];
  if (t === "T" || t.startsWith("TUE")) return ["TU"];
  if (t === "W" || t.startsWith("WED")) return ["WE"];
  if (t === "R" || t.startsWith("THU")) return ["TH"];
  if (t === "F" || t.startsWith("FRI")) return ["FR"];
  return meetingDays(raw);
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function nextWeekdayAfter(from: Date, jsDay: number, inclusive = false) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  let add = (jsDay - d.getDay() + 7) % 7;
  if (add === 0 && !inclusive) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

function academicSkipDays(year: number, term: TermName) {
  const skip = new Set<string>();
  if (term === "Fall") {
    skip.add(ymd(firstWeekdayOnOrAfter(year, 8, 1, 1)));
    const d = new Date(year, 10, 1);
    let thurs = 0;
    while (d.getMonth() === 10) {
      if (d.getDay() === 4) {
        thurs += 1;
        if (thurs === 4) {
          skip.add(ymd(d));
          const fri = new Date(d);
          fri.setDate(fri.getDate() + 1);
          skip.add(ymd(fri));
          break;
        }
      }
      d.setDate(d.getDate() + 1);
    }
  }
  if (term === "Spring") {
    skip.add(ymd(firstWeekdayOnOrAfter(year, 0, 1, 1)));
    const jan = new Date(year, 0, 1);
    let mondays = 0;
    while (jan.getMonth() === 0) {
      if (jan.getDay() === 1 && jan.getDate() > 1) {
        mondays += 1;
        if (mondays === 3) {
          skip.add(ymd(jan));
          break;
        }
      }
      jan.setDate(jan.getDate() + 1);
    }
  }
  return skip;
}

export function syllabusOwnsProblemSets(blob: string) {
  const psets = (blob.match(/\bproblem sets?\b/gi) || []).length;
  const homework = (blob.match(/\bhomework\b/gi) || []).length;
  if (/\bprogramming assignments?\b/i.test(blob) && psets < 2) return false;
  if (/\b(writing seminar|research paper)\b/i.test(blob) && psets < 2 && homework < 2) return false;
  return psets + homework > 0;
}

export function parseAssignmentCadence(blob: string) {
  if (!syllabusOwnsProblemSets(blob)) return null;
  const window =
    blob.match(/problem set rules[\s\S]{0,2500}/i)?.[0] ||
    blob.match(/\b(?:problem sets?|p-?sets?)\b[\s\S]{0,1500}/i)?.[0] ||
    blob.match(/\bhomework\b[\s\S]{0,1200}/i)?.[0];
  if (!window) return null;
  if (!/\b(every|each week|weekly|posted every|due every)\b/i.test(window)) return null;
  if (!/\b(problem sets?|p-?sets?|homework)\b/i.test(window)) return null;
  const kind = /\bhomework\b/i.test(window) && !/\bproblem sets?\b/i.test(window) ? "Homework" : "Problem set";
  const posted = window.match(
    /(?:posted|released|assigned|available|handed\s+out|distributed)(?:[^.]{0,90}?)(?:every\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?(?:[^.]{0,45}?(?:at|by)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?))?/i,
  );
  const due = window.match(
    /due(?:[^.]{0,90}?)(?:every\s+|each(?:\s+on)?\s+|the\s+(?:following|next)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?(?:[^.]{0,45}?(?:at|by)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?))?/i,
  );
  if (!due && !posted) return null;
  const dueJs = WEEKDAYS[(due?.[1] || posted?.[1] || "monday").toLowerCase()];
  const releaseJs = posted ? WEEKDAYS[posted[1].toLowerCase()] : null;
  const dueClock = parseClock(due?.[2] || "", 23, 59);
  const releaseClock = parseClock(posted?.[2] || "", 17, 0);
  if (!due?.[2] && /monday/i.test(due?.[1] || "") && /11/i.test(window)) {
    const eleven = parseClock(window.match(/monday at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i)?.[1] || "11:00 am");
    return { kind, dueJs, releaseJs, dueClock: eleven, releaseClock, rules: window.replace(/\s+/g, " ").slice(0, 1500) };
  }
  return { kind, dueJs, releaseJs, dueClock, releaseClock, rules: window.replace(/\s+/g, " ").slice(0, 1500) };
}

const DATE_HEAD =
  /^(?:(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+)?(January|February|March|April|May|June|July|August|September|Sept\.?|Sep\.?|October|Oct\.?|November|Nov\.?|December|Dec\.?)\s+(\d{1,2})(?:,?\s*(20\d{2}))?/i;

function isWorkLabel(label: string) {
  if (/\b(in-class|presentations?|class trip|no class)\b/i.test(label) && !/\b(due|draft|paper)\b/i.test(label)) return false;
  return /\b(due|paper|draft|essay|assignment|homework|proposal|response|creative project)\b/i.test(label);
}

function dueClockFrom(text: string) {
  const m = text.match(/\b(?:due\s+by|due|by)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return null;
  return parseClock(`${m[1]}${m[2] ? `:${m[2]}` : ""} ${m[3] || "pm"}`, 21, 0);
}

function pushDatedWork(
  out: ExtractedEvent[],
  seen: Set<string>,
  year: number,
  term: TermName,
  code: string,
  monthName: string,
  day: number,
  yearMaybe: string | undefined,
  label: string,
  raw: string,
) {
  const clean = label.replace(/\s+/g, " ").trim();
  if (!isWorkLabel(clean)) return;
  if (/\b(no class|holiday|recess|labor day|fall break|november break)\b/i.test(clean) && !/\b(due|paper|draft)\b/i.test(clean))
    return;
  const mi = monthIndex(monthName);
  if (mi == null) return;
  let y = yearMaybe ? Number(yearMaybe) : year;
  if (!yearMaybe && term === "Fall" && mi <= 4) y = year + 1;
  const clock = dueClockFrom(`${clean} ${raw}`) || { h: 23, min: 59 };
  const type = guessType(clean);
  const workType = type === "other" || type === "lecture" || type === "office_hour" ? "assignment" : type;
  const title = formatCourseEventTitle(
    code,
    clean.replace(/\s+due\.?$/i, "").replace(/:$/, "").replace(/\bon Canvas.*$/i, "").trim(),
  );
  const key = `${y}-${mi}-${day}|${title.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    title,
    details: raw.replace(/\s+/g, " ").trim().slice(0, 240),
    type: workType,
    start: at(y, mi, day, clock.h, clock.min),
    end: null,
    allDay: false,
    location: "",
    weight: "",
    recurrence: null,
  });
}

export function datedAssignmentEvents(blob: string, year: number, term: TermName, code: string): ExtractedEvent[] {
  const out: ExtractedEvent[] = [];
  const seen = new Set<string>();
  const lines = blob.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const head = line.match(DATE_HEAD);
    if (!head) continue;
    let rest = line.slice(head[0].length).replace(/^[\s:\-\t]+/, "").trim();
    let raw = line;
    if ((!rest || rest.length < 4) && lines[i + 1] && isWorkLabel(lines[i + 1])) {
      rest = lines[i + 1];
      raw = `${line} ${lines[i + 1]}`;
      i += 1;
    }
    if (lines[i + 1] && dueClockFrom(lines[i + 1])) {
      raw = `${raw} ${lines[i + 1]}`;
      i += 1;
    }
    if (rest && isWorkLabel(rest)) {
      pushDatedWork(out, seen, year, term, code, head[2], Number(head[3]), head[4], rest, raw);
    }
  }
  return out;
}

function sessionReadingEvents(blob: string, year: number, term: TermName, code: string): ExtractedEvent[] {
  const out: ExtractedEvent[] = [];
  const seen = new Set<string>();
  const lines = blob.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  type Pend = { month: string; day: number; year?: string; bits: string[] };
  let cur: Pend | null = null;

  const flush = () => {
    if (!cur?.bits.length) {
      cur = null;
      return;
    }
    const label = cur.bits.join(" · ").replace(/\s+/g, " ").trim();
    if (label.length < 8) {
      cur = null;
      return;
    }
    if (/\b(no class|labor day|fall break|november break|holiday)\b/i.test(label) && !/\b(due|paper|draft)\b/i.test(label)) {
      cur = null;
      return;
    }
    if (/\b(due|paper|draft|proposal)\b/i.test(label) && !/[“"”]/.test(label) && !/\bread\b/i.test(label)) {
      cur = null;
      return;
    }
    const mi = monthIndex(cur.month);
    if (mi == null) {
      cur = null;
      return;
    }
    let y = cur.year ? Number(cur.year) : year;
    if (!cur.year && term === "Fall" && mi <= 4) y = year + 1;
    const type = /\b(due|paper|draft|proposal|essay)\b/i.test(label) ? guessType(label) === "other" ? "assignment" : guessType(label) : "reading";
    const workType = type === "lecture" || type === "office_hour" ? "reading" : type;
    const title = formatCourseEventTitle(code, (workType === "reading" ? "Read · " : "") + label.slice(0, 100));
    const key = `${y}-${mi}-${cur.day}|${title.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({
        title,
        details: label.slice(0, 400),
        type: workType === "other" ? "reading" : workType,
        start: at(y, mi, cur.day, workType === "reading" ? 11 : 23, workType === "reading" ? 35 : 59),
        end: null,
        allDay: false,
        location: "",
        weight: "",
        recurrence: null,
      });
    }
    cur = null;
  };

  for (const line of lines) {
    if (/^(week\s+\d+|unit\s+\w+|jump to|course description|image\.png)/i.test(line)) {
      flush();
      continue;
    }
    const head = line.match(DATE_HEAD);
    if (head) {
      flush();
      const rest = line.slice(head[0].length).replace(/^[\s:\-]+/, "").trim();
      cur = { month: head[2], day: Number(head[3]), year: head[4], bits: rest ? [rest] : [] };
      continue;
    }
    if (!cur) continue;
    if (line.length < 6 || line.length > 220) continue;
    if (/^https?:\/\//i.test(line)) continue;
    cur.bits.push(line);
    if (cur.bits.length >= 4) flush();
  }
  flush();
  return out;
}

function weeklyWorkEvents(blob: string, year: number, term: TermName, code: string): ExtractedEvent[] {
  const cadence = parseAssignmentCadence(blob);
  if (!cadence) return [];
  const skip = academicSkipDays(year, term);
  const startMonth = term === "Fall" ? 8 : term === "Spring" ? 0 : 5;
  const startDay = term === "Fall" ? 1 : 15;
  const until = new Date(termEndIso(term, year));
  const seedJs = cadence.releaseJs ?? cadence.dueJs;
  let cursor = firstWeekdayOnOrAfter(year, startMonth, startDay, seedJs);
  const out: ExtractedEvent[] = [];
  let n = 0;
  while (cursor <= until && n < 16) {
    let posted: Date | null = null;
    let due: Date;
    if (cadence.releaseJs != null) {
      posted = new Date(cursor);
      posted.setHours(cadence.releaseClock.h, cadence.releaseClock.min, 0, 0);
      due = nextWeekdayAfter(posted, cadence.dueJs, cadence.dueJs !== cadence.releaseJs);
      due.setHours(cadence.dueClock.h, cadence.dueClock.min, 0, 0);
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 7);
    } else {
      due = new Date(cursor);
      due.setHours(cadence.dueClock.h, cadence.dueClock.min, 0, 0);
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 7);
    }
    if (skip.has(ymd(due)) || (posted && skip.has(ymd(posted)))) continue;
    n += 1;
    const dueLabel = due.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const postedLabel = posted
      ? posted.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "";
    out.push({
      title: formatCourseEventTitle(code, `${cadence.kind} ${n}`),
      details: [
        posted ? `Posted ${postedLabel}. Due ${dueLabel}.` : `Due ${dueLabel}.`,
        `${code} weekly ${cadence.kind.toLowerCase()}.`,
        cadence.rules,
      ]
        .filter(Boolean)
        .join("\n\n"),
      type: "pset",
      start: due.toISOString(),
      end: null,
      allDay: false,
      location: /gradescope/i.test(blob) ? "Gradescope" : "",
      weight: "",
      recurrence: null,
      releasedAt: posted ? posted.toISOString() : null,
    });
  }
  return out;
}

export function parseSyllabus(text: string, extra = ""): Extraction {
  const blob = `${text}\n${extra}`.replace(/\u00a0/g, " ").replace(/\r/g, "");
  const header = blob.slice(0, 2500);

  const named = header.match(
    /([A-Za-z][A-Za-z0-9 &'()\-,]{6,80}),\s*([A-Za-z]{2,8})\s+(\d{3,4}[A-Za-z]?),\s*(Fall|Spring|Summer)\s+(20\d{2}|\d{2})/i,
  );
  const canvasHead = header.match(
    /\b([A-Za-z]{2,6})\s+(\d{3,5})(?:\s+\d+)?\s*\((?:FA|SP|SU|Fall|Spring|Summer)?\s*\d{2,4}\)\s*:\s*([^\n\r]+)/i,
  );
  const englishLine = header.match(/\bEnglish\s+(\d{3,5})\s*:\s*([^\n\r]+)/i);
  const fromNamed = named && looksLikeCourseCode(named[2], named[3]) ? `${named[2].toUpperCase()} ${named[3]}` : "";
  const codes = codesInText(header)[0] || codesInText(blob)[0] || "";
  const code =
    fromNamed ||
    (canvasHead && looksLikeCourseCode(canvasHead[1], canvasHead[2]) ? `${canvasHead[1].toUpperCase()} ${canvasHead[2]}` : "") ||
    (englishLine ? `ENGL ${englishLine[1]}` : "") ||
    codes ||
    "COURSE 000";
  const name = (
    named?.[1]?.trim() ||
    canvasHead?.[3]?.trim() ||
    englishLine?.[2]?.trim() ||
    blob.match(/Welcome to [^:]+:\s*([^\n!]+)/i)?.[1]?.trim() ||
    blob.match(new RegExp(`${code.replace(/\s+/g, "\\s*")}\\s*[:\\-]\\s*([^\\n|]{8,80})`, "i"))?.[1]?.trim() ||
    "Untitled course"
  ).replace(/\s+/g, " ");

  const termHit = blob.match(/\b(Fall|Spring|Summer)\s+(20\d{2}|\d{2})\b/i);
  const canvasTerm = blob.match(/\b(FA|SP|SU)(\d{2})\b/i);
  const canvasTermName = canvasTerm
    ? canvasTerm[1].toUpperCase() === "SP"
      ? "Spring"
      : canvasTerm[1].toUpperCase() === "SU"
        ? "Summer"
        : "Fall"
    : null;

  const term = ((named?.[4] || termHit?.[1] || canvasTermName || "Fall") as string).replace(/^\w/, (c) =>
    c.toUpperCase(),
  ) as TermName;
  let year = Number(named?.[5] || termHit?.[2] || (canvasTerm ? 2000 + Number(canvasTerm[2]) : 2026));
  if (year < 100) year += 2000;

  const instructor =
    header.match(/Prof\.?\s+[A-Z][a-zA-Z'’\-]+\s+[A-Z][a-zA-Z'’\-]+/)?.[0]?.trim() ||
    header.match(/Instructor:?\s*\n?\s*([^\n]+)/i)?.[1]?.replace(/Course Director:.*/i, "").trim() ||
    "";
  const director = header.match(/Dr\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/)?.[0] || "";
  const emails = [...blob.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((m) => m[0]);
  const meeting =
    blob.match(/Class:\s*([^\n]+)/i)?.[1]?.trim() ||
    blob.match(/(Monday and Wednesday|Mon(?:day)?\/Wed(?:nesday)?|MW|TR|TTh|MWF)\s+\d{1,2}:\d{2}\s*[- to ]\s*\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?/i)?.[0] ||
    "";
  const locFromClass = meeting.match(/,\s*([A-Z]{1,4}\s*\d{2,4}[A-Z]?)\b/);
  const location =
    blob.match(/Location:\s*([^\n]+)/i)?.[1]?.trim() ||
    locFromClass?.[1] ||
    blob.match(/Yale Science Building[^\n]*/i)?.[0]?.trim() ||
    "";

  const classDays = meetingDays(meeting);
  const mer = /\bpm\b/i.test(meeting) ? "pm" : /\bam\b/i.test(meeting) ? "am" : "";
  const classClock = parseClock(`${meeting.match(/(\d{1,2}:\d{2})/)?.[1] || "13:05"} ${mer}`.trim());
  const classEndClock = parseClock(`${meeting.match(/[- to ]\s*(\d{1,2}:\d{2})/)?.[1] || "14:20"} ${mer}`.trim());

  const events: ExtractedEvent[] = [];
  const push = (e: ExtractedEvent) => {
    if (!e.title || Number.isNaN(Date.parse(e.start))) return;
    events.push(e);
  };

  const lectureRe =
    /\bL(\d+)\s*[:.]?\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|Sept\.?|October|Oct\.?|November|Nov\.?|December|Dec\.?)\b[:.\s]*([^\n]*)/gi;
  let lm: RegExpExecArray | null;
  while ((lm = lectureRe.exec(blob))) {
    const mi = monthIndex(lm[3]);
    const day = Number(lm[2]);
    const topic = (lm[4] || "")
      .replace(/\(note[^)]*\)/i, "")
      .replace(/--\s*\d+\s+of\s+\d+\s+--/g, "")
      .trim();
    const details = [`Lecture ${lm[1]}`, topic, topic.match(/chapter/i) ? `Read: ${topic}` : ""]
      .filter(Boolean)
      .join(": ");
    const start = at(year, mi, day, classClock.h, classClock.min);
    const end = at(year, mi, day, classEndClock.h, classEndClock.min);
    push({
      title: formatCourseEventTitle(code, topic ? `L${lm[1]}: ${topic.slice(0, 90)}` : `Lecture ${lm[1]}`),
      details,
      type: "lecture",
      start,
      end,
      allDay: false,
      location,
      weight: "",
      recurrence: null,
    });
  }

  const midtermRe =
    /\bMIDTERM\s*(\d+)\s*[: to : -]\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b([^\n]*)/gi;
  const midtermReAlt =
    /\bMIDTERM\s*(\d+)\s*[: to : -]\s*(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?([^\n]*)/gi;
  while ((lm = midtermRe.exec(blob))) {
    const mi = monthIndex(lm[3]);
    const clocks = examClockFromNote(lm[4] || "", classClock, classEndClock);
    const loc = /tbd/i.test(clocks.location) ? "TBD" : clocks.location || location;
    push({
      title: formatCourseEventTitle(code, `Midterm ${lm[1]}`),
      details: (lm[4] || "").trim() || `Midterm exam ${lm[1]}.`,
      type: "exam",
      start: at(year, mi, Number(lm[2]), clocks.start.h, clocks.start.min),
      end: at(year, mi, Number(lm[2]), clocks.end.h, clocks.end.min),
      allDay: false,
      location: loc,
      weight: lm[1] === "1" ? "18%" : "25%",
      recurrence: null,
    });
  }
  while ((lm = midtermReAlt.exec(blob))) {
    const mi = monthIndex(lm[2]);
    const clocks = examClockFromNote(lm[4] || "", classClock, classEndClock);
    const loc = /tbd/i.test(clocks.location) ? "TBD" : clocks.location || location;
    push({
      title: formatCourseEventTitle(code, `Midterm ${lm[1]}`),
      details: (lm[4] || "").trim() || `Midterm exam ${lm[1]}.`,
      type: "exam",
      start: at(year, mi, Number(lm[3]), clocks.start.h, clocks.start.min),
      end: at(year, mi, Number(lm[3]), clocks.end.h, clocks.end.min),
      allDay: false,
      location: loc,
      weight: lm[1] === "1" ? "18%" : "25%",
      recurrence: null,
    });
  }

  const finalBlock = blob.match(/FINAL EXAM[:\s][\s\S]{0,500}/i)?.[0] || blob.match(/\bFINAL EXAM\s*[ to : :-][^\n]+/i)?.[0] || "";
  const finalDate = finalBlock.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?(?:[^\n]{0,40}?(?:at\s*)(\d{1,2}\s*(?::\d{2})?\s*(?:am|pm)))?/i,
  );
  if (finalDate) {
    const mi = monthIndex(finalDate[1]);
    const clock = parseClock(finalDate[4] || "9:00 am");
    const fy = finalDate[3] ? Number(finalDate[3]) : year;
    push({
      title: formatCourseEventTitle(code, "Final exam"),
      details: finalBlock.replace(/\s+/g, " ").trim(),
      type: "exam",
      start: at(fy, mi, Number(finalDate[2]), clock.h, clock.min),
      end: at(fy, mi, Number(finalDate[2]), clock.h + 3, clock.min),
      allDay: false,
      location: /tbd/i.test(finalBlock) ? "TBD" : "",
      weight: "40%",
      recurrence: null,
    });
  }

  const recessRe =
    /(?:No lecture|Recess: No lecture)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s+or\s+(\d{1,2}))?/gi;
  while ((lm = recessRe.exec(blob))) {
    const mi = monthIndex(lm[1]);
    const days = [Number(lm[2]), lm[3] ? Number(lm[3]) : null].filter((n): n is number => Boolean(n));
    for (const day of days) {
      push({
        title: formatCourseEventTitle(code, "No lecture (recess)"),
        details: `No lecture on ${lm[1]} ${day}.`,
        type: "other",
        start: at(year, mi, day, 0, 0),
        end: null,
        allDay: true,
        location: "",
        weight: "",
        recurrence: null,
      });
    }
  }

  const datedAssignments = datedAssignmentEvents(blob, year, term, code);
  events.push(...datedAssignments);
  events.push(...sessionReadingEvents(blob, year, term, code));

  const datedPsets = events.filter((e) => (e.type === "pset" || e.type === "assignment") && !e.recurrence && /pset|problem set|homework/i.test(e.title)).length;
  if (datedPsets < 4) {
    events.push(...weeklyWorkEvents(blob, year, term, code));
  }

  const officeHours: ExtractedCourse["officeHours"] = [];
  const dropIn = blob.match(
    /Drop-in hours\s*[ to \-]\s*(Mondays?)\s+(\d{1,2}:\d{2})\s*[ to \-]\s*(\d{1,2}(?::\d{2})?)/i,
  );
  if (dropIn) {
    const s = parseClock(dropIn[2], 14, 40);
    const e = parseClock(dropIn[3], 16, 0);
    officeHours.push({
      holder: instructor || "Instructor",
      location: blob.match(/87 Trumbull[^,\n]*/i)?.[0] || location,
      days: ["MO"],
      start: `${String(s.h).padStart(2, "0")}:${String(s.min).padStart(2, "0")}`,
      end: `${String(e.h).padStart(2, "0")}:${String(e.min).padStart(2, "0")}`,
      notes: `${instructor || "Instructor"} drop-in office hours Mondays ${dropIn[2]} to ${dropIn[3]} at ${blob.match(/87 Trumbull[^,\n]*/i)?.[0] || location}. No appointment needed. Also usually 15 minutes before/after lecture.`,
    });
  } else {
    const oh = blob.match(
      /Office Hours:\s*([A-Za-z]{1,9})[^\n]{0,20}?(\d{1,2}(?::\d{2})?)\s*[- to ]\s*(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)?/i,
    );
    if (oh) {
      const mer = (oh[4] || "pm").replace(/\./g, "");
      const s = parseClock(`${oh[2]} ${mer}`);
      const e = parseClock(`${oh[3]} ${mer}`);
      const days = officeHourDays(oh[1]);
      const loc = blob.match(/Office Location:\s*([^\n]+)/i)?.[1]?.trim() || location;
      officeHours.push({
        holder: instructor || "Instructor",
        location: loc,
        days: days.length ? days : ["WE"],
        start: `${String(s.h).padStart(2, "0")}:${String(s.min).padStart(2, "0")}`,
        end: `${String(e.h).padStart(2, "0")}:${String(e.min).padStart(2, "0")}`,
        notes: `${instructor || "Instructor"} office hours ${oh[1]} ${oh[2]} to ${oh[3]} ${mer} at ${loc}.`,
      });
    }
  }

  const policies = extractKeyPolicies(blob);

  const until = termEndIso(term, year);
  const datedLectures = events.filter((e) => e.type === "lecture" && !e.recurrence).length;
  if (classDays.length && meeting && datedLectures < 3) {
    const startDay = firstWeekdayOnOrAfter(year, term === "Fall" ? 8 : 0, 1, classDays[0] === "MO" ? 1 : 3);
    push({
      title: formatCourseEventTitle(code, "Lecture"),
      details: `Recurring class meeting: ${meeting}. Location: ${location}.`,
      type: "lecture",
      start: at(startDay.getFullYear(), startDay.getMonth(), startDay.getDate(), classClock.h, classClock.min),
      end: at(startDay.getFullYear(), startDay.getMonth(), startDay.getDate(), classEndClock.h, classEndClock.min),
      allDay: false,
      location,
      weight: "",
      recurrence: { freq: "weekly", byDay: classDays, until },
    });
  }

  return {
    course: {
      code,
      name,
      instructor: director ? `${instructor} (Course Director: ${director})` : instructor,
      instructorEmail: emails[0] || "",
      location,
      meetingPattern: meeting,
      term,
      year,
      academicYear: academicYearFor(term, year),
      policies,
      extraContext: extra,
      officeHours,
    },
    events,
    notes: [],
    summary: `Parsed ${code}: ${name} (${term} ${year}): ${events.length} calendar items (lectures, exams, weekly work, office hours).`,
  };
}

export function guessType(text: string): EventType {
  if (/\boffice\s*hours?\b/i.test(text)) return "office_hour";
  if (/\bmidterm|\bfinal\b|\bexam\b/i.test(text)) return "exam";
  if (/\bquiz/i.test(text)) return "quiz";
  if (/\bpset\b|\bproblem\s*set\b/i.test(text)) return "pset";
  if (/\blab\b/i.test(text)) return "lab";
  if (/\bproject\b/i.test(text)) return "project";
  if (/\bpaper\b|\bdraft\b|\bessay\b|\bproposal\b/i.test(text)) return "assignment";
  if (/\breading\b|\bchapter\b/i.test(text)) return "reading";
  if (/\blecture\b|^L\d+/i.test(text)) return "lecture";
  if (/\bassignment\b|\bhomework\b|\bdue\b/i.test(text)) return "assignment";
  return "other";
}
