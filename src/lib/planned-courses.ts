import { nid, nowIso, nextCourseColor } from "./ids";
import { academicYearFor } from "./terms";
import { normalizeCourseCode } from "./calendar-utils";
import type { AppState, Course, TermName } from "./types";

export type PlannedCourse = {
  code: string;
  name: string;
  term: TermName;
  year: number;
};

const TERM_HEAD = /^\s*(FALL|SPRING|SUMMER)\s+(20\d{2})\b/i;
const CODED =
  /^((?:S&DS)|[A-Z]{2,6})\s+(\d{3,4}[A-Z]?)(?:\s*\/\s*(?:S&DS|[A-Z]{2,6})\s+\d{4})?\s+[:  to -]\s+(.+)$/;

const PLACEHOLDERS: { test: RegExp; name: string; kind: string }[] = [
  { test: /^hu-designated first-year seminar\b/i, name: "Hu-designated First-Year Seminar", kind: "HU FYS" },
  { test: /^hu-designated course\b/i, name: "Hu-designated course", kind: "HU ELEC" },
  {
    test: /^dr completer\b/i,
    name: "DR completer: whichever of Sc/WR is still at 1-of-2 (ANTH 0418 or PHIL 0060)",
    kind: "DR COMP",
  },
  {
    test: /^optional\s+[:  to -]\s*career elective\b/i,
    name: "Optional: career elective (ECON 2251 / ECON 4419 / PSYC 2538 / NSCI 2380)",
    kind: "CAREER",
  },
  {
    test: /^s&ds graduate elective\b/i,
    name: "S&DS graduate elective: confirm with DUS",
    kind: "SDS GRAD",
  },
  { test: /^graduate s&ds elective\b/i, name: "Graduate S&DS elective", kind: "grad-ma" },
  { test: /^free elective\b/i, name: "Free elective", kind: "free" },
];

function cleanName(raw: string) {
  return raw
    .replace(/\s+(QR|Lang|So|Sc|WR|Hu|Confirmed)\s*$/i, "")
    .replace(/\s+0\.5\s*cr\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function skipLine(line: string) {
  return /^(goal:|prereq:|catalog |no prerequisites|confirmed:|milestone:|fallback|room for one|all distributional|bs\/ma prep|bs\/ma application|jane street|september|attend every|build github|late spring|this is one hard|language stack|the scie|why \d|why this|promotion|non-negotiable|resolved|removed:|honors grade|phd option|graduation:|recruiting actions|before arriving|continue khan|start python|get referrals|prep:|one internship|interview prep|summer \d{4}|targets:|walk into|file:\/\/|page \d|azaria's ultimate|yale universit)/i.test(
    line,
  );
}

export function looksLikeDegreeRoadmap(text: string) {
  const terms = text.match(/\b(FALL|SPRING|SUMMER)\s+20\d{2}\b/gi) || [];
  const unique = new Set(terms.map((t) => t.toUpperCase().replace(/\s+/g, " ")));
  return (
    unique.size >= 3 &&
    /\b(roadmap|four[- ]year|degree plan|academic plan|b\.?\s*s\.?\s*\/\s*m\.?\s*a)/i.test(text)
  );
}

export function parseDegreeRoadmap(text: string): PlannedCourse[] {
  const cut = text.split(
    /\n(?=Distributional Requirements Tracker|BS\/MA Graduate Course Tracker|Quant Research Recruiting Timeline|Open Questions|YEAR 3: 4 COURSES|YEAR 4: 4 COURSES)/i,
  )[0];
  const lines = cut.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: PlannedCourse[] = [];
  let term: TermName | null = null;
  let year = 0;
  let gradMa = 0;
  let freeN = 0;

  for (const line of lines) {
    const head = line.match(TERM_HEAD);
    if (head) {
      if (/\bcredits?\b/i.test(line) && line.length < 48) continue;
      term = (head[1][0] + head[1].slice(1).toLowerCase()) as TermName;
      year = Number(head[2]);
      continue;
    }
    if (!term || !year) continue;
    if (skipLine(line) || line.length > 180) continue;

    const coded = line.match(CODED);
    if (coded) {
      let name = cleanName(coded[3]);
      const code = normalizeCourseCode(`${coded[1]} ${coded[2]}`) || `${coded[1]} ${coded[2]}`;
      if (/^continuation$/i.test(name) && /SCIE\s*0021/i.test(code)) {
        name = "Perspectives on Research in the Mathematical and Physical Sciences (continuation)";
      }
      if (name && !out.some((c) => c.code === code && c.term === term && c.year === year)) {
        out.push({ code, name, term, year });
      }
      continue;
    }

    for (const ph of PLACEHOLDERS) {
      if (!ph.test.test(line)) continue;
      const code =
        ph.kind === "grad-ma"
          ? `SDS MA${7 + gradMa++}`
          : ph.kind === "free"
            ? `FREE ${++freeN}`
            : ph.kind;
      if (!out.some((c) => c.code === code && c.term === term && c.year === year)) {
        out.push({ code, name: ph.name, term, year });
      }
      break;
    }
  }
  return out;
}

export function deleteCourse(state: AppState, course: Course) {
  const id = course.id;
  state.courses = state.courses.filter((c) => c.id !== id);
  state.events = state.events.filter((e) => e.courseId !== id);
  state.notes = state.notes.filter((n) => n.courseId !== id);
}

export function addPlannedCourse(state: AppState, plan: PlannedCourse) {
  const code = plan.code.trim();
  const existing = state.courses.find(
    (c) =>
      normalizeCourseCode(c.code) === normalizeCourseCode(code) &&
      c.term === plan.term &&
      c.year === plan.year,
  );
  if (existing) {
    if (existing.dropped) existing.dropped = false;
    if (!existing.name || /^untitled/i.test(existing.name)) existing.name = plan.name;
    existing.updatedAt = nowIso();
    return { course: existing, created: false };
  }
  const color = nextCourseColor(state.courses.length);
  const course: Course = {
    id: nid(),
    code,
    name: plan.name,
    instructor: "",
    instructorEmail: "",
    location: "",
    meetingPattern: "",
    term: plan.term,
    year: plan.year,
    academicYear: academicYearFor(plan.term, plan.year),
    color: color.hex,
    googleColorId: color.google,
    googleCalendarId: null,
    policies: [],
    extraContext: "",
    officeHours: "",
    syllabusText: "",
    dropped: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.courses.push(course);
  return { course, created: true };
}

export function applyDegreeRoadmap(state: AppState, text: string) {
  const planned = parseDegreeRoadmap(text);
  let created = 0;
  let skipped = 0;
  for (const plan of planned) {
    const { created: wasNew } = addPlannedCourse(state, plan);
    if (wasNew) created += 1;
    else skipped += 1;
  }
  return { planned: planned.length, created, skipped, courses: planned };
}

/** Fake “one course” leftovers from treating a multi-year plan as a syllabus. */
export function purgeRoadmapJunk(state: AppState) {
  const junk = state.courses.filter(
    (c) =>
      /roadmap/i.test(`${c.code} ${c.name} ${c.syllabusText}`) ||
      /b\.?s\.?\s*\/\s*m\.?a/i.test(`${c.code} ${c.name}`) ||
      /^s&ds\s*bsma$/i.test(c.code),
  );
  for (const course of junk) deleteCourse(state, course);
  return junk.length;
}
