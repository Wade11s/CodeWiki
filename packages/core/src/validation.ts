import type { Artifact, ArtifactValidationResult, Evidence } from "./types.js";

export function validateArtifact(
  artifact: Artifact,
  snapshotId: string,
  options?: { requireEvidence?: boolean; allowedTypes?: string[] }
): ArtifactValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!artifact.schemaVersion) {
    errors.push("Missing schemaVersion");
  }
  if (!artifact.snapshotId) {
    errors.push("Missing snapshotId");
  } else if (artifact.snapshotId !== snapshotId) {
    errors.push(`SnapshotId mismatch: expected ${snapshotId}, got ${artifact.snapshotId}`);
  }
  if (!artifact.generatedAt) {
    errors.push("Missing generatedAt");
  } else {
    try {
      new Date(artifact.generatedAt).toISOString();
    } catch {
      errors.push("Invalid generatedAt timestamp");
    }
  }
  if (artifact.data === undefined || artifact.data === null) {
    errors.push("Missing data field");
  }

  if (options?.requireEvidence && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as Record<string, unknown>;
    if ("evidence" in data) {
      const evidenceList = data.evidence as Evidence[] | undefined;
      if (!evidenceList || evidenceList.length === 0) {
        warnings.push("No evidence citations provided");
      } else {
        for (const ev of evidenceList) {
          if (!ev.filePath) errors.push("Evidence missing filePath");
          if (!ev.snippet) warnings.push("Evidence missing snippet");
          if (ev.lineStart && ev.lineEnd && ev.lineStart > ev.lineEnd) {
            errors.push(`Evidence line range invalid: ${ev.lineStart} > ${ev.lineEnd}`);
          }
        }
      }
    } else {
      errors.push("Missing required evidence field");
    }
  }

  if (options?.allowedTypes && artifact.data && typeof artifact.data === "object") {
    const data = artifact.data as Record<string, unknown>;
    if ("type" in data && !options.allowedTypes.includes(data.type as string)) {
      errors.push(`Disallowed artifact type: ${data.type}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
