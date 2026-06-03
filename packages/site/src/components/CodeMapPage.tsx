import type { CodeMapData, Evidence } from "../types.js";
import ClaimsList from "./ClaimsList.js";

interface Props {
  data: CodeMapData | null;
  onSelectEvidence?: (ev: Evidence) => void;
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

function groupFilesByModule(
  files: Array<{ path: string; module: string }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const f of files) {
    const mod = f.module || "Uncategorized";
    const list = map.get(mod) ?? [];
    list.push(f.path);
    map.set(mod, list);
  }
  return map;
}

export default function CodeMapPage({ data, onSelectEvidence }: Props) {
  if (!data) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Code Map</h1>
        <EmptyState message="No code map data available. Run codewiki scan to generate artifacts." />
      </div>
    );
  }

  const hasFiles = data.files && data.files.length > 0;
  const hasModules = data.modules && data.modules.length > 0;
  const hasClaims = data.claims && data.claims.length > 0;

  if (!hasFiles && !hasModules && !hasClaims) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Code Map</h1>
        <EmptyState message="Code map artifact exists but contains no structured data yet." />
      </div>
    );
  }

  const fileGroups = hasFiles ? groupFilesByModule(data.files) : new Map<string, string[]>();
  const moduleNames = hasModules
    ? data.modules.map((m) => m.name)
    : Array.from(fileGroups.keys()).sort();

  return (
    <div style={{ padding: "2rem", maxWidth: "900px" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Code Map</h1>

      {data.incomplete && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: "0.375rem",
            color: "#92400e",
            fontSize: "0.875rem",
            marginBottom: "1.5rem",
          }}
        >
          This code map is incomplete — some files or symbols may be missing.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        {hasModules && (
          <section>
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#1e293b",
                marginBottom: "1rem",
              }}
            >
              Modules
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {data.modules.map((mod, i) => (
                <div
                  key={i}
                  style={{
                    padding: "0.875rem 1rem",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "0.375rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, color: "#1e293b" }}>{mod.name}</span>
                    {mod.type && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          marginLeft: "0.5rem",
                          padding: "0.125rem 0.375rem",
                          background: "#f1f5f9",
                          color: "#475569",
                          borderRadius: "0.25rem",
                          textTransform: "capitalize",
                        }}
                      >
                        {mod.type}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                    {mod.fileCount} file{mod.fileCount === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {hasFiles && (
          <section>
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#1e293b",
                marginBottom: "1rem",
              }}
            >
              Files
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {moduleNames.map((modName) => {
                const files = fileGroups.get(modName) ?? [];
                if (files.length === 0) return null;
                return (
                  <div key={modName}>
                    <h3
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        color: "#475569",
                        margin: "0 0 0.5rem",
                      }}
                    >
                      {modName}
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                        padding: "0.5rem 0.75rem",
                        background: "#f8fafc",
                        borderRadius: "0.375rem",
                      }}
                    >
                      {files.sort().map((filePath, j) => (
                        <code
                          key={j}
                          style={{
                            fontSize: "0.8125rem",
                            color: "#334155",
                            fontFamily: "ui-monospace, SFMono-Regular, monospace",
                            padding: "0.25rem 0",
                          }}
                        >
                          {filePath}
                        </code>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {hasClaims && (
          <section>
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#1e293b",
                marginBottom: "1rem",
              }}
            >
              Claims
            </h2>
            <ClaimsList claims={data.claims!} onSelectEvidence={onSelectEvidence} />
          </section>
        )}
      </div>
    </div>
  );
}
