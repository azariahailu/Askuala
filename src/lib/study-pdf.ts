import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function linesFromMarkdown(title: string, markdown: string) {
  const cleaned = markdown
    .replace(/```graph[\s\S]*?```/g, "[graph]")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*\n?/gi, "").replace(/```/g, ""))
    .replace(/[#*_`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return [`${title}`, "", ...cleaned.split(/\r?\n/)];
}

export async function studyGuidePdf(title: string, markdown: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  const size = 11;
  const titleSize = 16;
  let page = pdf.addPage();
  let { width, height } = page.getSize();
  let y = height - margin;
  const maxWidth = width - margin * 2;

  function wrap(text: string, f = font, s = size) {
    const words = text.split(/\s+/);
    const out: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(next, s) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  }

  function draw(text: string, heading = false) {
    const f = heading ? bold : font;
    const s = heading ? titleSize : size;
    for (const row of wrap(text || " ", f, s)) {
      if (y < margin + 16) {
        page = pdf.addPage();
        ({ width, height } = page.getSize());
        y = height - margin;
      }
      page.drawText(row.slice(0, 500), {
        x: margin,
        y,
        size: s,
        font: f,
        color: rgb(0.08, 0.08, 0.08),
      });
      y -= heading ? 22 : 14;
    }
  }

  const rows = linesFromMarkdown(title, markdown || "Study guide");
  rows.forEach((row, i) => draw(row, i === 0));
  return Buffer.from(await pdf.save());
}
