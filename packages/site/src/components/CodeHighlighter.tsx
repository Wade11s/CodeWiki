import { useEffect, useState, useRef } from "react";
import { codeToHtml } from "shiki";

interface Props {
  code: string;
  language?: string;
}

function detectLanguage(filePath: string): string {
  const basename = filePath.split("/").pop()?.toLowerCase() ?? "";
  const basenameMap: Record<string, string> = {
    dockerfile: "dockerfile",
    makefile: "makefile",
    jenkinsfile: "groovy",
  };
  if (basenameMap[basename]) return basenameMap[basename];

  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    rb: "ruby",
    php: "php",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    xml: "xml",
  };
  return map[ext] || "text";
}

export default function CodeHighlighter({ code, language = "text" }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function highlight() {
      try {
        const result = await codeToHtml(code, {
          lang: language,
          theme: "github-light",
        });
        if (!cancelled) setHtml(result);
      } catch {
        if (!cancelled) setHtml(null);
      }
    }
    highlight();
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (html) {
    return (
      <div
        ref={containerRef}
        style={{
          fontSize: "0.8125rem",
          lineHeight: 1.5,
          overflow: "auto",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre
      style={{
        margin: 0,
        fontSize: "0.8125rem",
        lineHeight: 1.5,
        overflow: "auto",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
      }}
    >
      <code>{code}</code>
    </pre>
  );
}

export { detectLanguage };
