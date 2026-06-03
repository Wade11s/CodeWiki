import type { OverviewData, Evidence } from "../types.js";
import ClaimsList from "./ClaimsList.js";

interface Props {
  data: OverviewData | null;
  onSelectEvidence?: (ev: Evidence) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem", color: "#1e293b" }}>
        {title}
      </h2>
      {children}
    </section>
  );
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

function StatGrid({ data }: { data: OverviewData }) {
  const stats: { label: string; value: number | undefined }[] = [
    { label: "Modules analyzed", value: data.modulesAnalyzed },
    { label: "Complete", value: data.modulesComplete },
    { label: "Failed", value: data.modulesFailed },
    { label: "Total files", value: data.totalFiles },
    { label: "Skipped files", value: data.skippedFiles },
  ];
  const visible = stats.filter((s) => typeof s.value === "number");
  if (visible.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "0.75rem",
        marginBottom: "2rem",
      }}
    >
      {visible.map((s) => (
        <div
          key={s.label}
          style={{
            padding: "0.875rem 1rem",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "0.375rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b" }}>{s.value}</div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function OverviewPage({ data, onSelectEvidence }: Props) {
  if (!data) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Overview</h1>
        <EmptyState message="No overview data available. Run codewiki scan to generate artifacts." />
      </div>
    );
  }

  const hasContent =
    data.summary ||
    data.architecture ||
    (data.technologyStack && data.technologyStack.length > 0) ||
    (data.entryPoints && data.entryPoints.length > 0) ||
    data.runModel ||
    (data.claims && data.claims.length > 0) ||
    typeof data.modulesAnalyzed === "number";

  return (
    <div style={{ padding: "2rem", maxWidth: "900px" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>Overview</h1>

      {!hasContent && (
        <EmptyState message="Overview artifact exists but contains no structured data yet." />
      )}

      <StatGrid data={data} />

      {data.summary && (
        <Section title="Summary">
          <p style={{ lineHeight: 1.6, color: "#334155" }}>{data.summary}</p>
        </Section>
      )}

      {data.architecture && (
        <Section title="Architecture">
          <p style={{ lineHeight: 1.6, color: "#334155", whiteSpace: "pre-wrap" }}>{data.architecture}</p>
        </Section>
      )}

      {data.technologyStack && data.technologyStack.length > 0 && (
        <Section title="Technology Stack">
          <ul style={{ paddingLeft: "1.25rem", lineHeight: 1.8, color: "#334155" }}>
            {data.technologyStack.map((tech) => (
              <li key={tech}>{tech}</li>
            ))}
          </ul>
        </Section>
      )}

      {data.entryPoints && data.entryPoints.length > 0 && (
        <Section title="Entry Points">
          <ul style={{ paddingLeft: 0, listStyle: "none" }}>
            {data.entryPoints.map((ep, i) => (
              <li
                key={i}
                style={{
                  padding: "0.75rem",
                  background: "#f8fafc",
                  borderRadius: "0.375rem",
                  marginBottom: "0.5rem",
                  border: "1px solid #e2e8f0",
                }}
              >
                <code style={{ fontSize: "0.875rem", color: "#0f172a", background: "#e2e8f0", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>
                  {ep.path}
                </code>
                {ep.description && (
                  <p style={{ margin: "0.375rem 0 0", color: "#475569", fontSize: "0.9375rem" }}>
                    {ep.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.runModel && (
        <Section title="Run Model">
          <p style={{ lineHeight: 1.6, color: "#334155", whiteSpace: "pre-wrap" }}>{data.runModel}</p>
        </Section>
      )}

      {data.claims && data.claims.length > 0 && (
        <Section title="Claims">
          <ClaimsList claims={data.claims} onSelectEvidence={onSelectEvidence} />
        </Section>
      )}
    </div>
  );
}
