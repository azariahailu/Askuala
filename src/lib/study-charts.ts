/**
 * Real chart types for study guides: smooth curves, function plots, histograms, bar charts,
 * box plots, pie charts, scatter plots (with fit lines) and normal / t density curves with shading.
 * All output is plain SVG so it works in the app, PDFs and phone view.
 */
export type Pt = { x: number; y: number };

const PALETTE = ["#8a5a00", "#1f6f6a", "#6b3fa0", "#9a3412", "#1d4ed8", "#166534", "#be185d", "#0f766e"];
const FONT = "ui-sans-serif, system-ui, sans-serif";
const W = 640, H = 400, L = 64, R = 28, T = 40, B = 54;

export type ChartSpec =
  | { kind: "histogram"; title: string; xLabel: string; yLabel: string; bins: { a: number; b: number; n: number }[]; read: string }
  | { kind: "bar"; title: string; xLabel: string; yLabel: string; bars: { label: string; v: number }[]; read: string }
  | { kind: "pie"; title: string; slices: { label: string; v: number }[]; read: string }
  | { kind: "box"; title: string; xLabel: string; yLabel: string; boxes: { label: string; min: number; q1: number; med: number; q3: number; max: number; out: number[] }[]; read: string }
  | { kind: "scatter"; title: string; xLabel: string; yLabel: string; points: Pt[]; fit: string | null; read: string }
  | { kind: "density"; title: string; xLabel: string; yLabel: string; dist: "normal" | "t"; mean: number; sd: number; df: number; shade: [number, number][]; marks: number[]; read: string };

// ---------- safe math expressions: y = 100/x, 10*sqrt(x), x^0.5*4, exp(-x) ----------
const FN = /^(sqrt|log|ln|exp|abs|sin|cos|tan|min|max|pow)$/;
export function compileExpr(src: string): ((x: number) => number) | null {
  let e = src.replace(/^\s*y\s*=\s*/i, "").replace(/\s+/g, "").replace(/\*\*/g, "^");
  if (!e) return null;
  const tokens = e.match(/[a-zA-Z_]+|\d*\.?\d+(?:e-?\d+)?|[-+*/^(),]/g);
  if (!tokens || tokens.join("") !== e) return null;
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^[a-zA-Z_]+$/.test(t)) {
      if (t === "x" || t === "X" || t === "q" || t === "Q" || t === "L") out.push("x");
      else if (t === "pi") out.push("Math.PI");
      else if (t === "e" && tokens[i + 1] !== "(") out.push("Math.E");
      else if (FN.test(t)) out.push(t === "ln" ? "Math.log" : t === "log" ? "Math.log10" : `Math.${t}`);
      else return null;
    } else out.push(t === "^" ? "**" : t);
  }
  // implicit multiplication: 2x, 2(…), )(, )x
  const js = out.join(" ").replace(/(\d|\))\s+(x|Math|\()/g, "$1*$2");
  try {
    const f = new Function("x", `"use strict"; return (${js});`) as (x: number) => number;
    f(1);
    return f;
  } catch {
    return null;
  }
}

export function sampleFn(expr: string, a: number, b: number, n = 80): Pt[] {
  const f = compileExpr(expr);
  if (!f) return [];
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    const y = f(x);
    if (Number.isFinite(y)) pts.push({ x, y });
  }
  return pts;
}

/** Monotone cubic (Fritsch–Carlson) path: real curves through the points, no overshoot or wiggles. */
export function smoothPath(px: Pt[]): string {
  if (px.length < 3) return px.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const xs = px.map((p) => p.x);
  const inc = xs.every((x, i) => !i || x > xs[i - 1]);
  const dec = xs.every((x, i) => !i || x < xs[i - 1]);
  if (!inc && !dec) return catmull(px);
  const n = px.length;
  const d: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((px[i + 1].y - px[i].y) / (px[i + 1].x - px[i].x));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let path = `M${px[0].x.toFixed(1)},${px[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = px[i + 1].x - px[i].x;
    path += ` C${(px[i].x + h / 3).toFixed(1)},${(px[i].y + (m[i] * h) / 3).toFixed(1)} ${(px[i + 1].x - h / 3).toFixed(1)},${(px[i + 1].y - (m[i + 1] * h) / 3).toFixed(1)} ${px[i + 1].x.toFixed(1)},${px[i + 1].y.toFixed(1)}`;
  }
  return path;
}

function catmull(p: Pt[]) {
  let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

// ---------- parsing ----------
const nums = (s: string) => (s.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number).filter(Number.isFinite);
const pairs = (s: string) =>
  s.split(/[,;](?![^:]*$)|;|,(?=\s*[^,:]+:)/).map((x) => x.trim()).filter(Boolean)
    .map((x) => { const m = x.match(/^(.+?)\s*[:=]\s*(-?[\d.]+)\s*%?$/); return m ? { label: m[1].trim(), v: Number(m[2]) } : null; })
    .filter((x): x is { label: string; v: number } => Boolean(x && Number.isFinite(x.v)));

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}


/** Gemini sometimes emits bar_chart { … } instead of type: histogram. Accept it so rebuilds still draw. */
function parseLooseBarChart(text: string): ChartSpec | null {
  if (!/\b(bar_chart|histogram)\s*\{/i.test(text)) return null;
  const title = (text.match(/title:\s*"([^"]+)"/i) || text.match(/title:\s*'([^']+)'/i) || [])[1] || "Chart";
  const xLabel = (text.match(/x_label:\s*"([^"]+)"/i) || text.match(/x(?:label)?:\s*"([^"]+)"/i) || [])[1] || "";
  const yLabel = (text.match(/y_label:\s*"([^"]+)"/i) || text.match(/y(?:label)?:\s*"([^"]+)"/i) || [])[1] || "Frequency";
  const block = text.match(/bars?:\s*\{([\s\S]*?)\}/i)?.[1] || text;
  const bins: { a: number; b: number; n: number }[] = [];
  for (const m of block.matchAll(/(-?[\d.]+)\s*:\s*(-?[\d.]+)/g)) {
    const x = +m[1], n = +m[2];
    if (!Number.isFinite(x) || !Number.isFinite(n)) continue;
    bins.push({ a: x, b: x + 1, n });
  }
  return bins.length ? { kind: "histogram", title, xLabel, yLabel, bins, read: "" } : null;
}

export function parseChart(text: string): ChartSpec | null {
  const loose = parseLooseBarChart(text);
  if (loose) return loose;
  const kv = new Map<string, string>();
  const rows: [string, string][] = [];
  for (const raw of text.split(/\n+/)) {
    const m = raw.trim().match(/^([^:=#][^:=]*?)\s*[:=]\s*(.*)$/);
    if (!m) continue;
    kv.set(m[1].trim().toLowerCase(), m[2].trim());
    rows.push([m[1].trim(), m[2].trim()]);
  }
  const type = (kv.get("type") || kv.get("chart") || kv.get("kind") || "").toLowerCase();
  if (!type) return null;
  const title = kv.get("title") || "Chart";
  const xLabel = kv.get("x") || kv.get("xlabel") || "";
  const yLabel = kv.get("y") || kv.get("ylabel") || "";
  const read = kv.get("read") || kv.get("caption") || kv.get("note") || "";
  const reserved = /^(type|chart|kind|title|x|y|xlabel|ylabel|read|caption|note|bins|data|binwidth|bars|slices|points|fit|mean|sd|df|shade|mark|marks|dist)$/i;

  if (/hist/.test(type)) {
    let bins: { a: number; b: number; n: number }[] = [];
    const binTxt = kv.get("bins") || kv.get("counts") || kv.get("bars") || "";
    if (binTxt && /-?[\d.]+\s*(?:-|–|to)\s*-?[\d.]+\s*:/.test(binTxt)) {
      for (const m of binTxt.matchAll(/(-?[\d.]+)\s*(?:-|–|to)\s*(-?[\d.]+)\s*:\s*([\d.]+)/g)) bins.push({ a: +m[1], b: +m[2], n: +m[3] });
    } else if (binTxt && /(-?[\d.]+)\s*:\s*(-?[\d.]+)/.test(binTxt)) {
      for (const m of binTxt.matchAll(/(-?[\d.]+)\s*:\s*(-?[\d.]+)/g)) bins.push({ a: +m[1], b: +m[1] + 1, n: +m[2] });
    } else if (kv.get("data")) {
      const data = nums(kv.get("data")!).sort((a, b) => a - b);
      if (!data.length) return null;
      const lo = data[0], hi = data[data.length - 1];
      const k = Number(kv.get("bins")) || Math.max(5, Math.min(14, Math.ceil(Math.log2(data.length) + 1)));
      const w = Number(kv.get("binwidth")) || (hi - lo || 1) / k;
      const start = Math.floor(lo / w) * w;
      const count = Math.max(1, Math.ceil((hi - start) / w + 1e-9));
      bins = Array.from({ length: count }, (_, i) => ({ a: start + i * w, b: start + (i + 1) * w, n: 0 }));
      for (const v of data) bins[Math.min(count - 1, Math.floor((v - start) / w))].n++;
    }
    return bins.length ? { kind: "histogram", title, xLabel, yLabel: yLabel || "Frequency", bins, read } : null;
  }
  if (/bar|column/.test(type)) {
    const bars = kv.get("bars") ? pairs(kv.get("bars")!) : rows.filter(([k]) => !reserved.test(k)).map(([k, v]) => ({ label: k, v: nums(v)[0] })).filter((b) => Number.isFinite(b.v));
    return bars.length ? { kind: "bar", title, xLabel, yLabel, bars, read } : null;
  }
  if (/pie|donut/.test(type)) {
    const slices = kv.get("slices") ? pairs(kv.get("slices")!) : rows.filter(([k]) => !reserved.test(k)).map(([k, v]) => ({ label: k, v: nums(v)[0] })).filter((b) => Number.isFinite(b.v) && b.v > 0);
    return slices.length ? { kind: "pie", title, slices, read } : null;
  }
  if (/box/.test(type)) {
    const boxes = rows.filter(([k]) => !reserved.test(k)).map(([label, v]) => {
      const [main, outs] = v.split("|");
      let n = nums(main);
      const out = outs ? nums(outs) : [];
      if (n.length > 5) {
        const s = [...n].sort((a, b) => a - b);
        const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1;
        const inside = s.filter((x) => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr);
        return { label, min: inside[0], q1, med: quantile(s, 0.5), q3, max: inside[inside.length - 1], out: s.filter((x) => !inside.includes(x)) };
      }
      if (n.length < 5) return null;
      n = n.slice(0, 5);
      return { label, min: n[0], q1: n[1], med: n[2], q3: n[3], max: n[4], out };
    }).filter((b): b is NonNullable<typeof b> => Boolean(b));
    return boxes.length ? { kind: "box", title, xLabel, yLabel, boxes, read } : null;
  }
  if (/scatter/.test(type)) {
    const pts: Pt[] = [];
    const n = nums(kv.get("points") || kv.get("data") || "");
    for (let i = 0; i + 1 < n.length; i += 2) pts.push({ x: n[i], y: n[i + 1] });
    return pts.length ? { kind: "scatter", title, xLabel, yLabel, points: pts, fit: kv.get("fit") || null, read } : null;
  }
  if (/normal|density|bell|t-?dist|^t$|sampling/.test(type)) {
    const dist = /t-?dist|^t$/.test(type) || /^t$/i.test(kv.get("dist") || "") ? "t" : "normal";
    const shade: [number, number][] = [];
    for (const part of (kv.get("shade") || "").split(/[,;]|\band\b/)) {
      const p = part.trim();
      if (!p) continue;
      const between = p.match(/(-?[\d.]+)\s*(?:\.\.|to|–|-(?=\s*-?\d))\s*(-?[\d.]+)/);
      if (between) shade.push([+between[1], +between[2]]);
      else if (/^>/.test(p)) shade.push([nums(p)[0], Infinity]);
      else if (/^</.test(p)) shade.push([-Infinity, nums(p)[0]]);
    }
    return { kind: "density", title, xLabel, yLabel: yLabel || "Density", dist, mean: Number(kv.get("mean") ?? 0) || 0, sd: Number(kv.get("sd")) || 1, df: Number(kv.get("df")) || 10, shade, marks: nums(kv.get("marks") || kv.get("mark") || ""), read };
  }
  return null;
}

// ---------- rendering ----------
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : +v.toFixed(Math.abs(v) < 10 ? 2 : 1) + "");

function niceTicks(lo: number, hi: number, n = 5) {
  const span = hi - lo || 1;
  const step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), r = step0 / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

function frame(title: string, xLabel: string, yLabel: string, body: string, opts?: { noAxes?: boolean }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}">
  <rect width="${W}" height="${H}" fill="#fbf6ea" rx="10"/>
  <text x="${W / 2}" y="24" text-anchor="middle" fill="#3d2a00" font-size="15" font-weight="600" font-family="ui-serif, Georgia, serif">${esc(title)}</text>
  ${opts?.noAxes ? "" : `<text x="${W / 2}" y="${H - 12}" text-anchor="middle" fill="#5c5346" font-size="12" font-family="${FONT}">${esc(xLabel)}</text>
  <text x="16" y="${H / 2}" text-anchor="middle" fill="#5c5346" font-size="12" font-family="${FONT}" transform="rotate(-90 16 ${H / 2})">${esc(yLabel)}</text>`}
  ${body}</svg>`;
}

function axes(x0: number, x1: number, y0: number, y1: number, opts: { xTicks?: boolean; yTicks?: boolean } = {}) {
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
  const sy = (y: number) => H - B - ((y - y0) / (y1 - y0 || 1)) * (H - T - B);
  const parts: string[] = [];
  if (opts.yTicks !== false) for (const t of niceTicks(y0, y1)) {
    parts.push(`<line x1="${L}" x2="${W - R}" y1="${sy(t).toFixed(1)}" y2="${sy(t).toFixed(1)}" stroke="#ece3d0"/>`);
    parts.push(`<text x="${L - 6}" y="${(sy(t) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#7a6f5e" font-family="${FONT}">${fmt(t)}</text>`);
  }
  if (opts.xTicks !== false) for (const t of niceTicks(x0, x1, 6)) {
    parts.push(`<text x="${sx(t).toFixed(1)}" y="${H - B + 16}" text-anchor="middle" font-size="11" fill="#7a6f5e" font-family="${FONT}">${fmt(t)}</text>`);
  }
  parts.push(`<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#5c5346" stroke-width="1.5"/>`);
  parts.push(`<line x1="${L}" y1="${H - B}" x2="${L}" y2="${T}" stroke="#5c5346" stroke-width="1.5"/>`);
  return { sx, sy, svg: parts.join("") };
}

function normalPdf(x: number, m: number, s: number) { return Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI)); }
function lgamma(z: number): number {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1; let a = c[0]; const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}
function tPdf(x: number, df: number) { return Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * Math.log(df * Math.PI) - ((df + 1) / 2) * Math.log(1 + (x * x) / df)); }

export function chartSvg(c: ChartSpec): string {
  if (c.kind === "pie") {
    const total = c.slices.reduce((s, x) => s + x.v, 0) || 1;
    const cx = 230, cy = H / 2 + 10, r = 140;
    let a = -Math.PI / 2;
    const parts: string[] = [];
    c.slices.forEach((s, i) => {
      const da = (s.v / total) * Math.PI * 2, b = a + da, col = PALETTE[i % PALETTE.length];
      const p1 = [cx + r * Math.cos(a), cy + r * Math.sin(a)], p2 = [cx + r * Math.cos(b), cy + r * Math.sin(b)];
      parts.push(c.slices.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}"/>` : `<path d="M${cx},${cy} L${p1[0].toFixed(1)},${p1[1].toFixed(1)} A${r},${r} 0 ${da > Math.PI ? 1 : 0} 1 ${p2[0].toFixed(1)},${p2[1].toFixed(1)} Z" fill="${col}" stroke="#fbf6ea" stroke-width="2"/>`);
      const mid = a + da / 2, pct = Math.round((s.v / total) * 100);
      if (pct >= 5) parts.push(`<text x="${(cx + r * 0.62 * Math.cos(mid)).toFixed(1)}" y="${(cy + r * 0.62 * Math.sin(mid) + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="#fff" font-family="${FONT}">${pct}%</text>`);
      parts.push(`<rect x="410" y="${70 + i * 26}" width="14" height="14" rx="3" fill="${col}"/><text x="432" y="${82 + i * 26}" font-size="13" fill="#3d3326" font-family="${FONT}">${esc(s.label)} (${fmt(s.v)})</text>`);
      a = b;
    });
    return frame(c.title, "", "", parts.join(""), { noAxes: true });
  }
  if (c.kind === "bar" || c.kind === "histogram") {
    const vals = c.kind === "bar" ? c.bars.map((b) => b.v) : c.bins.map((b) => b.n);
    const top = Math.max(...vals, 0) * 1.12 || 1, lo = Math.min(0, ...vals);
    if (c.kind === "histogram") {
      const x0 = c.bins[0].a, x1 = c.bins[c.bins.length - 1].b;
      const ax = axes(x0, x1, lo, top);
      const rects = c.bins.map((b) => `<rect x="${ax.sx(b.a).toFixed(1)}" y="${ax.sy(b.n).toFixed(1)}" width="${(ax.sx(b.b) - ax.sx(b.a)).toFixed(1)}" height="${(ax.sy(0) - ax.sy(b.n)).toFixed(1)}" fill="#1f6f6a" fill-opacity="0.75" stroke="#fbf6ea" stroke-width="1"/>`).join("");
      return frame(c.title, c.xLabel, c.yLabel, ax.svg + rects);
    }
    const ax = axes(0, c.bars.length, lo, top, { xTicks: false });
    const slot = (W - L - R) / c.bars.length;
    const rects = c.bars.map((b, i) => {
      const x = L + i * slot + slot * 0.18, w = slot * 0.64, y = ax.sy(Math.max(0, b.v)), h = Math.abs(ax.sy(0) - ax.sy(b.v));
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${PALETTE[i % PALETTE.length]}"/>
      <text x="${(x + w / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="11" fill="#3d3326" font-family="${FONT}">${fmt(b.v)}</text>
      <text x="${(x + w / 2).toFixed(1)}" y="${H - B + 16}" text-anchor="middle" font-size="11" fill="#5c5346" font-family="${FONT}">${esc(b.label.slice(0, 16))}</text>`;
    }).join("");
    return frame(c.title, c.xLabel, c.yLabel, ax.svg + rects);
  }
  if (c.kind === "box") {
    const all = c.boxes.flatMap((b) => [b.min, b.max, ...b.out]);
    const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.08 || 1;
    const ax = axes(0, c.boxes.length, lo - pad, hi + pad, { xTicks: false });
    const slot = (W - L - R) / c.boxes.length;
    const g = c.boxes.map((b, i) => {
      const cx = L + slot * (i + 0.5), w = Math.min(90, slot * 0.5), col = PALETTE[i % PALETTE.length];
      return `<line x1="${cx}" x2="${cx}" y1="${ax.sy(b.max).toFixed(1)}" y2="${ax.sy(b.q3).toFixed(1)}" stroke="${col}" stroke-width="1.6"/>
      <line x1="${cx}" x2="${cx}" y1="${ax.sy(b.q1).toFixed(1)}" y2="${ax.sy(b.min).toFixed(1)}" stroke="${col}" stroke-width="1.6"/>
      <line x1="${cx - w / 4}" x2="${cx + w / 4}" y1="${ax.sy(b.max).toFixed(1)}" y2="${ax.sy(b.max).toFixed(1)}" stroke="${col}" stroke-width="1.6"/>
      <line x1="${cx - w / 4}" x2="${cx + w / 4}" y1="${ax.sy(b.min).toFixed(1)}" y2="${ax.sy(b.min).toFixed(1)}" stroke="${col}" stroke-width="1.6"/>
      <rect x="${cx - w / 2}" y="${ax.sy(b.q3).toFixed(1)}" width="${w}" height="${(ax.sy(b.q1) - ax.sy(b.q3)).toFixed(1)}" fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-width="1.8"/>
      <line x1="${cx - w / 2}" x2="${cx + w / 2}" y1="${ax.sy(b.med).toFixed(1)}" y2="${ax.sy(b.med).toFixed(1)}" stroke="${col}" stroke-width="3"/>
      ${b.out.map((o) => `<circle cx="${cx}" cy="${ax.sy(o).toFixed(1)}" r="3.5" fill="none" stroke="${col}" stroke-width="1.5"/>`).join("")}
      <text x="${cx}" y="${H - B + 16}" text-anchor="middle" font-size="12" fill="#5c5346" font-family="${FONT}">${esc(b.label)}</text>`;
    }).join("");
    return frame(c.title, c.xLabel, c.yLabel, ax.svg + g);
  }
  if (c.kind === "scatter") {
    const xs = c.points.map((p) => p.x), ys = c.points.map((p) => p.y);
    const px = (Math.max(...xs) - Math.min(...xs)) * 0.08 || 1, py = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 1;
    const x0 = Math.min(...xs) - px, x1 = Math.max(...xs) + px;
    const ax = axes(x0, x1, Math.min(...ys) - py, Math.max(...ys) + py);
    let fit = "";
    let expr = c.fit;
    if (expr && /^(auto|ols|least|regression|line|yes|true)/i.test(expr)) {
      const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
      const b1 = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / (xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1);
      expr = `${my - b1 * mx}+${b1}*x`;
    }
    if (expr) {
      const pts = sampleFn(expr, x0, x1, 40).map((p) => ({ x: ax.sx(p.x), y: ax.sy(p.y) }));
      if (pts.length > 1) fit = `<path d="${smoothPath(pts)}" fill="none" stroke="#9a3412" stroke-width="2.2"/>`;
    }
    const dots = c.points.map((p) => `<circle cx="${ax.sx(p.x).toFixed(1)}" cy="${ax.sy(p.y).toFixed(1)}" r="4" fill="#1d4ed8" fill-opacity="0.7"/>`).join("");
    return frame(c.title, c.xLabel, c.yLabel, ax.svg + dots + fit);
  }
  // density
  const span = c.dist === "t" ? 4.5 : 3.6;
  const x0 = c.mean - span * c.sd, x1 = c.mean + span * c.sd;
  const pdf = (x: number) => (c.dist === "t" ? tPdf((x - c.mean) / c.sd, c.df) / c.sd : normalPdf(x, c.mean, c.sd));
  const top = pdf(c.mean) * 1.15;
  const ax = axes(x0, x1, 0, top, { yTicks: false });
  const curve: Pt[] = [];
  for (let i = 0; i <= 160; i++) { const x = x0 + ((x1 - x0) * i) / 160; curve.push({ x: ax.sx(x), y: ax.sy(pdf(x)) }); }
  const shades = c.shade.map(([a, b]) => {
    const lo = Math.max(x0, a), hi = Math.min(x1, b);
    if (!(hi > lo)) return "";
    const pts: Pt[] = [];
    for (let i = 0; i <= 60; i++) { const x = lo + ((hi - lo) * i) / 60; pts.push({ x: ax.sx(x), y: ax.sy(pdf(x)) }); }
    return `<path d="M${ax.sx(lo).toFixed(1)},${ax.sy(0).toFixed(1)} ${pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} L${ax.sx(hi).toFixed(1)},${ax.sy(0).toFixed(1)} Z" fill="#6b3fa0" fill-opacity="0.28"/>`;
  }).join("");
  const marks = c.marks.map((m) => `<line x1="${ax.sx(m).toFixed(1)}" x2="${ax.sx(m).toFixed(1)}" y1="${ax.sy(0)}" y2="${ax.sy(pdf(m)).toFixed(1)}" stroke="#9a3412" stroke-dasharray="5 4" stroke-width="1.6"/><text x="${ax.sx(m).toFixed(1)}" y="${(ax.sy(pdf(m)) - 6).toFixed(1)}" text-anchor="middle" font-size="11" fill="#9a3412" font-family="${FONT}">${fmt(m)}</text>`).join("");
  return frame(c.title, c.xLabel, c.yLabel, ax.svg + shades + `<path d="${smoothPath(curve)}" fill="none" stroke="#1f6f6a" stroke-width="2.4"/>` + marks);
}
