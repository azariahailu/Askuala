import fs from "node:fs/promises";
import mammoth from "mammoth";

function ensurePdfDom() {
  const g = globalThis as { DOMMatrix?: unknown };
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class PdfDomMatrix {};
  }
}

async function pdfText(data: Buffer) {
  ensurePdfDom();
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(data);
    return result.text || "";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Cannot find module|MODULE_NOT_FOUND/i.test(message)) {
      throw new Error("PDF reading is unavailable right now. Paste the syllabus text from Canvas, or try again in a minute.");
    }
    if (/Invalid PDF|encrypted|password/i.test(message)) {
      throw new Error("That PDF could not be read. Paste the syllabus text from Canvas instead.");
    }
    throw err;
  }
}

export async function extractTextFromPath(filePath: string, mime: string, originalName: string) {
  const lower = originalName.toLowerCase();
  if (mime.includes("pdf") || lower.endsWith(".pdf")) {
    return pdfText(await fs.readFile(filePath));
  }
  if (
    mime.includes("word") ||
    lower.endsWith(".docx") ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }
  if (mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) {
    return fs.readFile(filePath, "utf8");
  }
  return "";
}

export async function extractTextFromBuffer(buf: Buffer, mime: string, originalName: string) {
  const lower = originalName.toLowerCase();
  if (mime.includes("pdf") || lower.endsWith(".pdf")) {
    return pdfText(buf);
  }
  if (lower.endsWith(".docx") || mime.includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value || "";
  }
  if (mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) {
    return buf.toString("utf8");
  }
  return "";
}
