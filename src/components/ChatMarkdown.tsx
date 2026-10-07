"use client";

import { Children, Component, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { parseStudyGraph } from "@/lib/study-graph";
import { normalizeStudyMarkdown } from "@/lib/study-markdown";
import { codeFromPreChildren, StudyCodeBlock } from "./StudyCodeBlock";
import { StudyGraph } from "./StudyGraph";

export function ChatMarkdown({ text }: { text: string }) {
  return (
    <MarkdownSafe text={text}>
      <MarkdownBody text={text} />
    </MarkdownSafe>
  );
}

function MarkdownBody({ text }: { text: string }) {
  const source = normalizeStudyMarkdown(text || "");
  return (
    <div className="buddy-md text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore", errorColor: "inherit" }]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} className="text-gold-2 underline" target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="buddy-scroll">
              <table>{children}</table>
            </div>
          ),
          pre: ({ children }) => {
            const graph = graphFromPre(children);
            if (graph) return graph;
            const chunk = codeFromPreChildren(children);
            if (chunk) return <StudyCodeBlock lang={chunk.lang} code={chunk.code} />;
            return (
              <div className="buddy-scroll">
                <pre>{children}</pre>
              </div>
            );
          },
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className || "");
            if (isBlock) return <code className={className}>{children}</code>;
            return <code className="buddy-inline-code">{children}</code>;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

function graphFromPre(children: ReactNode) {
  const child = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return null;
  const lang = /language-([\w+#-]+)/.exec(child.props.className || "")?.[1] || "";
  const value = String(child.props.children || "").replace(/\n$/, "");
  const spec = parseStudyGraph(lang, value);
  return spec ? <StudyGraph spec={spec} /> : null;
}

class MarkdownSafe extends Component<{ text: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { text: string }) {
    if (prev.text !== this.props.text && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) return <div className="whitespace-pre-wrap text-sm">{this.props.text}</div>;
    return this.props.children;
  }
}
