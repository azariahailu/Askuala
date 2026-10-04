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
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text || "";
  } finally {
    await parser.destroy();
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
