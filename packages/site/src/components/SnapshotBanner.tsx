import type { Snapshot } from "../types.js";

interface Props {
  snapshot: Snapshot | null;
}

export default function SnapshotBanner({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div
        style={{
          padding: "0.5rem 1rem",
          background: "#fef3c7",
          borderBottom: "1px solid #fcd34d",
          fontSize: "0.875rem",
          color: "#92400e",
        }}
      >
        No snapshot available. Run <code>codewiki scan</code> to generate one.
      </div>
    );
  }

  const stale = snapshot.gitDirty;
  const created = new Date(snapshot.createdAt).toLocaleString();

  return (
    <div
      style={{
        padding: "0.5rem 1rem",
        background: stale ? "#fef3c7" : "#ecfdf5",
        borderBottom: stale ? "1px solid #fcd34d" : "1px solid #6ee7b7",
        fontSize: "0.875rem",
        color: stale ? "#92400e" : "#065f46",
        display: "flex",
        gap: "1.5rem",
        flexWrap: "wrap",
      }}
    >
      <span>
        <strong>Snapshot:</strong> {snapshot.id.slice(0, 8)}
      </span>
      <span>
        <strong>Created:</strong> {created}
      </span>
      <span>
        <strong>Files:</strong> {snapshot.fileCount}
      </span>
      <span>
        <strong>Git:</strong> {snapshot.gitHead ? snapshot.gitHead.slice(0, 8) : "none"}
      </span>
      {stale && (
        <span style={{ fontWeight: 600 }}>
          ⚠️ Stale: repository has uncommitted changes
        </span>
      )}
    </div>
  );
}
