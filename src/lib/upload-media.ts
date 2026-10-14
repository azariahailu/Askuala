import JSZip from "jszip";
import { createHash } from "crypto";
import type { InlineMedia } from "./llm";

/**
 * Visual content Gemini should SEE, not just read as text: photos, screenshots, whole PDFs
 * (Gemini reads every page, graphs and handwriting included), and the pictures inside slides and Word files.
 */
const IMG: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif" };
const MAX_TOTAL = 15 * 1024 * 1024; // keep the whole Gemini request under its ~20 MB inline limit
const MAX_IMAGES = 24;
const MIN_IMAGE = 6 * 1024; // skip tiny logos, bullets and icons

export type UploadFile = { name: string; mime: string; buf?: Buffer };

function ext(name: string) {
  return (name.split(".").pop() || "").toLowerCase();
}

export async function mediaFromUploads(files: UploadFile[]): Promise<InlineMedia[]> {
  return (await mediaBatch(files)).media;
}

/**
 * Picks up to MAX_IMAGES unique visuals. Duplicates (same logo on every slide) count once.
 * `skip` holds keys already shown to Gemini, so "keep everything and continue" moves on to the next batch.
 * Returns the keys sent and how many unique visuals exist in total.
 */
export async function mediaBatch(files: UploadFile[], skip: Set<string> = new Set()) {
  const out: InlineMedia[] = [];
  const keys: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  let bytes = 0;
  let full = false;
  const push = (mimeType: string, buf: Buffer, label: string) => {
    const key = createHash("sha1").update(buf).digest("hex").slice(0, 16);
    if (seen.has(key)) return true;
    seen.add(key);
    total++;
    if (skip.has(key)) return true;
    if (full || out.length >= MAX_IMAGES || bytes + buf.length > MAX_TOTAL) { full = true; return true; }
    out.push({ mimeType, data: buf.toString("base64"), label });
    keys.push(key);
    bytes += buf.length;
    return true;
  };
  for (const f of files) {
    if (!f.buf?.length) continue;
    const e = ext(f.name);
    const mime = (f.mime || "").toLowerCase();
    try {
      if (mime.startsWith("image/") || IMG[e]) {
        push(IMG[e] || mime, f.buf, f.name);
      } else if (mime === "application/pdf" || e === "pdf") {
        push("application/pdf", f.buf, f.name);
      } else if (["pptx", "docx", "xlsx"].includes(e)) {
        const zip = await JSZip.loadAsync(f.buf);
        const media = Object.keys(zip.files)
          .filter((p) => /^(ppt|word|xl)\/media\/[^/]+\.(png|jpe?g|webp|gif)$/i.test(p))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        for (const p of media) {
          const buf = Buffer.from(await zip.files[p].async("uint8array"));
          if (buf.length < MIN_IMAGE) continue;
          push(IMG[ext(p)] || "image/png", buf, `${f.name} (${p.split("/").pop()})`);
        }
      }
    } catch {
      /* unreadable file: text extraction still covers it */
    }
  }
  return { media: out, keys, total };
}
