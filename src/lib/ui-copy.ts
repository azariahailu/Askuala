import { ASSISTANT_NAME } from "./brand";

export const UI_DEFAULTS: Record<string, string> = {
  "nav.home": "Home",
  "nav.calendar": "Unified calendar",
  "nav.assistant": ASSISTANT_NAME,
  "nav.settings": "Settings",
  "nav.academics": "Academics",
  "nav.year": "Year {n}",
  "nav.noCourses": "No courses yet",
  "nav.chat": "Chat",
  "nav.signOut": "Sign out",
  "home.welcome": "Welcome, {name}!",
  "nav.quickNotes": "Quick Notes",
  "home.tagline": `Fall 2026–Spring 2030 · courses, calendar, and ${ASSISTANT_NAME}.`,
  "home.addCourse": "Add course",
  "home.away": "While you were away",
  "pins.urgent": "Urgent · next 48 hours",
  "pins.urgentEmpty": "Nothing due in the next two days.",
  "pins.majors": "Major assessments · next 2 weeks",
  "pins.majorsCourse": "This course · next 2 weeks",
  "pins.majorsEmpty": "No exams, projects, papers, or presentations in the next two weeks.",
  "board.work": "All courses · work by week",
  "board.workCourse": "This course · work by week",
  "board.workBlurb": "Readings, papers, drafts, problem sets, and other assignments from this week forward.",
  "board.empty": "Nothing due in the next weeks.",
  "course.edit": "Edit course",
  "course.update": "Update from file/text",
  "course.drop": "Drop",
  "course.restore": "Restore",
  "course.delete": "Remove",
  "course.tab.overview": "overview",
  "course.tab.calendar": "calendar",
  "course.tab.notes": "notes",
  "course.policies": "Key policies",
  "course.policiesBlurb": "Extracted highlights — grading, deadlines, exams, and anything unusual. Not the full Canvas page.",
  "cal.title": "Unified calendar",
  "cal.lens.all": "Unified",
  "cal.lens.majors": "Majors",
  "cal.lens.office": "Office hours",
  "cal.lens.psets": "Problem sets",
  "cal.lens.course": "Course work",
  "cal.lens.other": "Other",
  "cal.courseTitle": "Course calendar",
  "cal.blurb": "Past days stay on the month grid. The list starts from now.",
  "cal.add": "Add event",
  "cal.upcoming": "Upcoming",
  "chat.placeholder": "Ask about a course…",
  "chat.empty": `Ask ${ASSISTANT_NAME} about today or a course. Paste a Canvas syllabus or attach a file to update the planner.`,
};

export function firstName(full: string) {
  const t = (full || "").trim();
  if (!t) return "there";
  return t.split(/\s+/)[0].replace(/[,'"]/g, "");
}

export function fillUiText(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

export function resolveUiKey(input: string) {
  const q = input.trim();
  if (!q) return "";
  if (UI_DEFAULTS[q]) return q;
  const lower = q.toLowerCase();
  const keys = Object.keys(UI_DEFAULTS);
  const exact = keys.find((k) => k.toLowerCase() === lower);
  if (exact) return exact;
  const byLabel = keys.find((k) => UI_DEFAULTS[k].toLowerCase() === lower);
  if (byLabel) return byLabel;
  const partial = keys.find((k) => k.toLowerCase().includes(lower) || UI_DEFAULTS[k].toLowerCase().includes(lower));
  return partial || q;
}

export function listUiLabels(overrides: Record<string, string> | undefined) {
  return Object.keys(UI_DEFAULTS).map((key) => ({
    key,
    default: UI_DEFAULTS[key],
    current: overrides?.[key] ?? UI_DEFAULTS[key],
  }));
}
