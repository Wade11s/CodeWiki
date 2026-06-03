import type { FeaturesData, Evidence } from "../types.js";
import ClaimsList from "./ClaimsList.js";

interface Props {
  data: FeaturesData | null;
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

function groupByCategory(features: FeaturesData): Map<string, FeaturesData> {
  const map = new Map<string, FeaturesData>();
  for (const f of features) {
    const cat = f.category || "Uncategorized";
    const list = map.get(cat) ?? [];
    list.push(f);
    map.set(cat, list);
  }
  return map;
}

export default function FeaturesPage({ data, onSelectEvidence }: Props) {
  if (!data) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Features</h1>
        <EmptyState message="No features data available. Run codewiki scan to generate artifacts." />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Features</h1>
        <EmptyState message="Features artifact exists but contains no feature entries yet." />
      </div>
    );
  }

  const grouped = groupByCategory(data);
  const categories = Array.from(grouped.keys()).sort();

  return (
    <div style={{ padding: "2rem", maxWidth: "900px" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Features</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        {categories.map((category) => (
          <section key={category}>
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#1e293b",
                marginBottom: "1rem",
                textTransform: "capitalize",
              }}
            >
              {category}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {grouped.get(category)!.map((feature) => (
                <div
                  key={feature.id}
                  style={{
                    padding: "1.25rem",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "0.5rem",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.0625rem",
                        fontWeight: 600,
                        color: "#1e293b",
                      }}
                    >
                      {feature.name || "Unnamed feature"}
                    </h3>
                  </div>

                  {feature.description && (
                    <p
                      style={{
                        margin: "0 0 0.75rem",
                        lineHeight: 1.6,
                        color: "#475569",
                        fontSize: "0.9375rem",
                      }}
                    >
                      {feature.description}
                    </p>
                  )}

                  {feature.claims && feature.claims.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          color: "#64748b",
                          marginBottom: "0.5rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.025em",
                        }}
                      >
                        Evidence
                      </div>
                      <ClaimsList claims={feature.claims} onSelectEvidence={onSelectEvidence} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
