"use client";

import { Children, isValidElement, type ReactNode } from "react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import matlab from "highlight.js/lib/languages/matlab";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";

let registered = false;

function ensureLangs() {
  if (registered) return;
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("py", python);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("js", javascript);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("ts", typescript);
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("c", c);
  hljs.registerLanguage("cpp", cpp);
  hljs.registerLanguage("c++", cpp);
  hljs.registerLanguage("r", r);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("shell", bash);
  hljs.registerLanguage("sh", bash);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("matlab", matlab);
  hljs.registerLanguage("plaintext", plaintext);
  hljs.registerLanguage("text", plaintext);
  registered = true;
}

const ALIAS: Record<string, string> = {
  py: "python",
  js: "javascript",
  ts: "typescript",
  "c++": "cpp",
  shell: "bash",
  sh: "bash",
  text: "plaintext",
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
  ensureLangs();
  const label = normalizeLang(lang) || "code";
  let html = "";
  try {
    if (label !== "code" && hljs.getLanguage(label)) {
      html = hljs.highlight(code, { language: label, ignoreIllegals: true }).value;
    } else {
      html = hljs.highlightAuto(code).value;
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
