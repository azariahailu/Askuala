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

/** Source / notes / data files that should be read as UTF-8 text for study guides. */
const TEXT_EXT =
  /\.(py|ipynb|r|rmd|jl|java|c|h|cpp|cc|cxx|hpp|hh|cs|go|rs|rb|php|swift|kt|kts|scala|js|jsx|mjs|cjs|ts|tsx|json|jsonl|yaml|yml|toml|xml|html|htm|css|scss|less|sql|sh|bash|zsh|fish|ps1|bat|cmd|m|matlab|nb|tex|bib|md|markdown|txt|csv|tsv|dat|log|ini|cfg|conf|env|dockerfile|makefile|mk|cmake|gradle|sbt|pl|pm|lua|vim|zig|dart|vue|svelte|astro|graphql|gql|proto|wat|asm|s|rkt|clj|cljs|ex|exs|erl|hs|lhs|ml|mli|fs|fsx|vb|sass|styl|pug|haml|ejs|hbs|mustache|rst|adoc|org)$/i;

const TEXT_MIME =
  /^(text\/|application\/(json|javascript|typescript|xml|sql|x-sh|x-python|x-httpd-php|toml|yaml|x-yaml|x-tex|graphql|vnd\.dart))/i;

function isTextLike(mime: string, originalName: string) {
  const lower = originalName.toLowerCase();
  const base = lower.split(/[/\\]/).pop() || lower;
  if (TEXT_EXT.test(base)) return true;
  if (TEXT_MIME.test(mime || "")) return true;
  if (/^makefile$|^dockerfile$|^cmakelists\.txt$/i.test(base)) return true;
  return false;
}

/** Reject obvious binaries; allow UTF-8 / latin1 source that browsers send as octet-stream. */
function looksLikeUtfText(buf: Buffer) {
  if (!buf.length) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 12_000));
  let weird = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) return false;
    // Allow tab/newline/form-feed/carriage-return; flag other C0 controls.
    if (b < 9 || (b > 13 && b < 32)) weird += 1;
  }
  return weird / sample.length < 0.02;
}

function decodeText(buf: Buffer) {
  const utf8 = buf.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  return buf.toString("latin1");
}

async function asSourceText(buf: Buffer, mime: string, originalName: string) {
  if (isTextLike(mime, originalName) || looksLikeUtfText(buf)) {
    return decodeText(buf);
  }
  return "";
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
  if (isTextLike(mime, originalName) || mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) {
    return fs.readFile(filePath, "utf8");
  }
  const buf = await fs.readFile(filePath);
  return asSourceText(buf, mime, originalName);
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
  if (isTextLike(mime, originalName) || mime.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md")) {
    return decodeText(buf);
  }
  return asSourceText(buf, mime, originalName);
}
