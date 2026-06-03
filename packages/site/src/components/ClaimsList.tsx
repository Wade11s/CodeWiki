import type { Claim, Evidence } from "../types.js";
import EvidenceReferences from "./EvidenceReferences.js";

interface Props {
  claims: Claim[];
  onSelectEvidence?: (ev: Evidence) => void;
}

export default function ClaimsList({ claims, onSelectEvidence }: Props) {
  const valid = claims.filter(
    (c) => typeof c.statement === "string" && c.statement.length > 0
  );

  if (valid.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {valid.map((claim, i) => (
        <div
          key={i}
          style={{
            padding: "0.75rem 1rem",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "0.375rem",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.5, color: "#334155" }}>
            {claim.statement}
          </p>
          {claim.evidence && claim.evidence.length > 0 && (
            <EvidenceReferences evidence={claim.evidence} onSelect={onSelectEvidence} />
          )}
        </div>
      ))}
    </div>
  );
}
