import { friendlyGeminiError, llmChat } from "./llm";
import type { AppSettings, Course } from "./types";

export function keepAndAddRequested(directions?: string) {
  const d = (directions || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!d) return false;
  if (/\b(rewrite|replace)\s+(everything|all|the whole|the entire|the guide)\b/.test(d)) return false;
  if (/\bonly add\b/.test(d) || /\badd only\b/.test(d)) return true;
  if (/\b(add|include|more)\b/.test(d) && /\bgraphs?\b/.test(d)) return true;
  if (/\bkeep\b/.test(d) && (/\badd\b/.test(d) || /\bappend\b/.test(d))) return true;
  if (/keep (everything|all|it all|the (current|existing|same)|this)/.test(d)) return true;
  if (/don'?t (rewrite|replace|change)( everything| it all| the (whole|entire|guide))?/.test(d)) return true;
  if (/without (changing|rewriting|replacing)/.test(d)) return true;
  return false;
}

function looksLikeFullGuide(text: string) {
  return /##\s*what to know/i.test(text) && /##\s*core ideas/i.test(text);
}

function headingsOf(md: string) {
  return (md.match(/^#{1,3} .+$/gm) || []).join("\n");
}

function isolateAddendum(addition: string, directions: string) {
  const add = addition
    .trim()
    .replace(/^```(?:markdown)?\s*\n([\s\S]*?)```$/i, "$1")
    .trim();
  if (!looksLikeFullGuide(add)) return add;
  const stop = new Set(["keep", "everything", "all", "this", "that", "with", "from", "only", "about", "just", "please", "guide", "study", "notes", "section", "parts", "change", "add", "adding"]);
  const keys = (directions || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !stop.has(w));
  if (!keys.length) return "";
  const lines = add.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^#{1,3} /.test(line)) continue;
    const h = line.toLowerCase();
    if (keys.some((k) => h.includes(k))) {
      start = i;
      break;
    }
  }
  if (start < 0) return "";
  const depth = (lines[start].match(/^#+/) || ["#"])[0].length;
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,3}) /);
    if (m && m[1].length <= depth) break;
    out.push(lines[i]);
  }
  return out.join("\n").trim();
}

function insertIntoHeading(md: string, heading: string, extra: string) {
  const re = new RegExp(`(^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n)([\\s\\S]*?)(?=\\n## )`, "m");
  if (!re.test(md)) return `${md.trim()}\n\n---\n\n${extra}`;
  return md.replace(re, (_, head: string, body: string) => `${head}${body.trimEnd()}\n\n${extra.trim()}\n\n`);
}

function mergeKeepAdd(existing: string, addition: string, directions: string) {
  let extra = isolateAddendum(addition, directions);
  if (/graph/i.test(directions)) {
    const fences = addition.match(/```graph[\s\S]*?```/g);
    if (fences?.length && (extra.length < 40 || looksLikeFullGuide(extra))) extra = fences.join("\n\n");
  }
  if (extra.length < 40) {
    throw new Error("Gemini tried to replace your study guide instead of adding. Your original was kept — rebuild again.");
  }
  if (/graph/i.test(directions) && /^## Graphs\b/m.test(existing)) {
    return insertIntoHeading(existing, "## Graphs", extra);
  }
  return `${existing.trim()}\n\n---\n\n${extra}`;
}

export async function generateStudySummary(opts: {
  transcript: string;
  title: string;
  body?: string;
  course?: Course | null;
  settings?: AppSettings;
  existing?: string;
  directions?: string;
  extraMaterials?: string;
}) {
  const course = opts.course;
  const existing = (opts.existing || "").trim();
  const directions = (opts.directions || "").trim();

  if (keepAndAddRequested(directions) && existing.length > 200) {
    const { text, error } = await llmChat(
      [
        {
          role: "system",
          content: `You add ONE topic onto an existing study guide. Output ONLY the new markdown section(s) for what the student asked to add.

Forbidden:
- Do not rewrite, shorten, or repeat the existing guide.
- Do not output ## What to know, ## Core ideas, ## How this fits the course, or a full study-guide skeleton.
- Do not summarize what is already there.

Required:
- Start with a heading for the new topic (e.g. ## Indifference curves).
- Teach it at lecture depth (definitions, intuition, graph if it needs one, a worked example).
- If they asked for graphs, output only new \`\`\`graph fences (and a short caption each). Do not rewrite Core ideas.
- Graph fences must use language graph as in other Askuala guides. Never gnuplot, matplotlib, mermaid, tikz, SVG, or Python.

Course: ${course?.code || ""} ${course?.name || ""}`,
        },
        {
          role: "user",
          content: [
            `Existing guide headings (already written — do not repeat):\n${headingsOf(existing) || "(none)"}`,
            directions && `Add only:\n${directions}`,
            opts.transcript && `Transcript (for the new topic only):\n${opts.transcript.slice(0, 8000)}`,
            opts.extraMaterials && `Files:\n${opts.extraMaterials.slice(0, 6000)}`,
          ]
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 20000),
        },
      ],
      opts.settings,
      false,
      true,
    );
    if (!text) throw new Error(friendlyGeminiError(error || "Gemini did not add to the study guide"));
    return mergeKeepAdd(existing, text, directions);
  }

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
    opts.extraMaterials && `Uploaded files (source material — teach from this, do not dump it):\n${opts.extraMaterials.slice(0, 16000)}`,
    existing && directions && `Current study guide draft (edit only what they asked):\n${existing.slice(0, 14000)}`,
    directions && `Student directions (follow these):\n${directions.slice(0, 6000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const src = `${materials}\n\n${spoken}`.trim();
  if (src.length < 40) return existing || "";
  const { text, error } = await llmChat(
    [
      {
        role: "system",
        content: `You are the course tutor for ${course?.code || "this class"} (${course?.name || "college course"}). Write a FULL lecture-quality STUDY GUIDE — the notes a strong student would keep, not a short recap.

Student directions:
- If they name extra points or topics and did not say to keep the current guide, include those in a full new guide.
- If they ask to change or rewrite specific parts, edit those parts only and keep the rest of the draft verbatim.
- Never replace a long draft with a short recap.
- Never refuse extra topics because they were not in the recording.

Length and depth:
- Typically 800–1800 words. Short bullet dumps are not acceptable.
- Teach mechanisms, not labels. For each idea: definition, intuition, what changes, what stays fixed, and a concrete example (numbers if the lecture had them).
- Connect claims: cause → graph/equation → prediction. Say what would falsify the claim.
- Use the syllabus to place the session (unit, what it prepares them for). No invented due dates. Do not paste the syllabus.

Transcript and files:
- Noisy recording or OCR. NEVER copy it, NEVER write a play-by-play, NEVER list spoken sentences.
- If garbled, still write a useful guide from syllabus + title + student notes + files.

Math: dollar-delimited LaTeX (inline and display). GitHub-flavored markdown tables.

Graphs and diagrams (economics, physics, calc, stats, chemistry — any course that uses them):
- If the session uses a graph, plot, or shift (supply/demand, cost, PPF, IS-LM, indifference, budget, tax wedge, surplus, MC/ATC, labor market, externalities, Lorenz, phase diagram, free-body, etc.), you MUST draw it. Do not only describe it in words.
- NEVER use gnuplot, matplotlib, mermaid, tikz, SVG, HTML, or Python. Askuala only draws fences whose language is exactly \`graph\` (not \`graph\` with \`lang: gnuplot\` inside).
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
      { role: "user", content: src.slice(0, 28000) },
    ],
    opts.settings,
    false,
    true,
  );
  if (text && existing.length > 400 && text.length < existing.length * 0.55 && directions) {
    throw new Error("Gemini tried to shrink your study guide. The original was kept — try more specific directions.");
  }
  if (text && !looksLikeEcho(text, opts.transcript) && text.length > 80) return text;
  throw new Error(friendlyGeminiError(error || "Gemini did not write a study guide"));
}

function looksLikeEcho(guide: string, transcript: string) {
  if (!transcript || transcript.length < 80) return false;
  const a = guide.toLowerCase().replace(/\s+/g, " ");
  const chunk = transcript.toLowerCase().replace(/\s+/g, " ").slice(40, 120);
  return chunk.length > 40 && a.includes(chunk);
}
