import { looksLikeChartMarkup, looksLikeGraphDsl } from "./study-graph";

export function normalizeStudyMarkdown(raw: string) {
  let s = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner: string) => `\n\n$$\n${inner.trim()}\n$$\n\n`);
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner: string) => `$${inner.trim()}$`);
  s = s.replace(/```(?:math|latex)\s*([\s\S]*?)```/gi, (_, inner: string) => `\n\n$$\n${inner.trim()}\n$$\n\n`);
  s = s.replace(
    /(?<!\$)(\\begin\{(?:align|cases|equation|gather|pmatrix|bmatrix|matrix|aligned)\*?\}[\s\S]*?\\end\{[^}]+\})(?!\$)/g,
    "\n\n$$\n$1\n$$\n\n",
  );

  // Promote mis-tagged Askuala graph DSL; strip CSS/HTML/SVG chart dumps so they never render as “code”.
  s = s.replace(/```([a-z0-9_+-]*)\s*\n([\s\S]*?)```/gi, (full, lang: string, inner: string) => {
    const body = inner.trim();
    const tag = (lang || "").toLowerCase();
    if (tag === "graph" || tag === "econ-graph" || tag === "xygraph" || tag === "figure") return full;
    if (looksLikeGraphDsl(body)) return `\n\n\`\`\`graph\n${body}\n\`\`\`\n\n`;
    if (/^(css|html|htm|svg|mermaid|xml)$/i.test(tag) && looksLikeChartMarkup(body)) {
      return "\n\n> *[Figure could not be drawn — Askuala only renders `graph` fences as SVG. Rebuild this guide.]*\n\n";
    }
    if (!tag && looksLikeChartMarkup(body)) {
      return "\n\n> *[Figure could not be drawn — Askuala only renders `graph` fences as SVG. Rebuild this guide.]*\n\n";
    }
    return full;
  });

  // Bare HTML/SVG chart blobs outside fences.
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, () => {
    return "\n\n> *[Figure omitted: use an Askuala `graph` fence so it draws as SVG.]*\n\n";
  });
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  return s;
}
