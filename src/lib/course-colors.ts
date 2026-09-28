export const NON_COURSE_COLOR = "#8A8680";

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function lum([r, g, b]: [number, number, number]) {
  const to = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * to(r) + 0.7152 * to(g) + 0.0722 * to(b);
}

function contrast(a: [number, number, number], b: [number, number, number]) {
  const l1 = lum(a);
  const l2 = lum(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function rgb([r, g, b]: [number, number, number]) {
  return `rgb(${r}, ${g}, ${b})`;
}

export function chipStyle(hex: string, theme: "light" | "dark") {
  const base = parseHex(hex || "#c9a227");
  const toward: [number, number, number] = theme === "dark" ? [255, 248, 230] : [28, 22, 12];
  let bg = mix(base, toward, theme === "dark" ? 0.16 : 0.18);
  const page: [number, number, number] = theme === "dark" ? [13, 13, 13] : [246, 241, 230];
  let guard = 0;
  while (contrast(bg, page) < 3 && guard < 8) {
    bg = mix(bg, toward, 0.18);
    guard += 1;
  }
  const ink = lum(bg) > 0.48 ? "#16120c" : "#fffaf0";
  return { background: rgb(bg), color: ink };
}
