import { z } from "zod";

export const ArtifactEnvelopeSchema = z.object({
  schemaVersion: z.string(),
  snapshotId: z.string(),
  generatedAt: z.string().datetime(),
  data: z.unknown(),
});

export const SnapshotSchema = z.object({
  id: z.string(),
  schemaVersion: z.string(),
  createdAt: z.string().datetime(),
  repoPath: z.string(),
  gitHead: z.string().nullable(),
  gitDirty: z.boolean(),
  fileCount: z.number().int().min(0),
  fileHashes: z.record(z.string()),
  parserVersion: z.string(),
  agentVersion: z.string(),
});

export const AgentConfigSchema = z.object({
  default: z.string(),
  concurrency: z.number().int().min(1),
  timeoutSeconds: z.number().int().min(1),
  retries: z.number().int().min(0),
});

export const SkipReasonSchema = z.enum([
  "binary",
  "oversized",
  "generated",
  "ignored",
  "parse-unavailable",
]);

export const SkippedFileSchema = z.object({
  path: z.string(),
  reason: SkipReasonSchema,
  metadata: z.record(z.unknown()).optional(),
});

export const SkippedFilesArtifactSchema = z.object({
  schemaVersion: z.string(),
  snapshotId: z.string(),
  generatedAt: z.string().datetime(),
  data: z.array(SkippedFileSchema),
});

export const ScanConfigSchema = z.object({
  interactiveConfig: z.boolean(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

export const CodeWikiConfigSchema = z.object({
  agent: AgentConfigSchema,
  scan: ScanConfigSchema,
});

export const EvidenceSchema = z.object({
  filePath: z.string(),
  lineStart: z.number().int().min(1),
  lineEnd: z.number().int().min(1),
  snippet: z.string(),
  symbol: z.string().optional(),
  blockId: z.string().optional(),
  relatedSymbols: z.array(z.string()).optional(),
});

export const ClaimSchema = z.object({
  statement: z.string(),
  evidence: z.array(EvidenceSchema),
});

export const OverviewDataSchema = z.object({
  type: z.literal("overview"),
  summary: z.string(),
  modulesAnalyzed: z.number().int().min(0),
  modulesComplete: z.number().int().min(0),
  modulesFailed: z.number().int().min(0),
  totalFiles: z.number().int().min(0),
  skippedFiles: z.number().int().min(0),
  claims: z.array(ClaimSchema).optional(),
});

export const ModuleDataSchema = z.object({
  type: z.literal("module"),
  name: z.string(),
  summary: z.string(),
  keyFeatures: z.array(z.string()),
  complexity: z.enum(["low", "medium", "high"]),
  claims: z.array(ClaimSchema),
});

export const FeatureDataSchema = z.object({
  type: z.literal("feature"),
  id: z.string(),
  category: z.string(),
  name: z.string(),
  description: z.string().optional(),
  claims: z.array(ClaimSchema),
});

export const CodeMapDataSchema = z.object({
  type: z.literal("code-map"),
  files: z.array(z.object({ path: z.string(), module: z.string() })),
  modules: z.array(z.object({ name: z.string(), type: z.string(), fileCount: z.number().int().min(0) })),
  claims: z.array(ClaimSchema).optional(),
});

export const ValidationErrorSchema = z.object({
  code: z.string(),
  path: z.string(),
  message: z.string(),
});

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationErrorSchema),
  warnings: z.array(ValidationErrorSchema),
});

export const HealthStatusSchema = z.enum(["healthy", "degraded", "unavailable"]);

export const DetectedAgentSchema = z.object({
  name: z.string(),
  command: z.string(),
  version: z.string().nullable(),
  available: z.boolean(),
  health: HealthStatusSchema,
  default: z.boolean(),
});

export const ConfigSourceSchema = z.enum(["default", "user", "repo"]);

export const EffectiveAgentConfigSchema = z.object({
  default: z.string(),
  concurrency: z.number().int().min(1),
  timeoutSeconds: z.number().int().min(1),
  retries: z.number().int().min(0),
  sources: z.object({
    default: ConfigSourceSchema,
    concurrency: ConfigSourceSchema,
    timeoutSeconds: ConfigSourceSchema,
    retries: ConfigSourceSchema,
  }),
});

export const EffectiveScanConfigSchema = z.object({
  interactiveConfig: z.boolean(),
  source: ConfigSourceSchema,
});

export const FeatureCandidateSchema = z.object({
  id: z.string(),
  category: z.enum(["script", "cli", "route", "api", "ui-page", "test", "export", "readme-usage"]),
  name: z.string(),
  description: z.string().optional(),
  evidence: z.array(EvidenceSchema),
});

export const FeatureCandidateGroupSchema = z.object({
  id: z.string(),
  category: FeatureCandidateSchema.shape.category,
  name: z.string(),
  description: z.string().optional(),
  candidates: z.array(FeatureCandidateSchema),
});

export const TaskStateSchema = z.enum(["pending", "running", "success", "failed", "timeout"]);

export const TaskResultSchema = z.object({
  taskId: z.string(),
  exitCode: z.number(),
  durationMs: z.number().int().min(0),
  stdout: z.string(),
  stderr: z.string(),
  retries: z.number().int().min(0),
  validationErrors: z.array(ValidationErrorSchema),
  state: TaskStateSchema,
});

export const TaskRunRecordSchema = z.object({
  taskId: z.string(),
  prompt: z.string(),
  inputArtifacts: z.array(z.string()),
  outputSchema: z.string(),
  state: TaskStateSchema,
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().int().min(0),
  retries: z.number().int().min(0),
  validationErrors: z.array(ValidationErrorSchema),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
});

export const RunRecordSchema = z.object({
  runId: z.string(),
  repoPath: z.string(),
  providerName: z.string(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  tasks: z.array(TaskRunRecordSchema),
  summary: z.object({
    total: z.number().int().min(0),
    success: z.number().int().min(0),
    failed: z.number().int().min(0),
    timedOut: z.number().int().min(0),
  }),
});

export const SymbolKindSchema = z.enum([
  "function",
  "class",
  "interface",
  "type",
  "enum",
  "variable",
  "const",
  "let",
  "method",
  "property",
  "module",
  "arrow_function",
  "export",
  "unknown",
]);

export const CodeSymbolSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: SymbolKindSchema,
  filePath: z.string(),
  lineStart: z.number().int().min(1),
  lineEnd: z.number().int().min(1),
  snippet: z.string(),
  exported: z.boolean(),
  language: z.string(),
  parentSymbol: z.string().optional(),
});

export const ImportSchema = z.object({
  id: z.string(),
  source: z.string(),
  names: z.array(z.string()),
  filePath: z.string(),
  lineStart: z.number().int().min(1),
  lineEnd: z.number().int().min(1),
  snippet: z.string(),
  isDefault: z.boolean(),
  isNamespace: z.boolean(),
  language: z.string(),
});

export const BlockKindSchema = z.enum([
  "function",
  "class",
  "interface",
  "type",
  "enum",
  "export",
  "import",
  "comment",
  "unknown",
]);

export const BlockSchema = z.object({
  id: z.string(),
  kind: BlockKindSchema,
  name: z.string(),
  filePath: z.string(),
  lineStart: z.number().int().min(1),
  lineEnd: z.number().int().min(1),
  snippet: z.string(),
  language: z.string(),
  symbolIds: z.array(z.string()),
});

export const ModuleTypeSchema = z.enum(["package", "workspace", "directory"]);

export const ModuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  type: ModuleTypeSchema,
  language: z.string().optional(),
  files: z.array(z.string()),
  entryPoints: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
});

export const IndexerResultSchema = z.object({
  symbols: z.array(CodeSymbolSchema),
  imports: z.array(ImportSchema),
  blocks: z.array(BlockSchema),
  modules: z.array(ModuleSchema),
});

export const IndexFactsSchema = z.object({
  symbols: z.array(CodeSymbolSchema),
  imports: z.array(ImportSchema),
  blocks: z.array(BlockSchema),
  modules: z.array(ModuleSchema),
});

export const ArtifactValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationErrorSchema),
  warnings: z.array(ValidationErrorSchema),
});
