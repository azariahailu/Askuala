type Topic = { title: string; score: RegExp };

const TOPICS: Topic[] = [
  { title: "Grading", score: /\b(\d+\s*%|percent of|grade breakdown|your grade|weighted|quizzes|problem sets will be dropped)\b/i },
  { title: "Late work", score: /\b(late|extension|grace period|deadline|dean.?s extension|make-?up)\b/i },
  { title: "Exams & major assignments", score: /\b(midterm|final exam|\bexams?\b|paper \d|essays?\b|portfolios?)\b/i },
  { title: "Attendance & participation", score: /\b(attendance|absence|participation|miss class|required to attend)\b/i },
  { title: "AI & academic honesty", score: /\b(chatgpt|generative ai|\bAI\b|plagiarism|academic integrity|honor code|must not be copied)\b/i },
  { title: "Technology", score: /\b(laptop|phone|technology policy|no screens|recording|gradescope)\b/i },
];

function clean(s: string) {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\d.•\-o]+\s*/i, "")
    .trim();
}

function sentences(blob: string) {
  return blob
    .replace(/\u00a0/g, " ")
    .split(/\n+|•|(?<=[.!?])\s+(?=[A-Z“"])/)
    .map(clean)
    .filter((s) => s.length > 32 && s.length < 240)
    .filter((s) => !/jump to today|image\.png|^welcome to |toitū|if i say|economic effects of AI/i.test(s))
    .filter((s) => /[.!)%]$/.test(s) || /\d\s*%/.test(s) || /\b(dropped|participation|gradescope|laptop|required)\b/i.test(s))
    .filter((s) => !/\b(the|a|an|to|for|and|or|of|so|at|on)$/i.test(s));
}

function bestTopic(line: string): string | null {
  if (/\d+\s*%/.test(line)) return "Grading";
  let win: { title: string; n: number } | null = null;
  for (const t of TOPICS) {
    const n = t.score.test(line) ? 2 : 0;
    if (n && (!win || n > win.n)) win = { title: t.title, n };
  }
  if (
    /\b(must|required|conference|workshop|peer review|only paper and pen|you will receive printed)\b/i.test(line) &&
    (!win || win.n < 2)
  ) {
    return "What is distinctive here";
  }
  return win?.title || null;
}

export function extractKeyPolicies(blob: string): { title: string; body: string }[] {
  const buckets = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const line of sentences(blob)) {
    if (/parsed .+ calendar items|^https?:\/\//i.test(line)) continue;
    if (/^(engl|econ|cpsc|math|hist)\s+\d{3,5}\b/i.test(line) && line.length < 90) continue;
    const topic = bestTopic(line);
    if (!topic) continue;
    const key = line.toLowerCase().slice(0, 70);
    if (seen.has(key)) continue;
    seen.add(key);
    const list = buckets.get(topic) || [];
    if (list.length >= 6) continue;
    list.push(`• ${line}`);
    buckets.set(topic, list);
  }
  const order = [...TOPICS.map((t) => t.title), "What is distinctive here"];
  return order
    .filter((title) => (buckets.get(title) || []).length)
    .map((title) => ({ title, body: (buckets.get(title) || []).join("\n") }));
}
