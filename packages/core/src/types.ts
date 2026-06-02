export interface Repository {
  path: string;
  name: string;
}

export interface Snapshot {
  id: string;
  schemaVersion: string;
  createdAt: string;
  repoPath: string;
  gitHead: string | null;
  gitDirty: boolean;
  fileCount: number;
  fileHashes: Record<string, string>;
  parserVersion: string;
  agentVersion: string;
}

export interface Evidence {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  symbol?: string;
  relatedSymbols?: string[];
}

export interface Artifact {
  schemaVersion: string;
  snapshotId: string;
  generatedAt: string;
  data: unknown;
}

export interface AgentConfig {
  default: string;
  concurrency: number;
  timeoutSeconds: number;
  retries: number;
}

// parse-unavailable is reserved for future use (e.g. unsupported language or parser failure)
export type SkipReason = "binary" | "oversized" | "generated" | "ignored" | "parse-unavailable";

export interface SkippedFile {
  path: string;
  reason: SkipReason;
  metadata?: Record<string, unknown>;
}

export interface SkippedFilesArtifact {
  schemaVersion: string;
  snapshotId: string;
  generatedAt: string;
  data: SkippedFile[];
}

export interface ScanConfig {
  interactiveConfig: boolean;
  include?: string[];
  exclude?: string[];
}

export interface CodeWikiConfig {
  agent: AgentConfig;
  scan: ScanConfig;
}

export type HealthStatus = "healthy" | "degraded" | "unavailable";

export interface DetectedAgent {
  name: string;
  command: string;
  version: string | null;
  available: boolean;
  health: HealthStatus;
  default: boolean;
}

export type ConfigSource = "default" | "user" | "repo";

export interface EffectiveAgentConfig {
  default: string;
  concurrency: number;
  timeoutSeconds: number;
  retries: number;
  sources: {
    default: ConfigSource;
    concurrency: ConfigSource;
    timeoutSeconds: ConfigSource;
    retries: ConfigSource;
  };
}

export interface EffectiveScanConfig {
  interactiveConfig: boolean;
  source: ConfigSource;
}

export interface FeatureCandidate {
  id: string;
  category: "script" | "cli" | "route" | "api" | "ui-page" | "test" | "export" | "readme-usage";
  name: string;
  description?: string;
  evidence: Evidence[];
}

export interface FeatureCandidateGroup {
  id: string;
  category: FeatureCandidate["category"];
  name: string;
  description?: string;
  candidates: FeatureCandidate[];
}

export type TaskState = "pending" | "running" | "success" | "failed" | "timeout";

export interface TaskResult {
  taskId: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  retries: number;
  validationErrors: string[];
  state: TaskState;
}

export interface AgentProvider {
  name: string;
  detect(): Promise<DetectedAgent | null>;
  runTask(options: {
    prompt: string;
    repoIndexPath: string;
    inputArtifacts: string[];
    outputSchema: string;
    timeoutSeconds: number;
    retries: number;
  }): Promise<TaskResult>;
}

export interface TaskRunRecord {
  taskId: string;
  prompt: string;
  inputArtifacts: string[];
  outputSchema: string;
  state: TaskState;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  retries: number;
  validationErrors: string[];
  startedAt: string;
  completedAt: string;
}

export interface RunRecord {
  runId: string;
  repoPath: string;
  providerName: string;
  startedAt: string;
  completedAt: string;
  tasks: TaskRunRecord[];
  summary: {
    total: number;
    success: number;
    failed: number;
    timedOut: number;
  };
}
