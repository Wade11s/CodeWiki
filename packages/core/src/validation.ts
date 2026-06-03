import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  Artifact,
  ArtifactValidationResult,
  Evidence,
  IndexFacts,
  ValidationError,
  CodeSymbol,
  Block,
  Import,
  Module,
} from "./types.js";
import {
  OverviewDataSchema,
  ModuleDataSchema,
  FeatureDataSchema,
  CodeMapDataSchema,
} from "./schema.js";
import type { ZodSchema, ZodError } from "zod";

function err(code: string, path: string, message: string): ValidationError {
  return { code, path, message };
}

function warn(code: string, path: string, message: string): ValidationError {
  return { code, path, message };
}

function loadJsonSafe<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function loadIndexFacts(codewikiDir: string): IndexFacts | null {
  const indexDir = join(codewikiDir, "index");
  const symbols = loadJsonSafe<{ data: unknown }>(join(indexDir, "symbols.json"));
  const imports = loadJsonSafe<{ data: unknown }>(join(indexDir, "imports.json"));
  const blocks = loadJsonSafe<{ data: unknown }>(join(indexDir, "blocks.json"));
  const modules = loadJsonSafe<{ data: unknown }>(join(indexDir, "modules.json"));

  if (!symbols || !blocks || !modules) return null;

  return {
    symbols: Array.isArray(symbols.data) ? (symbols.data as CodeSymbol[]) : [],
    imports: Array.isArray(imports?.data) ? (imports.data as Import[]) : [],
    blocks: Array.isArray(blocks.data) ? (blocks.data as Block[]) : [],
    modules: Array.isArray(modules.data) ? (modules.data as Module[]) : [],
  };
}

function isValidArtifactType(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null;
}

function hasClaims(data: Record<string, unknown>): boolean {
  return "claims" in data && Array.isArray(data.claims);
}

function getEvidenceList(data: Record<string, unknown>): Evidence[] {
  if (hasClaims(data)) {
    const claims = data.claims as Array<Record<string, unknown>>;
    const allEvidence: Evidence[] = [];
    for (const claim of claims) {
      if (Array.isArray(claim.evidence)) {
        allEvidence.push(...(claim.evidence as Evidence[]));
      }
    }
    return allEvidence;
  }
  if ("evidence" in data && Array.isArray(data.evidence)) {
    return data.evidence as Evidence[];
  }
  return [];
}

function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
}

const artifactDataSchemaMap: Record<string, ZodSchema> = {
  overview: OverviewDataSchema,
  module: ModuleDataSchema,
  feature: FeatureDataSchema,
  "code-map": CodeMapDataSchema,
};

function validateArtifactData(
  data: unknown,
  errors: ValidationError[]
): void {
  if (!isValidArtifactType(data)) {
    errors.push(err("INVALID_DATA_SCHEMA", "data", "Artifact data must be an object"));
    return;
  }

  const type = data.type;
  if (typeof type !== "string") {
    errors.push(err("MISSING_ARTIFACT_TYPE", "data.type", "Artifact data must have a string type field"));
    return;
  }

  const schema = artifactDataSchemaMap[type];
  if (!schema) {
    // Unknown type — deferred to allowedTypes check
    return;
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    errors.push(
      err("INVALID_DATA_SCHEMA", "data", `Schema validation failed for type "${type}": ${formatZodError(result.error)}`)
    );
  }
}

export function validateArtifact(
  artifact: Artifact,
  snapshotId: string,
  indexFacts: IndexFacts,
  options?: { requireEvidence?: boolean; allowedTypes?: string[]; validateDataSchema?: boolean }
): ArtifactValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // ── Envelope validation ──
  if (!artifact.schemaVersion) {
    errors.push(err("MISSING_SCHEMA_VERSION", "schemaVersion", "Missing schemaVersion"));
  }
  if (!artifact.snapshotId) {
    errors.push(err("MISSING_SNAPSHOT_ID", "snapshotId", "Missing snapshotId"));
  } else if (artifact.snapshotId !== snapshotId) {
    errors.push(
      err("SNAPSHOT_MISMATCH", "snapshotId", `SnapshotId mismatch: expected ${snapshotId}, got ${artifact.snapshotId}`)
    );
  }
  if (!artifact.generatedAt) {
    errors.push(err("MISSING_GENERATED_AT", "generatedAt", "Missing generatedAt"));
  } else {
    try {
      new Date(artifact.generatedAt).toISOString();
    } catch {
      errors.push(err("INVALID_GENERATED_AT", "generatedAt", "Invalid generatedAt timestamp"));
    }
  }
  if (artifact.data === undefined || artifact.data === null) {
    errors.push(err("MISSING_DATA", "data", "Missing data field"));
  }

  // ── Type validation ──
  if (options?.allowedTypes && isValidArtifactType(artifact.data)) {
    const data = artifact.data as Record<string, unknown>;
    if ("type" in data && !options.allowedTypes.includes(data.type as string)) {
      errors.push(err("DISALLOWED_TYPE", "data.type", `Disallowed artifact type: ${data.type}`));
    }
  }

  // ── Data schema validation ──
  if (options?.validateDataSchema) {
    validateArtifactData(artifact.data, errors);
  }

  // ── Evidence validation ──
  if (options?.requireEvidence && isValidArtifactType(artifact.data)) {
    const data = artifact.data as Record<string, unknown>;
    const evidenceList = getEvidenceList(data);

    if (hasClaims(data)) {
      const claims = data.claims as Array<Record<string, unknown>>;
      for (let i = 0; i < claims.length; i++) {
        const claim = claims[i];
        if (!Array.isArray(claim.evidence) || claim.evidence.length === 0) {
          errors.push(
            err("MISSING_CLAIM_EVIDENCE", `data.claims[${i}]`, `Claim ${i} has no evidence`)
          );
        }
      }
    }

    if (evidenceList.length === 0 && !hasClaims(data)) {
      errors.push(err("MISSING_EVIDENCE", "data.evidence", "Missing required evidence field"));
    } else if (evidenceList.length === 0) {
      warnings.push(warn("NO_EVIDENCE", "data.evidence", "No evidence citations provided"));
    } else {
      for (let i = 0; i < evidenceList.length; i++) {
        const ev = evidenceList[i];
        const path = `data.evidence[${i}]`;
        validateEvidence(ev, path, indexFacts, errors, warnings);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateEvidence(
  ev: Evidence,
  path: string,
  indexFacts: IndexFacts,
  errors: ValidationError[],
  warnings: ValidationError[]
): void {
  if (!ev.filePath) {
    errors.push(err("EVIDENCE_MISSING_FILEPATH", `${path}.filePath`, "Evidence missing filePath"));
    return;
  }

  // Check file existence in indexed modules
  const fileExists = indexFacts.modules.some((m) => m.files.includes(ev.filePath));
  if (!fileExists) {
    errors.push(
      err("EVIDENCE_FILE_NOT_FOUND", `${path}.filePath`, `Evidence references unknown file: ${ev.filePath}`)
    );
  }

  if (!ev.snippet) {
    warnings.push(warn("EVIDENCE_MISSING_SNIPPET", `${path}.snippet`, "Evidence missing snippet"));
  }

  if (ev.lineStart && ev.lineEnd) {
    if (ev.lineStart > ev.lineEnd) {
      errors.push(
        err("EVIDENCE_INVALID_RANGE", `${path}.lineStart`, `Evidence line range invalid: ${ev.lineStart} > ${ev.lineEnd}`)
      );
      return;
    }

    // Validate line ranges against indexed symbols
    const matchingSymbols = indexFacts.symbols.filter(
      (s) => s.filePath === ev.filePath && s.lineStart <= ev.lineStart && s.lineEnd >= ev.lineEnd
    );
    const matchingBlocks = indexFacts.blocks.filter(
      (b) => b.filePath === ev.filePath && b.lineStart <= ev.lineStart && b.lineEnd >= ev.lineEnd
    );

    // Check if line range is within any known symbol or block bounds
    const anySymbolCovers = matchingSymbols.length > 0;
    const anyBlockCovers = matchingBlocks.length > 0;

    if (!anySymbolCovers && !anyBlockCovers && fileExists) {
      // Line range might be out of bounds — check against file-level bounds
      const fileBlocks = indexFacts.blocks.filter((b) => b.filePath === ev.filePath);
      const fileSymbols = indexFacts.symbols.filter((s) => s.filePath === ev.filePath);
      const maxLine = Math.max(
        ...fileBlocks.map((b) => b.lineEnd),
        ...fileSymbols.map((s) => s.lineEnd),
        0
      );
      if (maxLine > 0 && ev.lineEnd > maxLine) {
        errors.push(
          err("EVIDENCE_OUT_OF_RANGE", `${path}.lineEnd`, `Evidence line range exceeds file bounds: ${ev.lineEnd} > ${maxLine}`)
        );
      }
    }

    // Validate symbol reference
    if (ev.symbol) {
      const symbolMatch = indexFacts.symbols.find(
        (s) => s.filePath === ev.filePath && s.name === ev.symbol
      );
      if (!symbolMatch) {
        errors.push(
          err("EVIDENCE_UNKNOWN_SYMBOL", `${path}.symbol`, `Evidence references unknown symbol "${ev.symbol}" in ${ev.filePath}`)
        );
      } else if (ev.lineStart < symbolMatch.lineStart || ev.lineEnd > symbolMatch.lineEnd) {
        errors.push(
          err("EVIDENCE_SYMBOL_MISMATCH", `${path}.symbol`, `Evidence line range does not match symbol "${ev.symbol}" bounds (${symbolMatch.lineStart}-${symbolMatch.lineEnd})`)
        );
      }
    }

    // Validate blockId reference
    if (ev.blockId) {
      const blockMatch = indexFacts.blocks.find((b) => b.id === ev.blockId);
      if (!blockMatch) {
        errors.push(
          err("EVIDENCE_UNKNOWN_BLOCK", `${path}.blockId`, `Evidence references unknown blockId "${ev.blockId}"`)
        );
      } else if (blockMatch.filePath !== ev.filePath) {
        errors.push(
          err("EVIDENCE_BLOCK_FILE_MISMATCH", `${path}.blockId`, `Block "${ev.blockId}" is in ${blockMatch.filePath}, not ${ev.filePath}`)
        );
      } else if (ev.lineStart < blockMatch.lineStart || ev.lineEnd > blockMatch.lineEnd) {
        errors.push(
          err("EVIDENCE_BLOCK_MISMATCH", `${path}.blockId`, `Evidence line range does not match block "${ev.blockId}" bounds (${blockMatch.lineStart}-${blockMatch.lineEnd})`)
        );
      }
    }
  }
}

export interface InvalidArtifactRecord {
  artifact: Artifact;
  validatedAt: string;
  snapshotId: string;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export function writeInvalidArtifact(
  codewikiDir: string,
  artifact: Artifact,
  validationResult: ArtifactValidationResult,
  snapshotId: string
): string {
  const diagnosticsDir = join(codewikiDir, "diagnostics");
  mkdirSync(diagnosticsDir, { recursive: true });

  const record: InvalidArtifactRecord = {
    artifact,
    validatedAt: new Date().toISOString(),
    snapshotId,
    errors: validationResult.errors,
    warnings: validationResult.warnings,
  };

  const type = typeof artifact.data === "object" && artifact.data !== null
    ? (artifact.data as Record<string, unknown>).type || "unknown"
    : "unknown";
  const filename = `invalid-${type}-${Date.now()}.json`;
  const filePath = join(diagnosticsDir, filename);
  writeFileSync(filePath, JSON.stringify(record, null, 2));
  return filePath;
}
