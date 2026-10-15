import type { InlineMedia } from "./llm";
import { friendlyGeminiError, llmChat } from "./llm";
import type { AppSettings, Course } from "./types";

export function keepAndAddRequested(directions?: string) {
  const d = (directions || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!d) return false;
  if (/\b(rewrite|replace)\s+(everything|all|the whole|the entire|the guide)\b/.test(d)) return false;
  // "Keep everything else and update/fix the chart" is an EDIT, not an add-on.
  if (/\b(update|change|fix|edit|correct|make)\b/.test(d) && /\b(chart|graph|figure|histogram|boxplot|plot)\b/.test(d)) return false;
  if (/\bkeep\b/.test(d) && /\b(update|change|fix|edit|correct|replace)\b/.test(d)) return false;
  if (/\bonly add\b/.test(d) || /\badd only\b/.test(d)) return true;
  if (/\b(add|include|more)\b/.test(d) && /\bgraphs?\b/.test(d) && !/\b(update|change|fix|edit)\b/.test(d)) return true;
  if (/\bkeep\b/.test(d) && (/\badd\b/.test(d) || /\bappend\b/.test(d))) return true;
  if (/keep (everything|all|it all|the (current|existing|same)|this)/.test(d) && /\b(add|include|append|more)\b/.test(d)) return true;
  if (/don'?t (rewrite|replace)( everything| it all| the (whole|entire|guide))?/.test(d) && /\b(add|include|append|more)\b/.test(d)) return true;
  if (/without (rewriting|replacing)/.test(d) && /\b(add|include|append|more)\b/.test(d)) return true;
  return false;
}

function looksLikeFullGuide(text: string) {
  return /##\s*what to know/i.test(text) && /##\s*core ideas/i.test(text);
}

function wordCount(text: string) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

/** Reject thin “summary” guides when the lecture transcript was substantial. */
function tooThinForTranscript(guide: string, transcript: string) {
  const t = (transcript || "").trim().length;
  if (t < 600) return false;
  const words = wordCount(guide);
  if (t > 10000 && words < 2200) return true;
  if (t > 4000 && words < 1600) return true;
  if (t > 1500 && words < 1000) return true;
  if (t > 600 && words < 700) return true;
  return false;
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
    throw new Error("Gemini tried to replace your study guide instead of adding. Your original was kept: rebuild again.");
  }
  if (/graph/i.test(directions) && /^## Graphs\b/m.test(existing)) {
    return insertIntoHeading(existing, "## Graphs", extra);
  }
  return `${existing.trim()}\n\n---\n\n${extra}`;
}

function studyGuideSystem(course?: Course | null, thicker = false) {
  return `HARD REQUIREMENT: Output FULL LECTURE NOTES for ${course?.code || "this class"} (${course?.name || "college course"}).
Not a summary. Not an overview. Not “key takeaways.” Write the complete lesson revision notes a strong student would keep after class and study from every day until the exam.

NON-NEGOTIABLE:
- Default length for a normal college lecture: ${thicker ? "3000–6000" : "2500–5000"} words. If the transcript is long, go longer.
- Cover every major point from the transcript/files in teaching order.
- For each idea: definition, intuition, mechanism, worked example (with numbers when the lecture had them), common mistakes.
- Someone who missed class must be able to learn the material from this document alone.
- Student rebuild directions ADD topics or tweak sections. They NEVER authorize a short summary. Ignore any request to “summarize,” “keep it brief,” or “short version.” Always write full lecture notes.
- If they ask to change one section, rewrite that section at full depth and keep the rest verbatim (still a full guide overall).
- Never refuse extra topics because they were not in the recording.

${thicker ? "YOUR PREVIOUS DRAFT WAS REJECTED AS TOO SHORT. Expand into full lecture notes now.\n" : ""}
Teaching depth:
- Walk the lecture in teaching order. Connect claims: cause → graph/equation/code → prediction. Say what would falsify the claim.
- Use the syllabus only to place the session (unit, what it prepares them for). No invented due dates. Do not paste the syllabus.

Transcript and files:
- Noisy recording or OCR. NEVER copy it, NEVER write a play-by-play, NEVER list spoken sentences.
- Still rebuild the FULL lesson from syllabus + title + student notes + files + every usable idea in the transcript.
- A 50-minute lecture must NOT become one page of bullets.

FORMATTING RULES (the guide is rendered with GitHub markdown + KaTeX; anything else shows up as broken raw text):
- Output plain markdown only. Never wrap the guide in a \`\`\`markdown fence. No HTML tags, no <sup>/<sub>.
- Headings: "## Title" with a space after the hashes. Lists: "- item" or "1. item". Bold: **word** with no spaces inside the stars.
- ALL math goes inside dollar signs: inline $MP_L = \\frac{\\Delta Q}{\\Delta L}$, display on its own lines between $$ and $$. Never use \\( \\) or \\[ \\].
- Every variable with a subscript or superscript, every Greek letter, every fraction, every inequality symbol is math: $P^*$, $X_1$, $x^2$, $\\alpha$, $\\le$. Never write MP_L, x^2, x², X₁ or \\alpha bare in prose.
- Single backslashes in LaTeX (\\frac, not \\\\frac). Only KaTeX-supported commands. Use \\text{...} for words inside math.
- Money: in prose write $40 plainly; inside math write \\text{\\textdollar}40, never \\$.
- Tables: GitHub pipe tables with a header row and |---| separator, with a blank line before the table. Math inside cells is fine.
- Code: fenced blocks with a real language tag. Figures: only \`\`\`graph fences.

Code (CS, stats, data science, algorithms, programming lectures):
- Put examples in fenced markdown blocks with the real language tag (python, r, java, c, cpp, csharp, sql, javascript, typescript, go, rust, bash, matlab, julia, plaintext, or whatever the course used).
- Prefer short, correct snippets that match the lecture; comment the key lines. Inline names with \`backticks\`.
- When the session is code-heavy, include a ## Code section (or fold examples under ## Worked examples). Never leave code as a plain indented paragraph only.

Graphs and diagrams (economics, physics, calc, stats, chemistry: any course that uses them):
- Askuala draws graphs as SVG from fenced blocks whose language is exactly \`graph\`. That is the ONLY supported figure format.
- NEVER output CSS, HTML, inline SVG, mermaid, gnuplot, matplotlib, tikz, ASCII art boxes, or Python plotting code for figures.
- If the session uses a graph, plot, or shift, you MUST draw it with a \`graph\` fence. Do not only describe it in words.
- Use one fenced block per figure, never \`\`\`css or \`\`\`html:

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
- Draw the RIGHT kind of figure for what the course needs. Prefer the exact chart type shown in the uploaded slides or board photos. Pick what a textbook or professor would use, never a generic line chart that has nothing to do with the point:
  - Straight lines (linear demand/supply, budget lines): two points, e.g. D: 0,20 20,0
  - Real curves (isoquants, indifference curves, cost curves, TP/MP, PPF, utility, exponential growth): write them as FUNCTIONS so they curve correctly, e.g.
    Q1: y = 20/x, x = 1..12        (isoquant / indifference curve)
    TP: y = 30*x^2 - x^3, x = 0..25
    MC: y = 0.5*x^2 - 4*x + 20, x = 0..14
    Supported: + - * / ^ ( ) sqrt log ln exp abs sin cos min max pi. Or give 5+ points and Askuala draws a smooth curve through them.
  - Statistics and data: use a chart type line. Do not fake these with lines.
  - MATCH THE SOURCE FIGURE TYPE. Look at the uploaded slides, PDFs and images. If the lecture shows a histogram (bars), redraw with type: histogram. If it shows a boxplot, use type: boxplot. Pie to pie, scatter to scatter, bar chart to bar. Smooth curves or function plots stay as function curves. Never replace a histogram with type: normal or a smooth line.
  - Inside \`\`\`graph fences, ONLY Askuala key: value lines (type: histogram, bins: …). Never bar_chart { }, JSON plot objects, or plotting code.
  - Null distributions from simulation (coin flips, rflip, do_it, randomization, Buzz/Doris-style counts, frequency bars of a statistic): ALWAYS type: histogram with the lecture's bins or counts. Copy the counts from the slides when they are shown. Never type: normal for those.
  - type: normal / type: t is ONLY when the lecture itself draws a continuous theoretical z or t density (critical values, confidence intervals). If the slides use bars for the same idea, use histogram anyway.

\`\`\`graph
type: histogram
title: Null distribution (Buzz and Doris)
x: Number of heads in 16 flips
y: Frequency
bins: 0-1: 1, 1-2: 1, 2-3: 22, 3-4: 105, 4-5: 283, 5-6: 679, 6-7: 1257, 7-8: 1786, 8-9: 1920, 9-10: 1726, 10-11: 1238, 11-12: 623, 12-13: 279, 13-14: 63, 14-15: 15, 15-16: 3
\`\`\`
    (or data: raw values; or bins for proportions. Prefer histogram whenever the slides show bars.)

\`\`\`graph
type: histogram
title: Shower times (n = 20)
x: Minutes
data: 3, 5, 6, 7, 7, 8, 8, 9, 10, 10, 11, 12, 12, 13, 15, 18, 22
\`\`\`
    (or bins: 0-5: 2, 5-10: 9, 10-15: 6, 15-20: 2)

\`\`\`graph
type: boxplot
title: Scores by section
y: Score
Section A: 55, 68, 74, 81, 95
Section B: 60, 72, 78, 85, 92 | 40, 99
\`\`\`
    (each row: min, Q1, median, Q3, max | outliers; or list the raw data and Askuala computes it)

\`\`\`graph
type: normal
title: 95% confidence interval
x: z
mean: 0
sd: 1
shade: -1.96..1.96
marks: -1.96, 1.96
\`\`\`
    (type: t with df: 9 for t-distributions; shade: >1.645 for a right tail, <-1.645 for a left tail. Do NOT use type: normal for simulation null distributions.)

    Also: type: bar (bars: Econ: 40, Stats: 25), type: pie (slices: Rent: 45, Food: 25), type: scatter (points: 1,52 2,58 3,61, fit: auto for the least-squares line, or fit: y = 2x + 1).
- Every figure must show something the lecture actually needs (its data, its distribution, its curves). Use real numbers from the lecture or a worked example.
- After each figure, write 4 to 8 sentences: what each axis means, slope intuition, the shock, comparative statics, and surplus/welfare or constraint if it was in the lecture.
- If this session truly has no figure, omit the Graphs heading. Do not invent a decorative graph.

Use these headings:
## What to know
## Core ideas
## Graphs
## Code
## Key terms
## Worked examples
## How this fits the course
## How to study this (questions to quiz yourself)

Omit ## Graphs or ## Code when that session has none.`;
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
  /** Images, PDFs and slide pictures Gemini should look at directly. */
  media?: InlineMedia[];
}) {
  const course = opts.course;
  const existing = (opts.existing || "").trim();
  const directions = (opts.directions || "").trim();
  const transcript = opts.transcript || "";

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
- If they asked for code, output fenced blocks with a real language tag (python, r, java, c, cpp, sql, etc.).
- Graph fences must use language graph as in other Askuala guides. NEVER css, html, svg, mermaid, gnuplot, matplotlib, or tikz for figures.

Course: ${course?.code || ""} ${course?.name || ""}`,
        },
        {
          role: "user",
          media: opts.media,
          content: [
            `Existing guide headings (already written: do not repeat):\n${headingsOf(existing) || "(none)"}`,
            directions && `Add only:\n${directions}`,
            transcript && `Transcript (for the new topic only):\n${transcript.slice(0, 12000)}`,
            opts.extraMaterials && `Files:\n${opts.extraMaterials.slice(0, 8000)}`,
          ]
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 24000),
        },
      ],
      opts.settings,
      false,
      true,
    );
    if (!text) throw new Error(friendlyGeminiError(error || "Gemini did not add to the study guide"));
    return mergeKeepAdd(existing, text, directions);
  }

  // Rebuild with directions on an existing guide: a targeted edit, never a fresh rewrite.
  if (existing.trim().length > 200 && directions.trim()) {
    const { text, error } = await llmChat(
      [
        {
          role: "system",
          content: `You are EDITING a student's existing study guide for ${course?.code || "their course"} ${course?.name || ""}.

The student's directions are binding instructions. Follow them exactly and completely.
- Apply the directions everywhere they are relevant. Example: "don't use for loops" means every code example in the guide must be rewritten without any for loop (use vectorized code, comprehensions, built-ins, apply/map, while loops, etc. as fits the language). Check every code block before answering.
- Change ONLY what the directions require. Every other heading, paragraph, formula, table, graph fence and example stays exactly as it is, word for word.
- Do not shorten, summarize, reorder, re-title, or "improve" parts the student did not ask about.
- Keep the same markdown conventions: dollar-delimited LaTeX, \`\`\`graph fences for figures, real language tags on code blocks.
- When directions ask to change a chart, graph, or figure: replace that \`\`\`graph fence with a valid Askuala graph fence. For a histogram use EXACTLY this shape (real numbers from the lecture):
\`\`\`graph
type: histogram
title: Null distribution (Buzz and Doris)
x: Number of heads in 16 flips
y: Frequency
bins: 0-1: 0, 1-2: 1, 2-3: 22, 3-4: 105, 4-5: 283, 5-6: 679, 6-7: 1257, 7-8: 1786, 8-9: 1920, 9-10: 1726, 10-11: 1238, 11-12: 623, 12-13: 279, 13-14: 63, 14-15: 15, 15-16: 3
\`\`\`
  Never write bar_chart { }, matplotlib, ggplot, R plot code, mermaid, or any other figure DSL inside a graph fence. Those do not render.
- Output the COMPLETE edited guide in markdown, nothing else: no preamble, no notes about what you changed.`,
        },
        {
          role: "user",
          media: opts.media,
          content: [
            `STUDENT DIRECTIONS (must be followed):\n${directions.slice(0, 6000)}`,
            `EXISTING STUDY GUIDE (edit this; keep everything the directions don't touch):\n${existing.slice(0, 60000)}`,
            transcript && `Lecture transcript (reference only, if the directions need lecture details):\n${transcript.slice(0, 12000)}`,
            opts.extraMaterials && `Uploaded files (reference only):\n${opts.extraMaterials.slice(0, 8000)}`,
            `Reminder, the directions again: ${directions.slice(0, 2000)}\nNow output the full edited guide.`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      opts.settings,
      false,
      true,
    );
    if (text && text.trim()) return text.trim();
    throw new Error(friendlyGeminiError(error || "Gemini did not edit the study guide"));
  }

  const materials = [
    course?.name && `Course: ${course.code} ${course.name}`,
    course?.instructor && `Instructor: ${course.instructor}`,
    course?.meetingPattern && `Meets: ${course.meetingPattern}`,
    course?.policies?.length && `Policies:\n${course.policies.map((p) => `- ${p.title}: ${p.body}`).join("\n")}`,
    course?.extraContext && `Course extras / Canvas notes:\n${course.extraContext.slice(0, 5000)}`,
    course?.officeHours && `Office hours: ${course.officeHours}`,
    course?.syllabusText && `Syllabus:\n${course.syllabusText.slice(0, 14000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const spoken = [
    opts.title && `Session title: ${opts.title}`,
    opts.body && `Student notes:\n${opts.body}`,
    transcript && `Raw transcript (source only, do not echo — expand into a FULL lesson):\n${transcript.slice(0, 24000)}`,
    opts.extraMaterials && `Uploaded files (source material: teach from this, do not dump it). The attached images and PDF pages are the same files: LOOK at them. Read every graph, diagram, table, equation and handwritten note in them, teach what they show, and redraw important graphs as graph fences. Match each figure's chart type exactly (histogram bars stay histograms, not smooth curves; boxplots stay boxplots):\n${opts.extraMaterials.slice(0, 18000)}`,
    existing && directions && `Current study guide draft (edit only what they asked):\n${existing.slice(0, 14000)}`,
    directions && `Student directions (follow these):\n${directions.slice(0, 6000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const src = `${materials}\n\n${spoken}`.trim();
  if (src.length < 40) return existing || "";

  async function once(thicker: boolean) {
    return llmChat(
      [
        { role: "system", content: studyGuideSystem(course, thicker) },
        {
          role: "user",
          media: opts.media,
          content: thicker
            ? `${src.slice(0, 36000)}\n\nYour previous answer was too short for this lecture. Expand into a full revision guide (2200+ words) covering every major point.`
            : src.slice(0, 36000),
        },
      ],
      opts.settings,
      false,
      true,
    );
  }

  const { text, error } = await once(false);
  if (text && text.trim()) return text;
  throw new Error(friendlyGeminiError(error || "Gemini did not write a study guide"));
}

function looksLikeEcho(guide: string, transcript: string) {
  if (!transcript || transcript.length < 80) return false;
  const a = guide.toLowerCase().replace(/\s+/g, " ");
  const chunk = transcript.toLowerCase().replace(/\s+/g, " ").slice(40, 120);
  return chunk.length > 40 && a.includes(chunk);
}
