import type { Evidence } from "../types.js";

interface Props {
  evidence: Evidence[];
  onSelect?: (ev: Evidence) => void;
}

function evidenceLabel(ev: Evidence): string {
  if (ev.symbol) {
    return `${ev.filePath}:${ev.lineStart}-${ev.lineEnd} (${ev.symbol})`;
  }
  return `${ev.filePath}:${ev.lineStart}-${ev.lineEnd}`;
}

export default function EvidenceReferences({ evidence, onSelect }: Props) {
  const valid = evidence.filter(
    (ev) =>
      typeof ev.filePath === "string" &&
      ev.filePath.length > 0 &&
      typeof ev.lineStart === "number" &&
      typeof ev.lineEnd === "number" &&
      ev.lineStart >= 1 &&
      ev.lineEnd >= ev.lineStart
  );

  if (valid.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.5rem" }}>
      {valid.map((ev, i) => (
        <button
          key={i}
          onClick={() => onSelect?.(ev)}
          style={{
            fontSize: "0.75rem",
            padding: "0.25rem 0.5rem",
            background: "#eff6ff",
            color: "#1d4ed8",
            border: "1px solid #bfdbfe",
            borderRadius: "0.25rem",
            cursor: onSelect ? "pointer" : "default",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
          }}
        >
          {evidenceLabel(ev)}
        </button>
      ))}
    </div>
  );
}
