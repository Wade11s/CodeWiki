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

export interface OverviewData {
  summary?: string;
  architecture?: string;
  technologyStack?: string[];
  entryPoints?: Array<{ path: string; description?: string }>;
  runModel?: string;
}

export interface ModuleData {
  name: string;
  path: string;
  summary: string;
  dependencies?: string[];
  incomplete?: boolean;
}

export type ModulesData = ModuleData[];

export interface FeatureData {
  name: string;
  description: string;
  evidencePaths?: string[];
  incomplete?: boolean;
}

export type FeaturesData = FeatureData[];

export interface CodeMapData {
  files?: Array<{ path: string; type?: string }>;
  symbols?: Array<{ name: string; filePath: string; line?: number }>;
  incomplete?: boolean;
}

export type PageKey = "overview" | "modules" | "features" | "code-map";
