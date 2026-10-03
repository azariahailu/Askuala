export type GraphPoint = { x: number; y: number };
export type GraphCurve = { id: string; label: string; points: GraphPoint[]; dash?: boolean; color?: string };
export type GraphMark = { at: GraphPoint; label: string };
export type StudyGraphSpec = {
  title: string;
  xLabel: string;
  yLabel: string;
  curves: GraphCurve[];
  eq: GraphMark[];
  read: string;
};

const GRAPH_LANG = /^(graph|econ-graph|econ|xygraph|figure|gnuplot)$/i;
const PALETTE = ["#8a5a00", "#1f6f6a", "#6b3fa0", "#9a3412", "#1d4ed8", "#166534"];

export function isStudyGraphLang(lang: string) {
  return GRAPH_LANG.test((lang || "").replace(/^language-/, ""));
}

export function parseStudyGraph(lang: string, raw: string): StudyGraphSpec | null {
  const text = (raw || "").trim();
  if (!text) return null;
  if (looksLikeGnuplot(lang, text)) {
    const gnu = parseGnuplotGraph(text);
    if (gnu) return gnu;
  }
  if (!isStudyGraphLang(lang) && !looksLikeGnuplot(lang, text)) return null;
  const fromJson = parseJsonGraph(text);
  if (fromJson) return fromJson;
  return parseLineGraph(text);
}

function parseJsonGraph(text: string): StudyGraphSpec | null {
  if (!/^[{\[]/.test(text)) return null;
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    const curvesIn = Array.isArray(data.curves) ? data.curves : [];
    const curves = curvesIn.map((c, i) => curveFromUnknown(c, i)).filter((c): c is GraphCurve => Boolean(c && c.points.length >= 2));
    const eqIn = Array.isArray(data.eq) ? data.eq : [];
    const eq = eqIn.map(markFromUnknown).filter((m): m is GraphMark => Boolean(m));
    if (!curves.length) return null;
    return {
      title: String(data.title || "Graph"),
      xLabel: String(data.x || data.xLabel || "Quantity"),
      yLabel: String(data.y || data.yLabel || "Price"),
      curves,
      eq,
      read: String(data.read || data.note || data.caption || ""),
    };
  } catch {
    return null;
  }
}

function curveFromUnknown(c: unknown, i: number): GraphCurve | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  const points = pointsFromUnknown(o.points) || pair(o.a, o.b) || pointsFromUnknown(o.from && o.to ? [o.from, o.to] : null);
  if (!points || points.length < 2) return null;
  const label = String(o.label || o.name || o.id || `C${i + 1}`);
  return { id: String(o.id || label), label, points, dash: Boolean(o.dash || /′|'|2$/.test(label)), color: typeof o.color === "string" ? o.color : undefined };
}

function markFromUnknown(c: unknown): GraphMark | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  const at = pointFromUnknown(o.at) || (o.q != null && o.p != null ? { x: Number(o.q), y: Number(o.p) } : null) || pointFromUnknown(o);
  if (!at) return null;
  return { at, label: String(o.label || o.name || "E") };
}

function pair(a: unknown, b: unknown) {
  const p = pointFromUnknown(a);
  const q = pointFromUnknown(b);
  return p && q ? [p, q] : null;
}

function pointsFromUnknown(v: unknown): GraphPoint[] | null {
  if (!v) return null;
  if (typeof v === "string") return parsePoints(v);
  if (!Array.isArray(v)) return null;
  const pts = v.map(pointFromUnknown).filter((p): p is GraphPoint => Boolean(p));
  return pts.length ? pts : null;
}

function pointFromUnknown(v: unknown): GraphPoint | null {
  if (!v) return null;
  if (typeof v === "string") return parsePoints(v)[0] || null;
  if (Array.isArray(v) && v.length >= 2) {
    const x = Number(v[0]);
    const y = Number(v[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const x = Number(o.x ?? o.q);
    const y = Number(o.y ?? o.p);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  return null;
}

function looksLikeGnuplot(lang: string, text: string) {
  if (/gnuplot/i.test((lang || "").replace(/^language-/, ""))) return true;
  return /^\s*lang\s*:\s*gnuplot/im.test(text) || /^\s*set\s+(terminal|title|xlabel|ylabel|xrange)\b/im.test(text) || /^\s*plot\s+/im.test(text);
}

function gnuplotQuoted(text: string, key: string) {
  const m = text.match(new RegExp(`set\\s+${key}\\s+["']([^"']+)["']`, "i"));
  return m?.[1]?.trim() || "";
}

function gnuplotRange(text: string, key: string): [number, number] | null {
  const m = text.match(new RegExp(`set\\s+${key}\\s*\\[\\s*([^\\]:]+)\\s*:\\s*([^\\]]+)\\]`, "i"));
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

function evalLinearExpr(expr: string, x: number) {
  const js = expr
    .replace(/\s+/g, "")
    .replace(/\bx\b/gi, `(${x})`);
  if (!/^[0-9.+*/()-]+$/.test(js)) return null;
  try {
    const v = Function(`"use strict"; return (${js});`)();
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function parseGnuplotGraph(text: string): StudyGraphSpec | null {
  const xrange = gnuplotRange(text, "xrange") || [0, 10];
  const title = gnuplotQuoted(text, "title") || "Graph";
  const xLabel = gnuplotQuoted(text, "xlabel") || "Quantity";
  const yLabel = gnuplotQuoted(text, "ylabel") || "Price";
  const fns = new Map<string, string>();
  for (const line of text.split(/\n/)) {
    const m = line.trim().match(/^([A-Za-z]\w*)\s*\(\s*[xX]\s*\)\s*=\s*(.+)$/);
    if (m) fns.set(m[1], m[2].trim());
  }
  const plot = text.replace(/\\\s*\n/g, " ").match(/plot\s+([\s\S]+)/i)?.[1] || "";
  const titles = new Map<string, string>();
  const plotRe = /([A-Za-z]\w*)\s*\(\s*[xX]\s*\)\s*(?:title\s+['"]([^'"]+)['"])?/gi;
  let pm: RegExpExecArray | null;
  while ((pm = plotRe.exec(plot))) titles.set(pm[1], pm[2] || pm[1]);
  const names = titles.size ? [...titles.keys()] : [...fns.keys()];
  const xs = [xrange[0], (xrange[0] + xrange[1]) / 2, xrange[1]];
  const curves: GraphCurve[] = [];
  for (const name of names) {
    const expr = fns.get(name);
    if (!expr) continue;
    const points = xs
      .map((x) => {
        const y = evalLinearExpr(expr, x);
        return y == null ? null : { x, y };
      })
      .filter((p): p is GraphPoint => Boolean(p));
    if (points.length < 2) continue;
    const label = titles.get(name) || name;
    curves.push({
      id: name,
      label,
      points: [points[0], points[points.length - 1]],
      dash: /′|'|shifted|tax/i.test(label),
    });
  }
  if (!curves.length) return null;
  return { title, xLabel, yLabel, curves, eq: [], read: "" };
}

function parseLineGraph(text: string): StudyGraphSpec | null {
  let title = "Graph";
  let xLabel = "Quantity";
  let yLabel = "Price";
  let read = "";
  const curves: GraphCurve[] = [];
  const eq: GraphMark[] = [];
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9′']*)\s*[:=]\s*(.+)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    const lk = key.toLowerCase();
    if (lk === "title") title = val;
    else if (lk === "x" || lk === "xlabel") xLabel = val;
    else if (lk === "y" || lk === "ylabel") yLabel = val;
    else if (lk === "read" || lk === "note" || lk === "caption") read = val;
    else if (lk === "eq" || lk === "e") {
      const pts = parsePoints(val);
      const label = val.replace(/[0-9.,\s-]+/g, " ").trim() || `E${eq.length ? "′" : ""}`;
      if (pts[0]) eq.push({ at: pts[0], label });
    } else if (lk === "curves") continue;
    else {
      const points = parsePoints(val);
      if (points.length >= 2) {
        curves.push({
          id: key,
          label: key.replace(/^demand$/i, "D").replace(/^supply$/i, "S"),
          points,
          dash: /′|'|2$/.test(key),
        });
      }
    }
  }
  if (!curves.length) return null;
  return { title, xLabel, yLabel, curves, eq, read };
}

function parsePoints(s: string): GraphPoint[] {
  const out: GraphPoint[] = [];
  const re = /(-?[\d.]+)\s*[, ]\s*(-?[\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

let graphSeq = 0;

export function studyGraphSvg(spec: StudyGraphSpec) {
  const mark = `garr${(graphSeq += 1)}`;
  const W = 640;
  const H = 400;
  const L = 62;
  const R = 28;
  const T = 36;
  const B = 52;
  const all = [...spec.curves.flatMap((c) => c.points), ...spec.eq.map((e) => e.at)];
  let minX = Math.min(...all.map((p) => p.x), 0);
  let maxX = Math.max(...all.map((p) => p.x), 1);
  let minY = Math.min(...all.map((p) => p.y), 0);
  let maxY = Math.max(...all.map((p) => p.y), 1);
  const padX = (maxX - minX) * 0.08 || 1;
  const padY = (maxY - minY) * 0.08 || 1;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;
  const sx = (x: number) => L + ((x - minX) / (maxX - minX)) * (W - L - R);
  const sy = (y: number) => H - B - ((y - minY) / (maxY - minY)) * (H - T - B);
  const axis = `#5c5346`;
  const grid = `#e8dfcc`;
  const lines: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const x = L + ((W - L - R) * i) / 4;
    const y = T + ((H - T - B) * i) / 4;
    lines.push(`<line x1="${x}" y1="${T}" x2="${x}" y2="${H - B}" stroke="${grid}" />`);
    lines.push(`<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}" stroke="${grid}" />`);
  }
  const curves = spec.curves.map((c, i) => {
    const color = c.color || PALETTE[i % PALETTE.length];
    const d = c.points.map((p, j) => `${j ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
    const last = c.points[c.points.length - 1];
    const dash = c.dash ? ` stroke-dasharray="7 5"` : "";
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.4"${dash} />
      <text x="${(sx(last.x) + 8).toFixed(1)}" y="${(sy(last.y) - 6).toFixed(1)}" fill="${color}" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif">${esc(c.label)}</text>`;
  });
  const marks = spec.eq.map((e) => {
    const x = sx(e.at.x);
    const y = sy(e.at.y);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#1c1914" />
      <text x="${(x + 8).toFixed(1)}" y="${(y + 14).toFixed(1)}" fill="#1c1914" font-size="12" font-family="ui-sans-serif, system-ui, sans-serif">${esc(e.label)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(spec.title)}">
    <rect width="${W}" height="${H}" fill="#fbf6ea" rx="10" />
    ${lines.join("\n")}
    <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="${axis}" stroke-width="1.6" marker-end="url(#${mark})" />
    <line x1="${L}" y1="${H - B}" x2="${L}" y2="${T}" stroke="${axis}" stroke-width="1.6" marker-end="url(#${mark})" />
    <defs><marker id="${mark}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${axis}" /></marker></defs>
    <text x="${W / 2}" y="22" text-anchor="middle" fill="#3d2a00" font-size="15" font-weight="600" font-family="ui-serif, Georgia, serif">${esc(spec.title)}</text>
    <text x="${W / 2}" y="${H - 14}" text-anchor="middle" fill="#5c5346" font-size="12" font-family="ui-sans-serif, system-ui, sans-serif">${esc(spec.xLabel)}</text>
    <text x="16" y="${H / 2}" text-anchor="middle" fill="#5c5346" font-size="12" font-family="ui-sans-serif, system-ui, sans-serif" transform="rotate(-90 16 ${H / 2})">${esc(spec.yLabel)}</text>
    ${curves.join("\n")}
    ${marks.join("\n")}
  </svg>`;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch);
}

export function studyGraphPlain(spec: StudyGraphSpec) {
  const curves = spec.curves.map((c) => `${c.label}: ${c.points.map((p) => `(${p.x}, ${p.y})`).join(" → ")}`).join("; ");
  const eq = spec.eq.map((e) => `${e.label} at (${e.at.x}, ${e.at.y})`).join("; ");
  return [spec.title, `${spec.yLabel} vs ${spec.xLabel}`, curves, eq, spec.read].filter(Boolean).join(" — ");
}
