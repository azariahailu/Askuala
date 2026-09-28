import type { AppSettings, AppState, ChatMessage, Course, CourseEvent, CourseNote } from "./types";
import { applyExtraction } from "./apply-extraction";
import { applyDegreeRoadmap, looksLikeDegreeRoadmap, purgeRoadmapJunk } from "./planned-courses";
import { heuristicExtract, type Extraction } from "./heuristic";
import { extractWithAI } from "./ai";
import { attachEventsToCourses, inferCourseId, isPastEvent } from "./calendar-utils";
import { llmChat, llmMissingMessage, geminiApiKey } from "./llm";
import { runGeminiAgent } from "./gemini-agent";
import { executeJsonActions, parseActionsFromReply, type PlannerAction } from "./assistant-actions";
import { listUiLabels } from "./ui-copy";
import { APP_NAME, ASSISTANT_NAME } from "./brand";

const SYSTEM_GUIDE = `You are ${ASSISTANT_NAME}, the assistant inside ${APP_NAME}.

If they ask who you are: you are ${ASSISTANT_NAME} (not the app itself — the app is ${APP_NAME}). You answer with Google Gemini when a key is saved in Settings. You are not DeepSeek, ChatGPT, Claude, or Grok. Then answer anything else they asked.

Answer the question they asked first. Use PLANNER DATA (it is their live planner). If ACTION RESULT is present, those edits already happened — confirm them, then answer.

You have full read of courses, calendar (including repeats), notes, transcripts, study summaries, policies, chats, settings, and on-screen labels (uiLabels). When they ask you to change the planner or what they see on screen, you may emit an \`\`\`actions JSON fence (see rules below) and the app will apply it.

Do not dump the whole calendar unless they asked what is upcoming. Do not invent due dates. Do not mix courses. Markdown is fine. No <think> tags.`;

const MAX_PROMPT_CHARS = 22000;

export async function freeExtract(text: string, extra: string, settings?: AppSettings | string): Promise<Extraction> {
  const local = heuristicExtract(text, extra);
  const cfg = typeof settings === "string" ? ({ openaiKey: settings, deepseekKey: "", geminiKey: "" } as AppSettings) : settings;
  if (geminiApiKey(cfg)) {
    try {
      return await extractWithAI(text, extra, cfg);
    } catch {
      return local;
    }
  }
  const strong =
    local.events.length >= 3 &&
    Boolean(local.course.code && !/^NEW\s|^COURSE\s/i.test(local.course.code)) &&
    Boolean(local.course.name && !/^untitled/i.test(local.course.name));
  if (strong) return local;
  try {
    return await extractWithAI(text, extra, cfg);
  } catch {
    return local;
  }
}

export async function runAssistant(opts: {
  state: AppState;
  message: string;
  extractedText: string;
  extra: string;
  history: ChatMessage[];
}) {
  const { state, message, extractedText, extra, history } = opts;
  attachEventsToCourses(state);

  let applied: Course | null = null;
  const blob = `${extractedText} ${message} ${extra}`;
  if (extractedText.length > 120 && looksLikeDegreeRoadmap(blob)) {
    purgeRoadmapJunk(state);
    const result = applyDegreeRoadmap(state, extractedText);
    attachEventsToCourses(state);
    const list = result.courses.map((c) => `• ${c.term} ${c.year}: ${c.code} — ${c.name}`).join("\n");
    return {
      reply: `Added ${result.created} planned courses from your roadmap (${result.skipped} already on the planner). Names and terms only — no lectures or assignments invented.\n\n${list}`,
      appliedCourseId: null,
    };
  }
  const looksSyllabus =
    extractedText.length > 120 &&
    /\b(syllabus|office hours|problem set|lecture|exam|instructor|canvas)\b/i.test(`${extractedText} ${message}`) &&
    !looksLikeDegreeRoadmap(blob);
  if (looksSyllabus) {
    const extraction = await freeExtract(extractedText, extra || message, state.settings);
    applied = applyExtraction(state, extraction, { extraContext: extra || message, eventSource: "assistant" });
    attachEventsToCourses(state);
  }

  if (geminiApiKey(state.settings)) {
    try {
      const { reply } = await runGeminiAgent({ state, message, extractedText, history, applied });
      return { reply, appliedCourseId: applied?.id ?? null };
    } catch (e) {
      const err = e instanceof Error ? e.message : "Gemini failed";
      return {
        reply: /denied access/i.test(err)
          ? `Tried every Gemini Flash/Pro id this key can call. Google returned the same block on all of them (${err.slice(0, 100)}). That is a project-level deny, not a missing model — a new key on the same Cloud project will fail too. Create a **new project** + key at aistudio.google.com. I did not fall back to DeepSeek.`
          : `Tried every available Gemini model; none returned text (${err.slice(0, 220)}). I did not fall back to DeepSeek.`,
        appliedCourseId: applied?.id ?? null,
      };
    }
  }

  const packed = packPrompt(state, history, message, extractedText, applied, "");
  const { text, error, reason } = await llmChat(packed, state.settings);

  let reply = text;
  if (reply) {
    const parsed = parseActionsFromReply(reply);
    if (parsed.actions.length) {
      const extraLog = executeJsonActions(state, parsed.actions);
      attachEventsToCourses(state);
      reply = [parsed.cleaned, extraLog].filter(Boolean).join("\n\n");
    }
  }

  if (reply) return { reply, appliedCourseId: applied?.id ?? null };
  if (reason === "install" || reason === "pulling") {
    return { reply: error || llmMissingMessage(), appliedCourseId: applied?.id ?? null };
  }
  return { reply: plannerFallback(state, message, applied), appliedCourseId: applied?.id ?? null };
}

function packPrompt(state: AppState, history: ChatMessage[], message: string, extractedText: string, applied: Course | null, actionLog = "") {
  const userTurn = [
    message,
    extractedText ? `Attached file (excerpt):\n${extractedText.slice(0, 4000)}` : "",
    applied ? `Applied course ${applied.code} ${applied.name} from that upload.` : "",
    actionLog ? `ACTION RESULT (already saved): ${actionLog}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);

  const hist = history
    .slice(-8)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content.replace(/<think>[\s\S]*?<\/think>/gi, "").slice(0, 700),
    }))
    .filter((m) => m.content.trim());

  let context = appContext(state, message);
  const build = () => [
    { role: "system" as const, content: `${SYSTEM_GUIDE}\n\nPLANNER DATA\n${context}` },
    ...hist,
    { role: "user" as const, content: userTurn || "Brief me from the planner." },
  ];
  let msgs = build();
  while (chars(msgs) > MAX_PROMPT_CHARS && hist.length > 2) {
    hist.shift();
    msgs = build();
  }
  while (chars(msgs) > MAX_PROMPT_CHARS && context.length > 2000) {
    context = context.slice(0, Math.floor(context.length * 0.85));
    msgs = build();
  }
  return msgs;
}

function chars(msgs: { content: string }[]) {
  return msgs.reduce((n, m) => n + m.content.length, 0);
}

function appContext(state: AppState, message: string) {
  const q = message.toLowerCase();
  const active = state.courses.filter((c) => !c.dropped);
  const now = new Date();
  const events = state.events.filter((e) => !e.canceled).sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = events.filter((e) => !isPastEvent(e));
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const today = upcoming.filter((e) => {
    const t = new Date(e.start).getTime();
    return t >= todayStart.getTime() && t < todayEnd.getTime();
  });

  const lines: string[] = [
    `Now: ${now.toLocaleString()}`,
    `Settings: Google=${state.settings.google.connectedEmail || "off"}; emailAlerts=${state.settings.notification.emailEnabled ? state.settings.notification.emailAddress || "on" : "off"}; dailyBrief=${state.settings.notification.digestDaily !== false ? `${state.settings.notification.digestDailyHour ?? 22}:${String(state.settings.notification.digestDailyMinute ?? 0).padStart(2, "0")}` : "off"}; sundayWeek11am=${state.settings.notification.digestWeekly !== false}; smtp=${state.settings.smtp.host || "unset"}`,
    `Counts: ${active.length} courses, ${upcoming.length} upcoming events, ${state.notes.length} notes, ${state.chats?.length || 0} chats`,
    `UI labels: ${listUiLabels(state.uiText)
      .slice(0, 36)
      .map((r) => `${r.key}=${r.current}`)
      .join("; ")}`,
  ];
  if (state.resume?.lines?.length) {
    lines.push("WHEN YOU LAST STOPPED (3+ hours ago):");
    for (const line of state.resume.lines.slice(0, 16)) lines.push(`  ${line}`);
  }

  lines.push("COURSES:");
  for (const c of active) {
    lines.push(
      `${c.code} | ${c.name} | ${c.term} ${c.year} | ${c.instructor || "—"} ${c.instructorEmail || ""} | ${c.meetingPattern || "—"} @ ${c.location || "—"} | ${upcoming.filter((e) => inferCourseId(e, state.courses) === c.id).length} upcoming`,
    );
    for (const p of c.policies) lines.push(`  policy ${p.title}: ${p.body.slice(0, 280)}`);
    if (c.extraContext) lines.push(`  extra: ${c.extraContext.slice(0, 400)}`);
    if (c.officeHours) lines.push(`  officeHours field: ${c.officeHours.slice(0, 400)}`);
  }

  lines.push("TODAY:");
  if (!today.length) lines.push("  (nothing today)");
  for (const e of today) lines.push(eventLine(state, e, 160));

  lines.push("UPCOMING (from now, all remaining):");
  const rest = upcoming.filter((e) => !today.includes(e));
  if (!rest.length && !today.length) lines.push("  (none)");
  for (const e of rest) lines.push(eventLine(state, e, 80));

  if (state.notes.length) {
    lines.push("NOTES:");
    for (const n of state.notes as CourseNote[]) {
      const code = active.find((c) => c.id === n.courseId)?.code || n.courseId;
      lines.push(`- ${n.kind} | ${code} | ${n.title} | summary: ${(n.summary || "").slice(0, 400)} | body: ${(n.body || "").slice(0, 200)} | transcript: ${(n.transcript || "").slice(0, 500)}${n.reminderAt ? ` | remind ${n.reminderAt}` : ""}`);
    }
  }

  const focus = active.filter((c) => q.includes(c.code.toLowerCase()) || (c.name && q.includes(c.name.toLowerCase())));
  for (const c of focus) {
    if (c.syllabusText) lines.push(`SYLLABUS ${c.code}:\n${c.syllabusText.slice(0, 3500)}`);
    const more = events.filter((e) => inferCourseId(e, state.courses) === c.id).slice(0, 80);
    if (more.length) {
      lines.push(`ALL EVENTS ${c.code}:`);
      for (const e of more) lines.push(eventLine(state, e, 200));
    }
  }

  return lines.join("\n");
}

function plannerFallback(state: AppState, message: string, applied: Course | null) {
  const q = message.toLowerCase();
  if (/\b(who are you|what are you|are you (gemini|deepseek|chatgpt|claude|grok|ollama)|which model)\b/i.test(message)) {
    const g = geminiApiKey(state.settings);
    if (g) return `I'm **${ASSISTANT_NAME}**, the assistant in **${APP_NAME}**, running on **Google Gemini**. I can read and edit your courses, calendar, notes, and the labels you see in the app.`;
    return `I'm **${ASSISTANT_NAME}**, the assistant in **${APP_NAME}**. Gemini is not set up on this account — paste a key in Settings.`;
  }
  attachEventsToCourses(state);
  const focus =
    state.courses.find(
      (c) => !c.dropped && (q.includes(c.code.toLowerCase()) || (c.name && q.includes(c.name.toLowerCase()))),
    ) || applied;
  const upcoming = state.events
    .filter((e) => !e.canceled && !isPastEvent(e) && (!focus || inferCourseId(e, state.courses) === focus.id))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 14);
  const policies = (focus?.policies || []).map((p) => `**${p.title}**\n${p.body}`).join("\n\n");
  const head = focus
    ? `${focus.code} · ${focus.name}\n${focus.instructor || ""} · ${focus.meetingPattern || ""} @ ${focus.location || ""}\n`
    : `You have ${state.courses.filter((c) => !c.dropped).length} courses.\n`;
  const due = upcoming.length
    ? upcoming.map((e) => eventLine(state, e, 120)).join("\n")
    : "Nothing upcoming in the planner for that filter.";
  return `${head}\nUpcoming:\n${due}${policies ? `\n\nKey policies:\n${policies}` : ""}`;
}

function eventLine(state: AppState, e: CourseEvent, detail = 80) {
  const code = state.courses.find((c) => c.id === inferCourseId(e, state.courses))?.code || "NON-COURSE";
  const extra = (e.details || "").slice(0, detail);
  return `- ${new Date(e.start).toLocaleString()}${e.end ? `–${new Date(e.end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""} | ${e.type} | ${code} | ${e.title}${extra ? ` | ${extra}` : ""}${e.location ? ` @ ${e.location}` : ""}`;
}

export function titleFromMessage(text: string) {
  return heuristicChatTitle(text);
}

function toTitleCase(phrase: string) {
  return phrase
    .split(/\s+/)
    .slice(0, 6)
    .map((w) => {
      if (/^(a|an|and|at|for|in|of|on|the|to|vs)$/i.test(w)) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase());
}

function heuristicChatTitle(text: string, files: string[] = []) {
  let t = (text || "").replace(/\s+/g, " ").trim();
  t = t.replace(
    /^(hi+|hey+|hello+|yo+|sup+|ok+|okay+|please|can you|could you|would you|i need you to|i need|help me|thanks)\b[\s,!.:]*/gi,
    "",
  );
  t = t.replace(/^(what('s| is)|how do i|how to|explain|tell me about|write|draft|fix|make|create)\b[\s:]*/i, "");
  if (!t && files[0]) t = files[0].replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
  t = t.split(/[?.!\n]/)[0]?.trim() || t;
  if (t.length < 3) return "New chat";
  return toTitleCase(t);
}

export async function titleChatThread(opts: {
  settings: AppSettings;
  message: string;
  reply: string;
  files?: string[];
}) {
  const fallback = heuristicChatTitle(opts.message, opts.files);
  if (!geminiApiKey(opts.settings)) return fallback;
  try {
    const { text } = await llmChat(
      [
        {
          role: "system",
          content:
            "Write a 2–6 word title for this student chat. Name the task or topic (for example “ECON 1115 pset 2 help”), not the greeting. No quotes, no trailing period, Title Case.",
        },
        {
          role: "user",
          content: `Student: ${opts.message.slice(0, 400)}\n\nAssistant: ${(opts.reply || "").slice(0, 400)}${opts.files?.length ? `\n\nFiles: ${opts.files.join(", ")}` : ""}`,
        },
      ],
      opts.settings,
    );
    const clean = (text || "")
      .replace(/[“”"']/g, "")
      .split("\n")[0]
      .replace(/\.$/, "")
      .trim()
      .slice(0, 56);
    return clean || fallback;
  } catch {
    return fallback;
  }
}

export function formatNoteKind(kind: CourseNote["kind"]) {
  return {
    note: "Note",
    reminder: "Reminder",
    question: "Office-hour question",
    office_hours: "Office hours",
    resource: "Resource",
  }[kind];
}
