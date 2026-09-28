import katex from "katex";
import html2canvas from "html2canvas";

const cache = new Map<string, { data: Uint8Array; width: number; height: number }>();

export async function katexPng(tex: string, display: boolean) {
  const key = `${display ? "d" : "i"}:${tex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const html = katex.renderToString(tex, {
    throwOnError: false,
    displayMode: display,
    output: "html",
    strict: "ignore",
  });
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:0;top:0;width:720px;height:240px;opacity:0;pointer-events:none;border:0;background:#fff;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("iframe");
  }
  doc.open();
  doc.write(`<!DOCTYPE html><html><head>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.7/dist/katex.min.css" />
    <style>
      html, body { margin: 0; background: #ffffff; color: #1c1914; }
      body { display: inline-block; padding: 8px 12px; font-size: 18px; }
    </style>
  </head><body>${html}</body></html>`);
  doc.close();
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    iframe.onload = done;
    setTimeout(done, 400);
  });
  await new Promise((r) => setTimeout(r, 80));
  try {
    const body = doc.body;
    const canvas = await html2canvas(body, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      width: Math.max(body.scrollWidth, 8),
      height: Math.max(body.scrollHeight, 8),
    });
    const dataUrl = canvas.toDataURL("image/png");
    const data = dataUrlToBytes(dataUrl);
    const width = Math.max(18, Math.round(canvas.width / 2));
    const height = Math.max(14, Math.round(canvas.height / 2));
    const out = { data, width, height };
    cache.set(key, out);
    return out;
  } finally {
    iframe.remove();
  }
}

function dataUrlToBytes(dataUrl: string) {
  const bin = atob(dataUrl.split(",")[1] || "");
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  return data;
}
