"use client";

import { Children, isValidElement, type ReactNode } from "react";
import hljs from "highlight.js";

const ALIAS: Record<string, string> = {
  py: "python",
  js: "javascript",
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  shell: "bash",
  sh: "bash",
  zsh: "bash",
  text: "plaintext",
  txt: "plaintext",
  md: "markdown",
  rs: "rust",
  kt: "kotlin",
  golang: "go",
  yml: "yaml",
  objc: "objectivec",
  "objective-c": "objectivec",
};

function normalizeLang(raw: string) {
  const lang = (raw || "").trim().toLowerCase();
  if (!lang || lang === "graph") return "";
  return ALIAS[lang] || lang;
}

export function codeFromPreChildren(children: ReactNode): { lang: string; code: string } | null {
  const child = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return null;
  const lang = /language-([\w+#-]+)/.exec(child.props.className || "")?.[1] || "";
  const code = String(child.props.children || "").replace(/\n$/, "");
  return { lang, code };
}

export function StudyCodeBlock({ lang, code }: { lang: string; code: string }) {
  const requested = normalizeLang(lang);
  let label = requested || "code";
  let html = "";
  try {
    if (requested && hljs.getLanguage(requested)) {
      html = hljs.highlight(code, { language: requested, ignoreIllegals: true }).value;
    } else {
      const auto = hljs.highlightAuto(code);
      html = auto.value;
      if (!requested && auto.language) label = auto.language;
    }
  } catch {
    html = "";
  }

  return (
    <figure className="buddy-code">
      <figcaption className="buddy-code-lang">{label}</figcaption>
      <div className="buddy-scroll buddy-code-scroll">
        {html ? (
          <pre className="buddy-code-pre">
            <code className={`hljs language-${label}`} dangerouslySetInnerHTML={{ __html: html }} />
          </pre>
        ) : (
          <pre className="buddy-code-pre">
            <code className="hljs">{code}</code>
          </pre>
        )}
      </div>
    </figure>
  );
}
