import { addDays, addWeeks } from "date-fns";
import type { AppState, ChatMessage, Course, CourseEvent } from "./types";
import { attachEventsToCourses, expandEvents, inferCourseId } from "./calendar-utils";
import { executeJsonActions, parseActionsFromReply, type PlannerAction } from "./assistant-actions";
import { listUiLabels } from "./ui-copy";
import { geminiApiKey, geminiGenerate } from "./llm";
import { APP_NAME, ASSISTANT_NAME } from "./brand";

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "read_planner",
        description:
          "Read the live planner the student sees: courses, expanded calendar instances (recurring Google lectures and office hours included), notes, policies, office hours, syllabus. Call this before saying something is missing from the calendar.",
        parameters: {
          type: "OBJECT",
          properties: {
            course: { type: "STRING", description: "Course code like SCIE 0020, or empty for everything" },
            query: { type: "STRING", description: "Optional title search, e.g. midterm or office hours" },
            from: { type: "STRING", description: "ISO date to start the calendar window" },
            to: { type: "STRING", description: "ISO date to end the calendar window" },
            includePast: { type: "BOOLEAN", description: "If true, include the last 4 months of instances" },
            includeSyllabus: { type: "BOOLEAN" },
            includeNotes: { type: "BOOLEAN" },
          },
        },
      },
      {
        name: "apply_actions",
        description:
          "Create, update, or delete courses, calendar events, notes, office hours, meeting patterns, and on-screen labels (set_ui). Use this whenever the student asks you to change anything they see.",
        parameters: {
          type: "OBJECT",
          properties: {
            actions: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  op: {
                    type: "STRING",
                    description:
                      "add_course | update_course | delete_course | drop_course | restore_course | add_event | update_event | delete_event | add_note | update_note | delete_note | set_office_hours | set_meeting | set_ui. add_course is names/term only. delete_course removes forever; drop_course is add/drop.",
                  },
                  course: { type: "STRING" },
                  match: { type: "STRING" },
                  id: { type: "STRING" },
                  title: { type: "STRING" },
                  body: { type: "STRING" },
                  summary: { type: "STRING" },
                  details: { type: "STRING" },
                  type: { type: "STRING" },
                  start: { type: "STRING" },
                  end: { type: "STRING" },
                  location: { type: "STRING" },
                  officeHours: { type: "STRING" },
                  meetingPattern: { type: "STRING" },
                  fields: { type: "OBJECT" },
                },
                required: ["op"],
              },
            },
          },
          required: ["actions"],
        },
      },
    ],
  },
];

type GPart = Record<string, unknown>;
type GContent = { role: string; parts: GPart[] };

function calendarWindow(from?: string, to?: string, includePast = false) {
  const start = from ? new Date(from) : addDays(new Date(), includePast ? -120 : -1);
  start.setHours(0, 0, 0, 0);
  const end = to ? new Date(to) : addWeeks(new Date(), 12);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function slimEvent(state: AppState, event: CourseEvent) {
  const course = state.courses.find((c) => c.id === inferCourseId(event, state.courses));
  return {
    id: event.id,
    title: event.title,
    type: event.type,
    start: event.start,
    end: event.end || undefined,
    allDay: event.allDay || undefined,
    course: course ? `${course.code} ${course.name}` : event.source === "google" ? "Google" : "",
    location: event.location || undefined,
    source: event.source,
  };
}

function snapshot(
  state: AppState,
  opts: {
    course?: string;
    query?: string;
    from?: string;
    to?: string;
    includePast?: boolean;
    includeSyllabus?: boolean;
    includeNotes?: boolean;
  } = {},
) {
  attachEventsToCourses(state);
  const hint = (opts.course || "").toLowerCase();
  const query = (opts.query || "").toLowerCase();
  const courses = state.courses.filter(
    (c) => !c.dropped && (!hint || c.code.toLowerCase().includes(hint) || c.name.toLowerCase().includes(hint)),
  );
  const ids = new Set(courses.map((c) => c.id));
  const { start, end } = calendarWindow(opts.from, opts.to, Boolean(opts.includePast));
  const events = expandEvents(state.events, start, end).filter((e) => {
    if (hint && !ids.has(inferCourseId(e, state.courses) || "") && !e.title.toLowerCase().includes(hint)) return false;
    if (query && !`${e.title} ${e.details || ""} ${e.location || ""}`.toLowerCase().includes(query)) return false;
    return true;
  });
  const notes = opts.includeNotes
    ? state.notes
        .filter((n) => !hint || ids.has(n.courseId))
        .map((n) => ({
          id: n.id,
          courseId: n.courseId,
          kind: n.kind,
          title: n.title,
          body: (n.body || "").slice(0, 500),
          summary: (n.summary || "").slice(0, 800),
          catalogDate: n.catalogDate,
        }))
    : [];
  return {
    now: new Date().toISOString(),
    googleLastSynced: state.settings.google.lastSyncedAt || null,
    googleEmail: state.settings.google.connectedEmail || null,
    calendarWindow: { from: start.toISOString(), to: end.toISOString() },
    courses: courses.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      instructor: c.instructor,
      instructorEmail: c.instructorEmail,
      location: c.location,
      meetingPattern: c.meetingPattern,
      officeHours: c.officeHours,
      extraContext: hint ? (c.extraContext || "").slice(0, 2000) : undefined,
      term: c.term,
      year: c.year,
      policies: c.policies,
      syllabus: opts.includeSyllabus ? (c.syllabusText || "").slice(0, 8000) : undefined,
    })),
    calendar: events.slice(0, 280).map((e) => slimEvent(state, e)),
    notes,
    uiLabels: listUiLabels(state.uiText),
  };
}

function toolArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

function dispatch(state: AppState, name: string, args: Record<string, unknown>) {
  try {
    if (name === "read_planner") {
      return snapshot(state, {
        course: String(args.course || ""),
        query: String(args.query || ""),
        from: args.from ? String(args.from) : undefined,
        to: args.to ? String(args.to) : undefined,
        includePast: Boolean(args.includePast),
        includeSyllabus: Boolean(args.includeSyllabus),
        includeNotes: args.includeNotes !== false,
      });
    }
    if (name === "apply_actions") {
      const actions = (Array.isArray(args.actions) ? args.actions : []) as PlannerAction[];
      const log = executeJsonActions(state, actions);
      attachEventsToCourses(state);
      return { ok: true, log };
    }
    return { error: `Unknown tool ${name}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runGeminiAgent(opts: {
  state: AppState;
  message: string;
  extractedText: string;
  history: ChatMessage[];
  applied?: Course | null;
}) {
  const key = geminiApiKey(opts.state.settings);
  if (!key) throw new Error("no-gemini-key");
  const system = `You are ${ASSISTANT_NAME}, the assistant inside ${APP_NAME}, powered by Gemini. You can read and edit the live planner: courses, calendar (including recurring Google lectures and office hours), notes, policies, office hours, meetings, and on-screen labels (set_ui).

The student can already see the calendar in the app. Recurring items are stored as one series: instances appear when you call read_planner (it expands them the same way the calendar board does). NEVER say an event, class, or assignment does not exist unless read_planner (or the calendar list in this message) shows it missing. If they ask about the calendar, call read_planner with a query or course code first.

Use apply_actions to add/update/delete what they asked to change. Use read_planner for notes and syllabi.

A degree roadmap / four-year plan is NOT a syllabus. Call apply_actions with one add_course per listed class (code, name, Fall|Spring|Summer, year). Names only: no fake lectures, psets, or a single junk course.

delete/remove = delete_course (gone). drop = drop_course (still listed as dropped). Answer the question they asked. You are Gemini. Never quote a class transcript word-for-word.`;
  const live = snapshot(opts.state, { includeNotes: false, includeSyllabus: false });
  const user = [
    opts.message,
    opts.extractedText ? `Attached file:\n${opts.extractedText.slice(0, 8000)}` : "",
    opts.applied ? `Just applied course ${opts.applied.code} ${opts.applied.name} from an upload.` : "",
    `Calendar (expanded repeats, next ~12 weeks: same events as Home/Calendar):\n${JSON.stringify({ now: live.now, courses: live.courses.map((c) => ({ code: c.code, name: c.name, meetingPattern: c.meetingPattern, officeHours: c.officeHours })), calendar: live.calendar }).slice(0, 24000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const startContents: GContent[] = [
    ...opts.history.slice(-8).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, 1500) }] as GPart[],
    })),
    { role: "user", parts: [{ text: user }] },
  ];

  const run = async (tools: unknown | undefined) => {
    const contents = startContents.map((c) => ({ ...c, parts: [...c.parts] }));
    let parts = (await geminiGenerate({ key, system, contents, tools, long: true })).parts;
    for (let step = 0; step < 3; step++) {
      const calls = parts.filter((p) => p.functionCall) as { functionCall: { name: string; args?: Record<string, unknown> } }[];
      const text = parts
        .map((p) => (typeof p.text === "string" ? p.text : ""))
        .join("")
        .trim();
      if (!calls.length) {
        if (!text) break;
        const parsed = parseActionsFromReply(text);
        if (parsed.actions.length) {
          const log = executeJsonActions(opts.state, parsed.actions);
          return { reply: [parsed.cleaned, log].filter(Boolean).join("\n\n"), model: "gemini" };
        }
        return { reply: text, model: "gemini" };
      }
      contents.push({ role: "model", parts });
      const responses: GPart[] = [];
      for (const call of calls) {
        const result = dispatch(opts.state, call.functionCall.name, toolArgs(call.functionCall.args));
        responses.push({
          functionResponse: {
            name: call.functionCall.name,
            response: result,
          },
        });
      }
      contents.push({ role: "user", parts: responses });
      parts = (await geminiGenerate({ key, system, contents, tools, long: true })).parts;
    }
    const fallback = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("").trim();
    if (fallback) return { reply: fallback, model: "gemini" };
    throw new Error("Gemini returned no text");
  };

  return await run(TOOLS);
}
