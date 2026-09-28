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
    body { font-family: "Source Serif 4", Palatino, Georgia, "Times New Roman", serif; font-size: 16px; line-height: 1.55; }
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
<body>
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

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
