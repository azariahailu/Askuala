import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { parseStudyGraph, studyGraphPlain } from "./study-graph";
import { normalizeStudyMarkdown } from "./study-markdown";
import { katexPng } from "./study-math";
import { APP_NAME } from "./brand";

type MdNode = {
  type: string;
  depth?: number;
  ordered?: boolean;
  lang?: string;
  value?: string;
  children?: MdNode[];
};

type Inline = TextRun | ImageRun;

const GOLD = "8A5A00";
const INK = "1C1914";
const MUTED = "6B6458";
const RULE = "D4C4A0";
const HEADER_BG = "F3E6C4";
const SERIF = "Palatino Linotype";
const SANS = "Calibri";
const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: RULE };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

async function mathRun(tex: string, display: boolean): Promise<Inline> {
  try {
    const png = await katexPng(tex, display);
    const maxH = display ? 52 : 16;
    const maxW = display ? 520 : 220;
    let { width, height } = png;
    const s = Math.min(1, maxH / height, maxW / width);
    width = Math.max(8, Math.round(width * s));
    height = Math.max(8, Math.round(height * s));
    return new ImageRun({
      type: "png",
      data: png.data,
      transformation: { width, height },
    });
  } catch {
    return new TextRun({ text: tex.replace(/\\\\/g, " ").replace(/\$/g, ""), font: SERIF, italics: true, size: display ? 24 : 22, color: INK });
  }
}

async function inlines(nodes: MdNode[] | undefined, extra: { bold?: boolean; italics?: boolean } = {}): Promise<Inline[]> {
  const out: Inline[] = [];
  for (const n of nodes || []) {
    if (n.type === "text") {
      out.push(new TextRun({ text: n.value || "", font: SERIF, size: 22, color: INK, bold: extra.bold, italics: extra.italics }));
    } else if (n.type === "strong") {
      out.push(...(await inlines(n.children, { ...extra, bold: true })));
    } else if (n.type === "emphasis") {
      out.push(...(await inlines(n.children, { ...extra, italics: true })));
    } else if (n.type === "inlineCode") {
      out.push(new TextRun({ text: n.value || "", font: "Consolas", size: 20, color: INK }));
    } else if (n.type === "delete") {
      out.push(...(await inlines(n.children, extra)));
    } else if (n.type === "link") {
      const label = (n.children || []).map((c) => (c.type === "text" ? c.value || "" : "")).join("") || "";
      out.push(new TextRun({ text: label, font: SERIF, size: 22, color: GOLD, underline: {}, italics: extra.italics, bold: extra.bold }));
    } else if (n.type === "inlineMath") {
      out.push(await mathRun(n.value || "", false));
    } else if (n.children) {
      out.push(...(await inlines(n.children, extra)));
    }
  }
  return out.length ? out : [new TextRun({ text: "", font: SERIF, size: 22 })];
}

async function para(
  children: MdNode[] | undefined,
  extra?: { heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; spacingAfter?: number; center?: boolean; italics?: boolean },
) {
  return new Paragraph({
    heading: extra?.heading,
    alignment: extra?.center ? AlignmentType.CENTER : undefined,
    spacing: { after: extra?.spacingAfter ?? 160, line: 312 },
    children: await inlines(children, { italics: extra?.italics }),
  });
}

async function listItems(node: MdNode, ordered: boolean): Promise<Paragraph[]> {
  const items = node.children || [];
  const out: Paragraph[] = [];
  for (const item of items) {
    const first = item.children?.[0];
    const rest = (item.children || []).slice(1);
    out.push(
      new Paragraph({
        numbering: { reference: ordered ? "guide-num" : "guide-bul", level: 0 },
        spacing: { after: 80, line: 300 },
        children: await inlines(first?.type === "paragraph" ? first.children : item.children),
      }),
    );
    for (const ch of rest) {
      if (ch.type === "list") out.push(...(await listItems(ch, Boolean(ch.ordered))));
      else if (ch.type === "paragraph") out.push(await para(ch.children));
    }
  }
  return out;
}

async function tableFrom(node: MdNode) {
  const rows: TableRow[] = [];
  let ri = 0;
  for (const row of node.children || []) {
    if (row.type !== "tableRow") continue;
    const cells: TableCell[] = [];
    for (const cell of row.children || []) {
      const bits = (cell.children || []).flatMap((p) => (p.type === "paragraph" ? p.children || [] : [p]));
      cells.push(
        new TableCell({
          borders,
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: ri === 0 ? { type: ShadingType.CLEAR, fill: HEADER_BG } : undefined,
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({ spacing: { after: 0, line: 276 }, children: await inlines(bits, { bold: ri === 0 }) })],
        }),
      );
    }
    rows.push(new TableRow({ children: cells }));
    ri += 1;
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

async function blocks(nodes: MdNode[]): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [];
  for (const n of nodes) {
    if (n.type === "heading") {
      const level = n.depth === 1 ? HeadingLevel.HEADING_1 : n.depth === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      out.push(await para(n.children, { heading: level, spacingAfter: 120 }));
    } else if (n.type === "paragraph") {
      out.push(await para(n.children));
    } else if (n.type === "list") {
      out.push(...(await listItems(n, Boolean(n.ordered))));
    } else if (n.type === "table") {
      out.push(await tableFrom(n));
      out.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
    } else if (n.type === "blockquote") {
      for (const ch of n.children || []) {
        if (ch.type === "paragraph") {
          out.push(
            new Paragraph({
              indent: { left: 360 },
              border: { left: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 8 } },
              spacing: { after: 140 },
              children: await inlines(ch.children, { italics: true }),
            }),
          );
        }
      }
    } else if (n.type === "code") {
      const spec = parseStudyGraph(n.lang || "", n.value || "");
      if (spec) {
        out.push(
          new Paragraph({
            spacing: { before: 120, after: 80 },
            children: [new TextRun({ text: spec.title, font: SERIF, italics: true, size: 22, color: GOLD, bold: true })],
          }),
        );
        out.push(
          new Paragraph({
            spacing: { after: 160 },
            children: [new TextRun({ text: studyGraphPlain(spec), font: SERIF, size: 20, color: INK, italics: true })],
          }),
        );
      } else {
        out.push(
          new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: "F6F1E6" },
            spacing: { after: 160 },
            children: [new TextRun({ text: n.value || "", font: "Consolas", size: 18, color: INK })],
          }),
        );
      }
    } else if (n.type === "math") {
      out.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 140, after: 140 },
          children: [await mathRun(n.value || "", true)],
        }),
      );
    } else if (n.type === "thematicBreak") {
      out.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 1 } },
          spacing: { after: 200 },
          children: [],
        }),
      );
    } else if (n.children) {
      out.push(...(await blocks(n.children)));
    }
  }
  return out;
}

export function studyFileSlug(title: string) {
  return (
    (title || "study-guide")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "study-guide"
  );
}

function nodeText(n: MdNode | undefined): string {
  if (!n) return "";
  if (n.value) return n.value;
  return (n.children || []).map(nodeText).join("");
}

function withoutCoverHeading(nodes: MdNode[], title: string) {
  const first = nodes[0];
  if (!first || first.type !== "heading" || (first.depth || 1) > 2) return nodes;
  const text = nodeText(first).trim().toLowerCase();
  const t = title.trim().toLowerCase();
  if (!text) return nodes;
  if (text === t || text.includes("study guide") || (t && (text.includes(t) || t.includes(text)))) return nodes.slice(1);
  return nodes;
}

export async function buildStudyDocx(opts: { title: string; course: string; date: string; markdown: string }) {
  const tree = remark().use(remarkGfm).use(remarkMath).parse(normalizeStudyMarkdown(opts.markdown || "")) as MdNode;
  const body = await blocks(withoutCoverHeading(tree.children || [], opts.title));
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: SERIF, size: 22, color: INK } },
        heading1: { run: { font: SERIF, size: 36, bold: true, color: "3D2A00" }, paragraph: { spacing: { before: 280, after: 80 } } },
        heading2: { run: { font: SERIF, size: 28, bold: true, color: GOLD }, paragraph: { spacing: { before: 280, after: 80 } } },
        heading3: { run: { font: SERIF, size: 24, bold: true, color: "3D2A00" }, paragraph: { spacing: { before: 200, after: 60 } } },
      },
    },
    numbering: {
      config: [
        {
          reference: "guide-num",
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 240 } } } }],
        },
        {
          reference: "guide-bul",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 480, hanging: 240 } } } }],
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 8 } },
                spacing: { after: 120 },
                children: [
                  new TextRun({ text: APP_NAME, font: SERIF, italics: true, size: 18, color: GOLD }),
                  new TextRun({ text: "  ·  Study guide", font: SANS, size: 18, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 8 } },
                children: [
                  new TextRun({ text: `${opts.course}  ·  `, font: SANS, size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], font: SANS, size: 16, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: (opts.course || "Course").toUpperCase(), font: SANS, size: 18, color: GOLD, characterSpacing: 120 })],
          }),
          new Paragraph({
            heading: HeadingLevel.TITLE,
            spacing: { after: 80 },
            children: [new TextRun({ text: opts.title || "Study guide", font: SERIF, size: 48, bold: true, color: "3D2A00" })],
          }),
          new Paragraph({
            spacing: { after: 360 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: GOLD, space: 10 } },
            children: [new TextRun({ text: opts.date || "", font: SANS, size: 18, color: MUTED })],
          }),
          ...body,
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}
