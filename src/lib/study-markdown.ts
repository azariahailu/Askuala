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

  s = unwrapWholeFence(s);
  s = fixMathDollars(s);
  s = polishProse(s);

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


/** Gemini sometimes wraps the whole guide in ```markdown … ```, which renders it as one big code block. */
function unwrapWholeFence(s: string) {
  const m = s.match(/^```(?:markdown|md|mdx|text)?\s*\n([\s\S]*?)\n```\s*$/i);
  return m ? m[1] : s.replace(/```(?:markdown|md|mdx)\s*\n([\s\S]*?)\n```/gi, "$1");
}

const SUP: Record<string, string> = { "⁰":"0","¹":"1","²":"2","³":"3","⁴":"4","⁵":"5","⁶":"6","⁷":"7","⁸":"8","⁹":"9","⁺":"+","⁻":"-","ⁿ":"n","ˣ":"x","ʸ":"y" };
const SUB: Record<string, string> = { "₀":"0","₁":"1","₂":"2","₃":"3","₄":"4","₅":"5","₆":"6","₇":"7","₈":"8","₉":"9","₊":"+","₋":"-","ₓ":"x","ᵢ":"i","ⱼ":"j","ₙ":"n","ₜ":"t" };
const SUP_RE = new RegExp(`[${Object.keys(SUP).join("")}]+`, "g");
const SUB_RE = new RegExp(`[${Object.keys(SUB).join("")}]+`, "g");

/**
 * Repairs prose outside code and math so it always renders: headings, bullets, tables, bold spacing,
 * bare or Unicode sub/superscripts, currency that would be mistaken for math, and double-escaped LaTeX.
 */
function polishProse(md: string) {
  const lines = md.split("\n");
  let inFence = false;
  let inDisplay = false;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; out.push(line); continue; }
    if (inFence) { out.push(line); continue; }
    if (/^\s*\$\$\s*$/.test(line)) { inDisplay = !inDisplay; out.push(line); continue; }
    if (inDisplay) { out.push(line.replace(/\\\\(?=[a-zA-Z])/g, "\\")); continue; }

    line = line.replace(/^(#{1,6})(?=[^#\s])/, "$1 ");            // ##Title -> ## Title
    line = line.replace(/^(\s*)[•▪●◦‣–]\s+/, "$1- ");              // odd bullets -> markdown list
    line = line.replace(/^\s*\*\*\s*\*\*\s*$/, "");                // empty bold line

    // A table needs a blank line above it.
    if (/^\s*\|.*\|\s*$/.test(line) && out.length && out[out.length - 1].trim() && !/^\s*\|/.test(out[out.length - 1])) out.push("");

    // Mask code spans and math so prose fixes don't touch them.
    const keep: string[] = [];
    const mask = (t: string) => `\u0000${keep.push(t) - 1}\u0000`;
    line = line.replace(/`[^`]*`/g, mask);
    line = escapeCurrency(line);
    line = line.replace(/\$\$[^$]+\$\$|(?<!\\)\$(?:\\\$|[^$])+?\$/g, (m) => mask(m.replace(/\\\\(?=[a-zA-Z])/g, "\\")));

    // Unicode sub/superscripts -> math.
    line = line.replace(new RegExp(`([A-Za-z0-9)\\]])((?:${SUP_RE.source}|${SUB_RE.source})+)`, "g"), (_m, base: string, tail: string) => {
      const t = tail.replace(SUP_RE, (x) => `^{${[...x].map((c) => SUP[c]).join("")}}`).replace(SUB_RE, (x) => `_{${[...x].map((c) => SUB[c]).join("")}}`);
      return mask(`$${base}${t}$`);
    });
    // Bare x^2, P^*, MP_L, X_1, Q^{d} in prose -> math. Short subscripts only, so snake_case code names are left alone.
    line = line.replace(/(?<![\w\\/.:-])([A-Za-z]{1,4}'?)((?:_\{[^}\s]{1,8}\}|_[A-Za-z0-9]{1,3}|\^\{[^}\s]{1,8}\}|\^[A-Za-z0-9*]{1,3}|\^\*)+)(?![\w(])/g,
      (_m, base: string, tail: string) => mask(`$${base}${tail}$`));
    // Raw LaTeX commands left in prose (\alpha, \frac{a}{b}, \le 5) -> math.
    line = line.replace(/(?<![\w$])\\(?:alpha|beta|gamma|delta|Delta|sigma|mu|lambda|theta|pi|epsilon|rho|leq?|geq?|neq|approx|times|cdot|infty|sum|partial|sqrt\{[^}]*\}|frac\{[^}]*\}\{[^}]*\}|hat\{[^}]*\}|bar\{[^}]*\})(?![a-zA-Z])/g, (m) => mask(`$${m}$`));

    line = line.replace(/\u0000(\d+)\u0000/g, (_m, k: string) => keep[Number(k)]);
    line = line.replace(/\u0000(\d+)\u0000/g, (_m, k: string) => keep[Number(k)]);
    out.push(line);
  }
  return out.join("\n");
}

/** "$40 and $50" would render as math. Escape a $ that starts a dollar amount when the span to the next $ reads like prose. */
function escapeCurrency(line: string) {
  return line.replace(/(?<![\\$\w])\$(?=\d)/g, (m, at: number) => {
    const rest = line.slice(at + 1);
    const close = rest.search(/(?<!\\)\$/);
    if (close < 0) return "\\$";
    const span = rest.slice(0, close);
    const looksMath = /[\\^_=<>{}]/.test(span) || !/\s[A-Za-z]{2,}\s/.test(` ${span} `);
    return looksMath && !/^[\d,.]+\s+(?:to|and|or|per|for|from|vs\.?|each|a|an|the)\b/i.test(span) ? m : "\\$";
  });
}
