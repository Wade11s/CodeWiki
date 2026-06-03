import type { Evidence } from "../types.js";
import CodeHighlighter, { detectLanguage } from "./CodeHighlighter.js";

interface Props {
  evidence: Evidence | null;
  onClose: () => void;
}

export default function CodePanel({ evidence, onClose }: Props) {
  if (!evidence) return null;

  const language = detectLanguage(evidence.filePath);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "480px",
        maxWidth: "100vw",
        height: "100vh",
        background: "#ffffff",
        borderLeft: "1px solid #e2e8f0",
        boxShadow: "-4px 0 16px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "#1e293b",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {evidence.filePath}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.125rem" }}>
            Lines {evidence.lineStart}–{evidence.lineEnd}
            {evidence.symbol && ` · ${evidence.symbol}`}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close panel"
          style={{
            background: "none",
            border: "none",
            fontSize: "1.25rem",
            cursor: "pointer",
            color: "#64748b",
            padding: "0.25rem",
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
        <CodeHighlighter code={evidence.snippet} language={language} />

        {evidence.relatedSymbols && evidence.relatedSymbols.length > 0 && (
          <div style={{ marginTop: "1.5rem" }}>
            <h4
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#475569",
                margin: "0 0 0.5rem",
                textTransform: "uppercase",
                letterSpacing: "0.025em",
              }}
            >
              Related Symbols
            </h4>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.8125rem", color: "#334155" }}>
              {evidence.relatedSymbols.map((sym, i) => (
                <li key={i}>{sym}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
