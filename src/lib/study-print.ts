import { APP_NAME } from "./brand";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function studyGuideHtml(opts: {
  title: string;
  course: string;
  date: string;
  html: string;
  extraHtml?: string;
  capture?: boolean;
}) {
  const extra = opts.extraHtml
    ? `<h2 class="kicker">Your notes</h2><div class="notes">${opts.extraHtml}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(opts.title)} · ${escapeHtml(APP_NAME)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:ital,wght@0,500;0,600;0,700;1,500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.7/dist/katex.min.css" />
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #f7f1e4; color: #1c1914; }
    body { font-family: "Source Serif 4", Palatino, Georgia, "Times New Roman", serif; font-size: 16px; line-height: 1.55; letter-spacing: normal; word-spacing: 0.02em; }
    .buddy-md, .buddy-md p, .buddy-md li { letter-spacing: normal; word-spacing: 0.03em; white-space: normal; }
    .sheet { max-width: 44rem; margin: 0 auto; padding: 2.4rem 2.2rem 3rem; }
    .brand { font-family: "Source Serif 4", Palatino, serif; font-style: italic; color: #8a5a00; }
    .meta { font-family: "Source Sans 3", ui-sans-serif, sans-serif; font-size: 0.78rem; letter-spacing: 0.16em; text-transform: uppercase; color: #8a5a00; margin: 0 0 0.4rem; }
    h1.title { font-family: "Source Serif 4", Palatino, serif; font-size: 2.05rem; font-weight: 700; line-height: 1.2; letter-spacing: -0.02em; color: #3d2a00; margin: 0 0 0.35rem; }
    .date { font-family: "Source Sans 3", ui-sans-serif, sans-serif; color: #6b6458; font-size: 0.92rem; padding-bottom: 1rem; margin-bottom: 1.4rem; border-bottom: 2px solid #c9a227; }
    .buddy-md h1, .buddy-md h2, .buddy-md h3, .buddy-md h4 { font-family: "Source Serif 4", Palatino, serif; color: #3d2a00; line-height: 1.3; margin: 1.2em 0 0.4em; }
    .buddy-md h2 { color: #8a5a00; font-size: 1.25rem; }
    .buddy-md p { margin: 0.55em 0; }
    .buddy-md ul, .buddy-md ol { padding-left: 1.3rem; }
    .buddy-md table { border-collapse: collapse; width: max-content; min-width: 100%; }
    .buddy-md th, .buddy-md td { border: 1px solid #d4c4a0; padding: 0.4em 0.7em; white-space: nowrap; vertical-align: top; }
    .buddy-md th { background: #efe0b8; font-family: "Source Sans 3", sans-serif; }
    .buddy-scroll { overflow-x: auto; margin: 0.8em 0; }
    .buddy-md .katex-display { overflow-x: auto; }
    .study-graph svg { display: block; max-width: 100%; height: auto; }
    .study-graph figcaption { color: #6b6458; font-size: 0.9rem; margin-top: 0.4rem; }
    .kicker { font-family: "Source Sans 3", sans-serif; font-size: 0.75rem; letter-spacing: 0.14em; text-transform: uppercase; color: #8a5a00; margin: 2rem 0 0.5rem; }
    .notes { white-space: pre-wrap; }
    .toolbar { font-family: "Source Sans 3", sans-serif; display: flex; gap: 0.5rem; justify-content: flex-end; padding: 0.75rem 1rem; background: #efe8d8; border-bottom: 1px solid #e0d6c2; }
    .toolbar button { font: inherit; border: 0; border-radius: 0.5rem; padding: 0.45rem 0.9rem; background: #b8860b; color: #111; cursor: pointer; }
    @page { margin: 0.6in; }
    body.pdf { background: #ffffff; }
    body.pdf .toolbar { display: none !important; }
    body.pdf .sheet { max-width: none; padding: 0.4in 0.55in 0.55in; }
    body.pdf .buddy-scroll { overflow: visible !important; max-width: 100%; }
    body.pdf .buddy-md table {
      display: table;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      table-layout: auto;
    }
    body.pdf .buddy-md th,
    body.pdf .buddy-md td {
      white-space: normal !important;
      overflow-wrap: break-word;
      word-break: normal;
      font-size: 10.5pt;
      line-height: 1.35;
    }
    body.pdf .buddy-md p,
    body.pdf .buddy-md li,
    body.pdf .study-graph,
    body.pdf .buddy-md table { break-inside: avoid; page-break-inside: avoid; }
    @media print {
      .toolbar { display: none !important; }
      html, body { background: white; }
      .sheet { max-width: none; padding: 0; }
      .buddy-scroll { overflow: visible !important; max-width: 100%; }
      .buddy-md table {
        display: table;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        table-layout: auto;
      }
      .buddy-md th,
      .buddy-md td {
        white-space: normal !important;
        overflow-wrap: break-word;
        word-break: normal;
        hyphens: auto;
        font-size: 10.5pt;
        line-height: 1.35;
        padding: 0.32em 0.42em;
      }
      .buddy-md th { font-size: 10pt; }
      .buddy-md td .katex,
      .buddy-md th .katex {
        font-size: 1em;
        white-space: normal;
      }
    }
  </style>
</head>
<body class="${opts.capture ? "pdf" : ""}">
  <div class="toolbar">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <article class="sheet">
    <p class="meta"><span class="brand">${escapeHtml(APP_NAME)}</span> · Study guide</p>
    <p class="meta">${escapeHtml(opts.course)}</p>
    <h1 class="title">${escapeHtml(opts.title)}</h1>
    <p class="date">${escapeHtml(opts.date)}</p>
    ${opts.html}
    ${extra}
  </article>
</body>
</html>`;
}

export function printStudyGuide(opts: {
  title: string;
  course: string;
  date: string;
  html: string;
  extraHtml?: string;
}) {
  const page = studyGuideHtml(opts);
  const url = URL.createObjectURL(new Blob([page], { type: "text/html;charset=utf-8" }));
  const tab = window.open(url, "_blank");
  if (tab) {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  iframe.srcdoc = page;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 2000);
  };
}

export async function captureStudyPrintPdf(opts: {
  title: string;
  course: string;
  date: string;
  html: string;
  extraHtml?: string;
}): Promise<Blob> {
  const page = studyGuideHtml({ ...opts, capture: true });
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-2000px;top:0;width:816px;height:1400px;opacity:1;pointer-events:none;border:0";
  iframe.srcdoc = page;
  document.body.appendChild(iframe);
  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    setTimeout(() => resolve(), 4000);
  });
  const idoc = iframe.contentDocument;
  try {
    await idoc?.fonts.ready;
  } catch {
    /* fallback fonts */
  }
  await new Promise((r) => setTimeout(r, 500));
  const sheet = idoc?.querySelector(".sheet") as HTMLElement | null;
  if (!sheet) {
    iframe.remove();
    throw new Error("Could not render the study guide page.");
  }
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(sheet, {
    backgroundColor: "#ffffff",
    scale: 1.5,
    useCORS: true,
    logging: false,
    windowWidth: 816,
    onclone: (_, el) => {
      el.style.letterSpacing = "normal";
      el.style.wordSpacing = "0.03em";
    },
    ...({ letterRendering: true } as object),
  });
  iframe.remove();
  const { PDFDocument, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const pageWidth = 612;
  const pageHeight = 792;
  const slicePx = Math.floor((pageHeight / pageWidth) * canvas.width);
  let y = 0;
  while (y < canvas.height) {
    const end = nextSafeBreak(canvas, y, slicePx);
    const h = Math.max(1, end - y);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = h;
    const ctx = slice.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    }
    const img = await pdf.embedPng(slice.toDataURL("image/png"));
    const printed = pdf.addPage([pageWidth, pageHeight]);
    printed.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(1, 1, 1) });
    const drawH = (h / canvas.width) * pageWidth;
    printed.drawImage(img, { x: 0, y: pageHeight - drawH, width: pageWidth, height: drawH });
    y = end;
  }
  const bytes = await pdf.save();
  return new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
}

function rowIsBlank(data: Uint8ClampedArray) {
  let dark = 0;
  for (let i = 0; i < data.length; i += 48) {
    if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) dark += 1;
    if (dark > 2) return false;
  }
  return true;
}

function nextSafeBreak(canvas: HTMLCanvasElement, start: number, ideal: number) {
  const target = Math.min(start + ideal, canvas.height);
  if (target >= canvas.height) return canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return target;
  const min = start + Math.floor(ideal * 0.58);
  for (let y = target; y > min; y -= 3) {
    if (rowIsBlank(ctx.getImageData(0, y, canvas.width, 1).data)) {
      let bottom = y;
      while (bottom < target && rowIsBlank(ctx.getImageData(0, bottom + 3, canvas.width, 1).data)) bottom += 3;
      return Math.min(canvas.height, bottom + 3);
    }
  }
  return target;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
