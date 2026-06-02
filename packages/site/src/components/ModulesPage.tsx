import type { ModulesData } from "../types.js";

interface Props {
  data: ModulesData | null;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "2rem",
        background: "#f8fafc",
        border: "1px dashed #cbd5e1",
        borderRadius: "0.5rem",
        color: "#64748b",
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}

export default function ModulesPage({ data }: Props) {
  if (!data) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Modules</h1>
        <EmptyState message="No modules data available. Run codewiki scan to generate artifacts." />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Modules</h1>
        <EmptyState message="Modules artifact exists but contains no module entries yet." />
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "900px" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Modules</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {data.map((mod, i) => (
          <div
            key={i}
            style={{
              padding: "1.25rem",
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "0.5rem",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "#1e293b" }}>
                {mod.name || "Unnamed module"}
              </h3>
              {mod.incomplete && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.025em",
                    padding: "0.125rem 0.5rem",
                    background: "#fef3c7",
                    color: "#92400e",
                    borderRadius: "9999px",
                  }}
                >
                  Incomplete
                </span>
              )}
            </div>

            <code
              style={{
                display: "inline-block",
                fontSize: "0.8125rem",
                color: "#475569",
                background: "#f1f5f9",
                padding: "0.25rem 0.5rem",
                borderRadius: "0.25rem",
                marginBottom: "0.75rem",
              }}
            >
              {mod.path}
            </code>

            {mod.summary && (
              <p style={{ margin: "0 0 0.75rem", lineHeight: 1.6, color: "#334155" }}>
                {mod.summary}
              </p>
            )}

            {mod.dependencies && mod.dependencies.length > 0 && (
              <div>
                <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#64748b" }}>Dependencies:</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.375rem" }}>
                  {mod.dependencies.map((dep, j) => (
                    <span
                      key={j}
                      style={{
                        fontSize: "0.8125rem",
                        padding: "0.25rem 0.5rem",
                        background: "#f1f5f9",
                        borderRadius: "0.25rem",
                        color: "#475569",
                      }}
                    >
                      {dep}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!mod.summary && (
              <p style={{ margin: "0.5rem 0 0", color: "#94a3b8", fontSize: "0.875rem", fontStyle: "italic" }}>
                No summary available for this module.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
