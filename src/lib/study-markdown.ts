export function normalizeStudyMarkdown(raw: string) {
  let s = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .trim();
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner: string) => `\n\n$$\n${inner.trim()}\n$$\n\n`);
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner: string) => `$${inner.trim()}$`);
  s = s.replace(/```(?:math|latex)\s*([\s\S]*?)```/gi, (_, inner: string) => `\n\n$$\n${inner.trim()}\n$$\n\n`);
  s = s.replace(
    /(?<!\$)(\\begin\{(?:align|cases|equation|gather|pmatrix|bmatrix|matrix|aligned)\*?\}[\s\S]*?\\end\{[^}]+\})(?!\$)/g,
    "\n\n$$\n$1\n$$\n\n",
  );
  return s;
}
