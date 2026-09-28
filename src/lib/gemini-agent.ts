import type { AppState, ChatMessage, Course } from "./types";
import { attachEventsToCourses, inferCourseId, isPastEvent } from "./calendar-utils";
import { executeJsonActions, parseActionsFromReply, type PlannerAction } from "./assistant-actions";
import { listUiLabels } from "./ui-copy";
import { geminiApiKey, geminiGenerate, isGeminiQuotaError } from "./llm";
import { APP_NAME, ASSISTANT_NAME } from "./brand";

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "read_planner",
        description:
          "Read live planner data: courses, events, notes, policies, extra notes, office hours, syllabus excerpts. Call this whenever you need details.",
        parameters: {
          type: "OBJECT",
          properties: {
            course: { type: "STRING", description: "Course code like SCIE 0020, or empty for everything" },
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

function snapshot(state: AppState, courseHint = "", includeSyllabus = false, includeNotes = true) {
  attachEventsToCourses(state);
  const hint = courseHint.toLowerCase();
  const courses = state.courses.filter((c) => !c.dropped && (!hint || c.code.toLowerCase().includes(hint) || c.name.toLowerCase().includes(hint)));
  const ids = new Set(courses.map((c) => c.id));
  const events = state.events
    .filter((e) => !e.canceled && (!hint || ids.has(inferCourseId(e, state.courses) || "") || e.title.toLowerCase().includes(hint)))
    .sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = events.filter((e) => !isPastEvent(e)).slice(0, 80);
  const notes = includeNotes
    ? state.notes.filter((n) => !hint || ids.has(n.courseId)).map((n) => ({
        id: n.id,
        courseId: n.courseId,
        kind: n.kind,
        title: n.title,
        body: (n.body || "").slice(0, 800),
        summary: (n.summary || "").slice(0, 1200),
        transcript: (n.transcript || "").slice(0, 1500),
        catalogDate: n.catalogDate,
      }))
    : [];
  return {
    now: new Date().toISOString(),
    courses: courses.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      instructor: c.instructor,
      instructorEmail: c.instructorEmail,
      location: c.location,
      meetingPattern: c.meetingPattern,
      officeHours: c.officeHours,
      extraContext: (c.extraContext || "").slice(0, 2000),
      term: c.term,
      year: c.year,
      policies: c.policies,
      syllabus: includeSyllabus ? (c.syllabusText || "").slice(0, 8000) : undefined,
    })),
    upcoming,
    notes,
    uiLabels: listUiLabels(state.uiText),
  };
}

function dispatch(state: AppState, name: string, args: Record<string, unknown>) {
  try {
    if (name === "read_planner") {
      return snapshot(state, String(args.course || ""), Boolean(args.includeSyllabus), args.includeNotes !== false);
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
  const system = `You are ${ASSISTANT_NAME}, the assistant inside ${APP_NAME}, powered by Gemini. You can read and edit the planner (courses, calendar, notes, policies, office hours, meetings) and rewrite on-screen chrome via set_ui. Use tools when they ask to change what they see.

A degree roadmap / four-year plan is NOT a syllabus. Call apply_actions with one add_course per listed class (code, name, Fall|Spring|Summer, year). Names only — no fake lectures, psets, or a single junk course. Electives stay worded as on the plan (Hu-designated, free elective, graduate elective, DR completer, career elective).

delete/remove = delete_course (gone). drop = drop_course (still listed as dropped). Answer the question they asked. Do not dump the whole calendar unless they asked. You are Gemini, not DeepSeek. Never quote a class transcript word-for-word.`;
  const user = [
    opts.message,
    opts.extractedText ? `Attached file:\n${opts.extractedText.slice(0, 8000)}` : "",
    opts.applied ? `Just applied course ${opts.applied.code} ${opts.applied.name} from an upload.` : "",
    `Snapshot:\n${JSON.stringify(snapshot(opts.state, "", false, true)).slice(0, 14000)}`,
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
    for (let step = 0; step < 8; step++) {
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
        const result = dispatch(opts.state, call.functionCall.name, call.functionCall.args || {});
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

  const wantsEdit =
    /\b(add|create|update|delete|remove|change|set |drop |move |remind|schedule|rename|label|heading|wording|call it|roadmap|four[- ]year)\b/i.test(
      opts.message,
    ) || Boolean(opts.extractedText && opts.extractedText.length > 80);
  if (wantsEdit) return await run(TOOLS);
  try {
    return await run(undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (isGeminiQuotaError(msg)) throw e;
    return await run(TOOLS);
  }
}
