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
  blockId?: string;
  relatedSymbols?: string[];
}

export interface Claim {
  statement: string;
  evidence: Evidence[];
}

export interface OverviewData {
  type: "overview";
  summary: string;
  modulesAnalyzed: number;
  modulesComplete: number;
  modulesFailed: number;
  totalFiles: number;
  skippedFiles: number;
  claims?: Claim[];
}

export interface ModuleData {
  type: "module";
  name: string;
  summary: string;
  keyFeatures: string[];
  complexity: "low" | "medium" | "high";
  claims: Claim[];
}

export interface FeatureData {
  type: "feature";
  id: string;
  category: string;
  name: string;
  description?: string;
  claims: Claim[];
}

export interface CodeMapData {
  type: "code-map";
  files: Array<{ path: string; module: string }>;
  modules: Array<{ name: string; type: string; fileCount: number }>;
  claims?: Claim[];
}

export interface ValidationError {
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface IndexFacts {
  symbols: CodeSymbol[];
  imports: Import[];
  blocks: Block[];
  modules: Module[];
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

export type TaskState = "pending" | "running" | "success" | "failed" | "timeout";

// ── Indexer types ──

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable"
  | "const"
  | "let"
  | "method"
  | "property"
  | "module"
  | "arrow_function"
  | "export"
  | "unknown";

export interface CodeSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  exported: boolean;
  language: string;
  parentSymbol?: string;
}

export interface Import {
  id: string;
  source: string;
  names: string[];
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  isDefault: boolean;
  isNamespace: boolean;
  language: string;
}

export type BlockKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "export"
  | "import"
  | "comment"
  | "unknown";

export interface Block {
  id: string;
  kind: BlockKind;
  name: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  language: string;
  symbolIds: string[];
}

export type ModuleType = "package" | "workspace" | "directory";

export interface Module {
  id: string;
  name: string;
  path: string;
  type: ModuleType;
  language?: string;
  files: string[];
  entryPoints?: string[];
  dependencies?: string[];
}

export interface IndexerResult {
  symbols: CodeSymbol[];
  imports: Import[];
  blocks: Block[];
  modules: Module[];
}

export interface IndexFacts {
  symbols: CodeSymbol[];
  imports: Import[];
  blocks: Block[];
  modules: Module[];
}

export interface TaskResult {
  taskId: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  retries: number;
  validationErrors: ValidationError[];
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
  validationErrors: ValidationError[];
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

// ── Pipeline types ──

export type ScanPhase =
  | "idle"
  | "indexing"
  | "feature_extraction"
  | "agent_tasks"
  | "validation"
  | "site_generation"
  | "complete"
  | "failed";

export interface ModulePartition {
  name: string;
  files: string[];
  type: "package" | "directory" | "orphan";
}

export interface PipelineTaskRecord {
  taskId: string;
  moduleName: string;
  phase: ScanPhase;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number;
  retriesUsed: number;
  error: string | null;
  stdout: string;
  stderr: string;
  validationErrors: ValidationError[];
}

export interface ModuleResult {
  moduleName: string;
  status: "complete" | "incomplete" | "failed";
  files: string[];
  artifacts: Artifact[];
  diagnostics: string[];
}

export interface PipelineRunRecord {
  runId: string;
  snapshotId: string;
  startedAt: string;
  completedAt: string | null;
  phase: ScanPhase;
  status: "running" | "success" | "partial" | "failed";
  modules: ModuleResult[];
  tasks: PipelineTaskRecord[];
  skippedFiles: string[];
  failedTaskCount: number;
  incompleteModuleCount: number;
  validationFailureCount: number;
  config: AgentConfig;
}

export interface ArtifactValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface ScanDiagnostics {
  runId: string;
  phase: ScanPhase;
  timestamp: string;
  message: string;
  level: "info" | "warn" | "error";
  taskId?: string;
  moduleName?: string;
}
