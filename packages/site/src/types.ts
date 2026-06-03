export interface Snapshot {
  id: string;
  schemaVersion: string;
  createdAt: string;
  repoPath: string;
  gitHead: string | null;
  gitDirty: boolean;
  fileCount: number;
  parserVersion: string;
  agentVersion: string;
}

export interface ArtifactEnvelope<T> {
  schemaVersion: string;
  snapshotId: string;
  generatedAt: string;
  data: T;
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
  type?: "overview";
  summary?: string;
  architecture?: string;
  technologyStack?: string[];
  entryPoints?: Array<{ path: string; description?: string }>;
  runModel?: string;
  modulesAnalyzed?: number;
  modulesComplete?: number;
  modulesFailed?: number;
  totalFiles?: number;
  skippedFiles?: number;
  claims?: Claim[];
}

export interface ModuleData {
  type?: "module";
  name: string;
  path?: string;
  summary: string;
  dependencies?: string[];
  incomplete?: boolean;
  keyFeatures?: string[];
  complexity?: "low" | "medium" | "high";
  claims?: Claim[];
}

export type ModulesData = ModuleData[];

export interface FeatureData {
  type?: "feature";
  id: string;
  category: string;
  name: string;
  description?: string;
  claims: Claim[];
}

export type FeaturesData = FeatureData[];

export interface CodeMapData {
  type?: "code-map";
  files: Array<{ path: string; module: string }>;
  modules: Array<{ name: string; type: string; fileCount: number }>;
  claims?: Claim[];
  incomplete?: boolean;
}

export type PageKey = "overview" | "modules" | "features" | "code-map";
