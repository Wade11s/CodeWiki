import { describe, it, expect } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateArtifact,
  loadIndexFacts,
  writeInvalidArtifact,
} from "../src/validation.js";
import type {
  Artifact,
  IndexFacts,
  ValidationError,
  CodeSymbol,
  Block,
  Module,
} from "../src/types.js";

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    schemaVersion: "1.0.0",
    snapshotId: "snap-123",
    generatedAt: new Date().toISOString(),
    data: {},
    ...overrides,
  };
}

function makeIndexFacts(overrides: Partial<IndexFacts> = {}): IndexFacts {
  return {
    symbols: [],
    imports: [],
    blocks: [],
    modules: [],
    ...overrides,
  };
}

function makeModule(name: string, files: string[]): Module {
  return {
    id: `mod-${name}`,
    name,
    path: name,
    type: "package",
    files,
  };
}

function makeSymbol(overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    id: "sym-1",
    name: "mySymbol",
    kind: "function",
    filePath: "src/index.ts",
    lineStart: 1,
    lineEnd: 10,
    snippet: "function mySymbol() {}",
    exported: true,
    language: "typescript",
    ...overrides,
  };
}

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: "blk-1",
    kind: "function",
    name: "myBlock",
    filePath: "src/index.ts",
    lineStart: 1,
    lineEnd: 10,
    snippet: "function myBlock() {}",
    language: "typescript",
    symbolIds: ["sym-1"],
    ...overrides,
  };
}

describe("validateArtifact - envelope", () => {
  const snapshotId = "snap-123";
  const indexFacts = makeIndexFacts();

  it("accepts a valid artifact", () => {
    const artifact = makeArtifact({
      data: { evidence: [{ filePath: "src/a.ts", lineStart: 1, lineEnd: 2, snippet: "x" }] },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing schemaVersion", () => {
    const artifact = makeArtifact({ schemaVersion: "" });
    const result = validateArtifact(artifact, snapshotId, indexFacts);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_SCHEMA_VERSION")).toBe(true);
  });

  it("rejects missing snapshotId", () => {
    const artifact = makeArtifact({ snapshotId: "" });
    const result = validateArtifact(artifact, snapshotId, indexFacts);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_SNAPSHOT_ID")).toBe(true);
  });

  it("rejects snapshot mismatch", () => {
    const artifact = makeArtifact({ snapshotId: "wrong-snap" });
    const result = validateArtifact(artifact, snapshotId, indexFacts);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "SNAPSHOT_MISMATCH")).toBe(true);
  });

  it("rejects missing generatedAt", () => {
    const artifact = makeArtifact({ generatedAt: "" });
    const result = validateArtifact(artifact, snapshotId, indexFacts);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_GENERATED_AT")).toBe(true);
  });

  it("rejects invalid generatedAt timestamp", () => {
    const artifact = makeArtifact({ generatedAt: "not-a-date" });
    const result = validateArtifact(artifact, snapshotId, indexFacts);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_GENERATED_AT")).toBe(true);
  });

  it("rejects missing data field", () => {
    const artifact = makeArtifact({ data: undefined as unknown as unknown });
    const result = validateArtifact(artifact, snapshotId, indexFacts);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_DATA")).toBe(true);
  });
});

describe("validateArtifact - evidence resolution", () => {
  const snapshotId = "snap-123";

  it("accepts valid citations that resolve to indexed files", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
      symbols: [makeSymbol({ filePath: "src/index.ts", lineStart: 1, lineEnd: 20 })],
      blocks: [makeBlock({ filePath: "src/index.ts", lineStart: 1, lineEnd: 20 })],
    });
    const artifact = makeArtifact({
      data: {
        evidence: [{ filePath: "src/index.ts", lineStart: 5, lineEnd: 10, snippet: "const x = 1;" }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects evidence referencing missing files", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
    });
    const artifact = makeArtifact({
      data: {
        evidence: [{ filePath: "src/missing.ts", lineStart: 1, lineEnd: 5, snippet: "x" }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EVIDENCE_FILE_NOT_FOUND")).toBe(true);
  });

  it("rejects out-of-range line references", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
      symbols: [makeSymbol({ filePath: "src/index.ts", lineStart: 1, lineEnd: 10 })],
      blocks: [makeBlock({ filePath: "src/index.ts", lineStart: 1, lineEnd: 10 })],
    });
    const artifact = makeArtifact({
      data: {
        evidence: [{ filePath: "src/index.ts", lineStart: 1, lineEnd: 50, snippet: "x" }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EVIDENCE_OUT_OF_RANGE")).toBe(true);
  });

  it("rejects invalid line range (start > end)", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
    });
    const artifact = makeArtifact({
      data: {
        evidence: [{ filePath: "src/index.ts", lineStart: 10, lineEnd: 5, snippet: "x" }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EVIDENCE_INVALID_RANGE")).toBe(true);
  });

  it("rejects unknown symbol references", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
      symbols: [makeSymbol({ filePath: "src/index.ts", name: "knownSymbol", lineStart: 1, lineEnd: 10 })],
    });
    const artifact = makeArtifact({
      data: {
        evidence: [{ filePath: "src/index.ts", lineStart: 1, lineEnd: 5, snippet: "x", symbol: "unknownSymbol" }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EVIDENCE_UNKNOWN_SYMBOL")).toBe(true);
  });

  it("rejects symbol reference with mismatched line range", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
      symbols: [makeSymbol({ filePath: "src/index.ts", name: "myFunc", lineStart: 5, lineEnd: 15 })],
    });
    const artifact = makeArtifact({
      data: {
        evidence: [{ filePath: "src/index.ts", lineStart: 1, lineEnd: 20, snippet: "x", symbol: "myFunc" }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EVIDENCE_SYMBOL_MISMATCH")).toBe(true);
  });

  it("rejects unknown blockId references", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
      blocks: [makeBlock({ id: "blk-known", filePath: "src/index.ts", lineStart: 1, lineEnd: 10 })],
    });
    const artifact = makeArtifact({
      data: {
        evidence: [{ filePath: "src/index.ts", lineStart: 1, lineEnd: 5, snippet: "x", blockId: "blk-unknown" }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EVIDENCE_UNKNOWN_BLOCK")).toBe(true);
  });

  it("rejects blockId reference in wrong file", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts", "src/other.ts"])],
      blocks: [makeBlock({ id: "blk-1", filePath: "src/other.ts", lineStart: 1, lineEnd: 10 })],
    });
    const artifact = makeArtifact({
      data: {
        evidence: [{ filePath: "src/index.ts", lineStart: 1, lineEnd: 5, snippet: "x", blockId: "blk-1" }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EVIDENCE_BLOCK_FILE_MISMATCH")).toBe(true);
  });

  it("rejects blockId reference with mismatched line range", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
      blocks: [makeBlock({ id: "blk-1", filePath: "src/index.ts", lineStart: 5, lineEnd: 15 })],
    });
    const artifact = makeArtifact({
      data: {
        evidence: [{ filePath: "src/index.ts", lineStart: 1, lineEnd: 20, snippet: "x", blockId: "blk-1" }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "EVIDENCE_BLOCK_MISMATCH")).toBe(true);
  });

  it("warns on missing evidence snippet", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
    });
    const artifact = makeArtifact({
      data: {
        evidence: [{ filePath: "src/index.ts", lineStart: 1, lineEnd: 2, snippet: "" }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.warnings.some((w) => w.code === "EVIDENCE_MISSING_SNIPPET")).toBe(true);
  });
});

describe("validateArtifact - claims", () => {
  const snapshotId = "snap-123";

  it("accepts claims with valid evidence", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
    });
    const artifact = makeArtifact({
      data: {
        claims: [
          {
            statement: "Module does indexing",
            evidence: [{ filePath: "src/index.ts", lineStart: 1, lineEnd: 2, snippet: "x" }],
          },
        ],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(true);
  });

  it("reclaims invalid feature claims without evidence", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
    });
    const artifact = makeArtifact({
      data: {
        claims: [
          {
            statement: "This claim has no evidence",
            evidence: [],
          },
        ],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_CLAIM_EVIDENCE")).toBe(true);
  });

  it("rejects claims with missing evidence field", () => {
    const indexFacts = makeIndexFacts({
      modules: [makeModule("core", ["src/index.ts"])],
    });
    const artifact = makeArtifact({
      data: {
        claims: [
          {
            statement: "This claim has no evidence field",
          },
        ],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { requireEvidence: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_CLAIM_EVIDENCE")).toBe(true);
  });
});

describe("validateArtifact - type restrictions", () => {
  const snapshotId = "snap-123";
  const indexFacts = makeIndexFacts();

  it("rejects disallowed artifact types", () => {
    const artifact = makeArtifact({
      data: { type: "forbidden" },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, {
      allowedTypes: ["overview", "module"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "DISALLOWED_TYPE")).toBe(true);
  });

  it("accepts allowed artifact types", () => {
    const artifact = makeArtifact({
      data: { type: "overview" },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, {
      allowedTypes: ["overview", "module"],
    });
    expect(result.valid).toBe(true);
  });
});

describe("validateArtifact - data schema validation", () => {
  const snapshotId = "snap-123";
  const indexFacts = makeIndexFacts();

  it("accepts valid overview data schema", () => {
    const artifact = makeArtifact({
      data: {
        type: "overview",
        summary: "Test overview",
        modulesAnalyzed: 1,
        modulesComplete: 1,
        modulesFailed: 0,
        totalFiles: 5,
        skippedFiles: 0,
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { validateDataSchema: true });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects invalid overview data schema (missing summary)", () => {
    const artifact = makeArtifact({
      data: {
        type: "overview",
        modulesAnalyzed: 1,
        modulesComplete: 1,
        modulesFailed: 0,
        totalFiles: 5,
        skippedFiles: 0,
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { validateDataSchema: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_DATA_SCHEMA")).toBe(true);
  });

  it("accepts valid module data schema", () => {
    const artifact = makeArtifact({
      data: {
        type: "module",
        name: "core",
        summary: "Core module",
        keyFeatures: ["indexing"],
        complexity: "medium",
        claims: [
          {
            statement: "Does indexing",
            evidence: [{ filePath: "src/index.ts", lineStart: 1, lineEnd: 2, snippet: "x" }],
          },
        ],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { validateDataSchema: true });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid module data schema (missing claims)", () => {
    const artifact = makeArtifact({
      data: {
        type: "module",
        name: "core",
        summary: "Core module",
        keyFeatures: ["indexing"],
        complexity: "medium",
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { validateDataSchema: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_DATA_SCHEMA")).toBe(true);
  });

  it("accepts valid feature data schema", () => {
    const artifact = makeArtifact({
      data: {
        type: "feature",
        id: "feat-1",
        category: "cli",
        name: "scan command",
        claims: [
          {
            statement: "Scans files",
            evidence: [{ filePath: "src/index.ts", lineStart: 1, lineEnd: 2, snippet: "x" }],
          },
        ],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { validateDataSchema: true });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid feature data schema (missing id)", () => {
    const artifact = makeArtifact({
      data: {
        type: "feature",
        category: "cli",
        name: "scan command",
        claims: [],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { validateDataSchema: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_DATA_SCHEMA")).toBe(true);
  });

  it("accepts valid code-map data schema", () => {
    const artifact = makeArtifact({
      data: {
        type: "code-map",
        files: [{ path: "src/index.ts", module: "core" }],
        modules: [{ name: "core", type: "package", fileCount: 3 }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { validateDataSchema: true });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid code-map data schema (missing files)", () => {
    const artifact = makeArtifact({
      data: {
        type: "code-map",
        modules: [{ name: "core", type: "package", fileCount: 3 }],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { validateDataSchema: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_DATA_SCHEMA")).toBe(true);
  });

  it("rejects feature claims without evidence when requireEvidence is true", () => {
    const artifact = makeArtifact({
      data: {
        type: "feature",
        id: "feat-1",
        category: "cli",
        name: "scan command",
        claims: [
          {
            statement: "This feature claim has no evidence",
            evidence: [],
          },
        ],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, {
      requireEvidence: true,
      validateDataSchema: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_CLAIM_EVIDENCE")).toBe(true);
  });

  it("rejects feature claim with missing evidence field", () => {
    const artifact = makeArtifact({
      data: {
        type: "feature",
        id: "feat-1",
        category: "cli",
        name: "scan command",
        claims: [
          {
            statement: "This feature claim has no evidence field",
          },
        ],
      },
    });
    const result = validateArtifact(artifact, snapshotId, indexFacts, {
      requireEvidence: true,
      validateDataSchema: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_CLAIM_EVIDENCE")).toBe(true);
  });

  it("rejects data that is not an object", () => {
    const artifact = makeArtifact({ data: "not-an-object" });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { validateDataSchema: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_DATA_SCHEMA")).toBe(true);
  });

  it("rejects data missing type field", () => {
    const artifact = makeArtifact({ data: { summary: "no type" } });
    const result = validateArtifact(artifact, snapshotId, indexFacts, { validateDataSchema: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_ARTIFACT_TYPE")).toBe(true);
  });
});

describe("writeInvalidArtifact", () => {
  function createTempDir(name: string): string {
    return mkdtempSync(join(tmpdir(), `codewiki-validation-${name}-`));
  }

  function cleanup(dir: string): void {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("writes invalid artifact record to diagnostics directory", () => {
    const dir = createTempDir("diag");
    const artifact = makeArtifact({
      data: { type: "overview", summary: "test" },
    });
    const validationResult = {
      valid: false,
      errors: [{ code: "TEST_ERROR", path: "data", message: "Test error" }],
      warnings: [],
    };

    const filePath = writeInvalidArtifact(dir, artifact, validationResult, "snap-123");

    expect(existsSync(filePath)).toBe(true);
    const raw = readFileSync(filePath, "utf-8");
    const record = JSON.parse(raw);
    expect(record.artifact).toEqual(artifact);
    expect(record.snapshotId).toBe("snap-123");
    expect(record.errors).toEqual(validationResult.errors);
    expect(record.warnings).toEqual(validationResult.warnings);
    expect(record.validatedAt).toBeString();

    cleanup(dir);
  });

  it("creates diagnostics directory if it does not exist", () => {
    const dir = createTempDir("newdiag");
    const artifact = makeArtifact({ data: {} });
    const validationResult = { valid: false, errors: [], warnings: [] };

    const filePath = writeInvalidArtifact(dir, artifact, validationResult, "snap-456");
    expect(existsSync(join(dir, "diagnostics"))).toBe(true);
    expect(existsSync(filePath)).toBe(true);

    cleanup(dir);
  });
});

describe("loadIndexFacts", () => {
  it("returns null when index files are missing", () => {
    const result = loadIndexFacts("/nonexistent/codewiki");
    expect(result).toBeNull();
  });
});
