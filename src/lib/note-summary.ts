import { friendlyGeminiError, llmChat } from "./llm";
import type { AppSettings, Course } from "./types";

export async function generateStudySummary(opts: {
  transcript: string;
  title: string;
  body?: string;
  course?: Course | null;
  settings?: AppSettings;
  existing?: string;
}) {
  const course = opts.course;
  const materials = [
    course?.name && `Course: ${course.code} ${course.name}`,
    course?.instructor && `Instructor: ${course.instructor}`,
    course?.meetingPattern && `Meets: ${course.meetingPattern}`,
    course?.policies?.length && `Policies:\n${course.policies.map((p) => `- ${p.title}: ${p.body}`).join("\n")}`,
    course?.extraContext && `Course extras / Canvas notes:\n${course.extraContext.slice(0, 4000)}`,
    course?.officeHours && `Office hours: ${course.officeHours}`,
    course?.syllabusText && `Syllabus:\n${course.syllabusText.slice(0, 14000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const spoken = [
    opts.title && `Session title: ${opts.title}`,
    opts.body && `Student notes:\n${opts.body}`,
    opts.transcript && `Raw transcript (source only, do not echo):\n${opts.transcript.slice(0, 12000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const src = `${materials}\n\n${spoken}`.trim();
  if (src.length < 40) return opts.existing || "";
  const { text, error } = await llmChat(
    [
      {
        role: "system",
        content: `You are the course tutor for ${course?.code || "this class"} (${course?.name || "college course"}). Write a FULL lecture-quality STUDY GUIDE — the notes a strong student would keep, not a short recap.

Length and depth:
- Typically 800–1800 words. Short bullet dumps are not acceptable.
- Teach mechanisms, not labels. For each idea: definition, intuition, what changes, what stays fixed, and a concrete example (numbers if the lecture had them).
- Connect claims: cause → graph/equation → prediction. Say what would falsify the claim.
- Use the syllabus to place the session (unit, what it prepares them for). No invented due dates. Do not paste the syllabus.

Transcript:
- Noisy recording. NEVER copy it, NEVER write a play-by-play, NEVER list spoken sentences.
- If garbled, still write a useful guide from syllabus + title + student notes.

Math: dollar-delimited LaTeX (inline and display). GitHub-flavored markdown tables.

Graphs and diagrams (economics, physics, calc, stats, chemistry — any course that uses them):
- If the session uses a graph, plot, or shift (supply/demand, cost, PPF, IS-LM, indifference, budget, tax wedge, surplus, MC/ATC, labor market, externalities, Lorenz, phase diagram, free-body, etc.), you MUST draw it. Do not only describe it in words.
- Use one fenced block per figure, language exactly \`graph\`, in this line format:

\`\`\`graph
title: Market for coffee
x: Quantity Q
y: Price P
D: 0,20 20,0
S: 0,2 20,18
D': 4,22 24,2
eq: 10,10 E
eq: 13,11 E'
read: Demand shifts right; equilibrium moves from E to E′. P and Q both rise.
\`\`\`

Rules for graphs:
- Axes labeled with the real variables (P and Q, wage and L, MU and Q, etc.).
- Original curves solid (D, S, MC). Shifted curves dashed with a prime (D′, S′).
- Mark equilibria (E, E′) and any tax/wedge points.
- Two points make a straight line; add more points for curves (U-shaped cost, bowed PPF).
- After each figure, write 4–8 sentences: what each axis means, slope intuition, the shock, comparative statics (what happens to P and Q or the analogous pair), and surplus/welfare or constraint if it was in the lecture.
- If this session truly has no figure, omit the Graphs heading. Do not invent a decorative graph.

Use these headings:
## What to know
## Core ideas
## Graphs
## Key terms
## Worked examples
## How this fits the course
## How to study this (questions to quiz yourself)`,
      },
      { role: "user", content: src.slice(0, 24000) },
    ],
    opts.settings,
    false,
    true,
  );
  if (text && !looksLikeEcho(text, opts.transcript) && text.length > 80) return text;
  throw new Error(friendlyGeminiError(error || "Gemini did not write a study guide"));
}

function looksLikeEcho(guide: string, transcript: string) {
  if (!transcript || transcript.length < 80) return false;
  const a = guide.toLowerCase().replace(/\s+/g, " ");
  const chunk = transcript.toLowerCase().replace(/\s+/g, " ").slice(40, 120);
  return chunk.length > 40 && a.includes(chunk);
}
