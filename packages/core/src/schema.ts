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
  relatedSymbols: z.array(z.string()).optional(),
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
  validationErrors: z.array(z.string()),
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
  validationErrors: z.array(z.string()),
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
