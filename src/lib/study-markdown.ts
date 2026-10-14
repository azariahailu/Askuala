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

  s = fixMathDollars(s);

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

/**
 * Inline math like `$p = \$40$` breaks remark-math: the escaped dollar closes the span early.
 * Rewrite currency dollars inside math to \textdollar so KaTeX renders them. Skips code fences.
 */
function fixMathDollars(md: string) {
  let inFence = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      // KaTeX has no math-mode \textdollar; wrap any stray ones in \text{}.
      line = line.replace(/(?<!\\text\{)\\textdollar\b\s*/g, "\\text{\\textdollar}");
      if (!line.includes("\\$")) return line;
      return line.replace(/(?<![\\$])\$(?!\$)((?:\\\$|[^$\n])+?)\$(?!\$)/g, (full, inner: string) =>
        inner.includes("\\$") ? `$${inner.replace(/\\\$/g, "\\text{\\textdollar}")}$` : full,
      );
    })
    .join("\n");
}

/** Plain-text preview of a study guide for note cards (no markdown or LaTeX symbols). */
export function studyPreviewText(md: string) {
  return normalizeStudyMarkdown(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$([^$\n]+)\$/g, (_, m: string) =>
      m
        .replace(/\\(?:text|mathrm|textbf)\{([^}]*)\}/g, "$1")
        .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "$1/$2")
        .replace(/\\(cdot|times)/g, "×")
        .replace(/\\text\{\\textdollar\}|\\textdollar\s*/g, "$")
        .replace(/\\[a-zA-Z]+/g, "")
        .replace(/[_^{}]/g, ""),
    )
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*\|?[-:| ]+\|?\s*$/gm, "")
    .replace(/\|/g, " ")
    .replace(/\*\*|__|\*|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^-{3,}$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
