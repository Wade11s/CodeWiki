import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  AgentConfig,
  Artifact,
  Evidence,
  ModuleData,
  ModulePartition,
  ModuleResult,
  PipelineRunRecord,
  PipelineTaskRecord,
  Snapshot,
} from "./types.js";
import { AgentRunner } from "./agent-runner.js";
import { validateArtifact, loadIndexFacts } from "./validation.js";
import type { ValidationError } from "./types.js";

export function partitionModules(files: string[]): ModulePartition[] {
  // Collect all directories that contain a package.json
  const packageDirs = new Set<string>();
  for (const file of files) {
    if (basename(file) === "package.json") {
      const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
      packageDirs.add(dir);
    }
  }

  const byPackage = new Map<string, string[]>();
  const byDirectory = new Map<string, string[]>();

  for (const file of files) {
    // Walk up the directory tree to find the nearest package.json
    let assignedPackage: string | null = null;
    let currentDir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "";
    while (currentDir !== "") {
      if (packageDirs.has(currentDir)) {
        assignedPackage = currentDir;
        break;
      }
      currentDir = currentDir.includes("/") ? currentDir.slice(0, currentDir.lastIndexOf("/")) : "";
    }
    // Check root-level package.json
    if (assignedPackage === null && packageDirs.has("")) {
      assignedPackage = "";
    }

    if (assignedPackage !== null) {
      const pkgName = assignedPackage === "" ? "root-package" : assignedPackage;
      const existing = byPackage.get(pkgName);
      if (existing) {
        existing.push(file);
      } else {
        byPackage.set(pkgName, [file]);
      }
      continue;
    }

    // Fall back to top-level directory grouping
    const parts = file.split(/[/\\]/);
    const dir = parts.length > 1 ? parts[0] : extname(file) || "root";
    const existing = byDirectory.get(dir);
    if (existing) {
      existing.push(file);
    } else {
      byDirectory.set(dir, [file]);
    }
  }

  const modules: ModulePartition[] = [];

  for (const [pkgDir, pkgFiles] of byPackage.entries()) {
    modules.push({
      name: pkgDir,
      files: pkgFiles,
      type: "package",
    });
  }

  for (const [dir, dirFiles] of byDirectory.entries()) {
    const alreadyGrouped = dirFiles.some((f) =>
      modules.some((m) => m.files.includes(f))
    );
    if (alreadyGrouped) continue;

    modules.push({
      name: dir,
      files: dirFiles,
      type: dir === extname(dirFiles[0] || "") ? "orphan" : "directory",
    });
  }

  const allGrouped = new Set(modules.flatMap((m) => m.files));
  const orphans = files.filter((f) => !allGrouped.has(f));
  if (orphans.length > 0) {
    modules.push({
      name: "orphan-files",
      files: orphans,
      type: "orphan",
    });
  }

  return modules;
}

export function extractPipelineFeatureCandidates(files: string[]): Array<{
  filePath: string;
  candidateType: string;
  confidence: number;
}> {
  const candidates: Array<{ filePath: string; candidateType: string; confidence: number }> = [];
  for (const file of files) {
    const base = basename(file);
    const ext = extname(file);
    if (base === "package.json") {
      candidates.push({ filePath: file, candidateType: "package-manifest", confidence: 1.0 });
    } else if (base.match(/\.(test|spec)\.|_(test|spec)\./)) {
      candidates.push({ filePath: file, candidateType: "test-file", confidence: 0.9 });
    } else if (base.match(/^README|CHANGELOG|CONTRIBUTING|LICENSE/)) {
      candidates.push({ filePath: file, candidateType: "documentation", confidence: 0.9 });
    } else if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx") {
      candidates.push({ filePath: file, candidateType: "source-code", confidence: 0.8 });
    } else if (ext === ".json" || ext === ".yaml" || ext === ".yml" || ext === ".toml") {
      candidates.push({ filePath: file, candidateType: "config-file", confidence: 0.6 });
    }
  }
  return candidates;
}

export function createArtifact(
  snapshotId: string,
  type: string,
  data: unknown
): Artifact {
  return {
    schemaVersion: "1.0.0",
    snapshotId,
    generatedAt: new Date().toISOString(),
    data: { type, ...(typeof data === "object" && data !== null ? data : { value: data }) as Record<string, unknown> },
  };
}

export function createRunRecord(
  snapshotId: string,
  config: AgentConfig,
  modules: ModulePartition[]
): PipelineRunRecord {
  const runId = randomUUID();
  const now = new Date().toISOString();

  return {
    runId,
    snapshotId,
    startedAt: now,
    completedAt: null,
    phase: "idle",
    status: "running",
    modules: modules.map((m) => ({
      moduleName: m.name,
      status: "incomplete" as const,
      files: m.files,
      artifacts: [],
      diagnostics: [],
    })),
    tasks: [],
    skippedFiles: [],
    failedTaskCount: 0,
    incompleteModuleCount: modules.length,
    validationFailureCount: 0,
    config,
  };
}

export function writeRunRecord(codewikiDir: string, run: PipelineRunRecord): void {
  const runsDir = join(codewikiDir, "pipeline-runs");
  const runDir = join(runsDir, run.runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "run.json"), JSON.stringify(run, null, 2));
}

export function writeTaskRecord(
  codewikiDir: string,
  runId: string,
  task: PipelineTaskRecord
): void {
  const tasksDir = join(codewikiDir, "pipeline-runs", runId, "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(
    join(tasksDir, `${task.taskId}.json`),
    JSON.stringify(task, null, 2)
  );
}

export function readLatestRun(codewikiDir: string): PipelineRunRecord | null {
  const runsDir = join(codewikiDir, "pipeline-runs");
  if (!existsSync(runsDir)) return null;

  const runIds = readdirSync(runsDir).filter((id) => {
    const runPath = join(runsDir, id, "run.json");
    return existsSync(runPath);
  });

  if (runIds.length === 0) return null;

  const sorted = runIds.sort((a, b) => {
    const statA = statSync(join(runsDir, a, "run.json"));
    const statB = statSync(join(runsDir, b, "run.json"));
    return statB.mtimeMs - statA.mtimeMs;
  });

  try {
    const raw = readFileSync(join(runsDir, sorted[0], "run.json"), "utf-8");
    return JSON.parse(raw) as PipelineRunRecord;
  } catch {
    return null;
  }
}

export interface PipelineOptions {
  repoPath: string;
  snapshot: Snapshot;
  files: string[];
  skippedFiles: string[];
  config: AgentConfig;
  providerName: string;
  runner: AgentRunner;
  codewikiDir: string;
  indexerModules?: import("./types.js").Module[];
}

export interface PipelineResult {
  runRecord: PipelineRunRecord;
  artifacts: Artifact[];
}

export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { repoPath, snapshot, files, skippedFiles, config, providerName, runner, codewikiDir, indexerModules } = options;

  const featureCandidates = extractPipelineFeatureCandidates(files);
  const modules = partitionModules(files);

  const runRecord = createRunRecord(snapshot.id, config, modules);
  runRecord.skippedFiles = skippedFiles;
  runRecord.phase = "agent_tasks";
  writeRunRecord(codewikiDir, runRecord);

  const moduleTasks: Array<{
    taskId: string;
    moduleName: string;
    prompt: string;
    inputArtifacts: string[];
    outputSchema: string;
  }> = [];

  for (const mod of modules) {
    const taskId = `${mod.name.replace(/[/\\]/g, "-")}-${randomUUID().slice(0, 8)}`;
    const prompt = `Analyze the following module and produce a structured summary.

Module: ${mod.name}
Files: ${mod.files.join("\n")}

Produce JSON with:
- summary: string
- keyFeatures: string[]
- complexity: "low" | "medium" | "high"
- evidence: array of { filePath, lineStart, lineEnd, snippet }`;

    moduleTasks.push({
      taskId,
      moduleName: mod.name,
      prompt,
      inputArtifacts: mod.files,
      outputSchema: "module-summary",
    });
  }

  const taskResults = await runner.runTasksInParallel(providerName, moduleTasks, {
    timeoutSeconds: config.timeoutSeconds,
    retries: config.retries,
    concurrency: config.concurrency,
  });

  const allArtifacts: Artifact[] = [];
  runRecord.phase = "validation";

  for (let i = 0; i < moduleTasks.length; i++) {
    const taskDef = moduleTasks[i];
    const result = taskResults[i];
    const modResult = runRecord.modules.find((m) => m.moduleName === taskDef.moduleName)!;

    const taskRecord: PipelineTaskRecord = {
      taskId: taskDef.taskId,
      moduleName: taskDef.moduleName,
      phase: "agent_tasks",
      status: result.exitCode === 0 ? "success" : "failed",
      startedAt: runRecord.startedAt,
      completedAt: new Date().toISOString(),
      durationMs: result.durationMs,
      retriesUsed: result.retries,
      error: result.exitCode !== 0 ? result.stderr : null,
      stdout: result.stdout,
      stderr: result.stderr,
      validationErrors: [] as ValidationError[],
    };

    if (result.exitCode !== 0) {
      runRecord.failedTaskCount++;
      modResult.status = "failed";
      modResult.diagnostics.push(`Task failed: ${result.stderr}`);
      writeTaskRecord(codewikiDir, runRecord.runId, taskRecord);
      runRecord.tasks.push(taskRecord);
      continue;
    }

    let artifactData: unknown;
    try {
      artifactData = JSON.parse(result.stdout);
    } catch {
      artifactData = { summary: result.stdout };
    }

    const artifact = createArtifact(snapshot.id, "module-summary", artifactData);

    // Load index facts for evidence resolution
    const indexFacts = loadIndexFacts(codewikiDir) || { symbols: [], imports: [], blocks: [], modules: [] };
    const validation = validateArtifact(artifact, snapshot.id, indexFacts, {
      requireEvidence: true,
    });

    taskRecord.validationErrors = validation.errors;
    runRecord.tasks.push(taskRecord);
    writeTaskRecord(codewikiDir, runRecord.runId, taskRecord);

    if (!validation.valid) {
      runRecord.validationFailureCount++;
      modResult.status = "incomplete";
      modResult.diagnostics.push(`Validation failed: ${validation.errors.map((e) => `[${e.code}] ${e.message}`).join("; ")}`);
      continue;
    }

    modResult.artifacts.push(artifact);
    modResult.status = "complete";
    allArtifacts.push(artifact);
  }

  runRecord.incompleteModuleCount = runRecord.modules.filter(
    (m) => m.status !== "complete"
  ).length;

  runRecord.phase = "site_generation";

  const artifactsDir = join(codewikiDir, "artifacts");
  mkdirSync(artifactsDir, { recursive: true });

  // Build enriched module artifacts combining indexer data with agent analysis
  const enrichedModules: ModuleData[] = [];
  for (const modResult of runRecord.modules) {
    // Find matching indexer module by file overlap
    const indexerModule = indexerModules?.find((im) =>
      modResult.files.length > 0 && modResult.files.every((f) => im.files.includes(f))
    );

    // Find task output for this module
    const task = runRecord.tasks.find((t) => t.moduleName === modResult.moduleName);
    let agentOutput: {
      summary?: string;
      keyFeatures?: string[];
      complexity?: string;
      evidence?: Array<{ filePath?: string; lineStart?: number; lineEnd?: number; snippet?: string }>;
    } = {};

    if (task && task.status === "success" && modResult.status === "complete") {
      try {
        agentOutput = JSON.parse(task.stdout);
      } catch {
        agentOutput = { summary: task.stdout };
      }
    }

    const evidence: Evidence[] = (agentOutput.evidence || []).map((e) => ({
      filePath: e.filePath || "",
      lineStart: e.lineStart || 1,
      lineEnd: e.lineEnd || 1,
      snippet: e.snippet || "",
    }));

    enrichedModules.push({
      type: "module",
      name: indexerModule?.name || modResult.moduleName,
      path: indexerModule?.path || modResult.moduleName,
      summary: agentOutput.summary || "",
      files: indexerModule?.files || modResult.files,
      dependencies: indexerModule?.dependencies,
      incomplete: modResult.status !== "complete",
      keyFeatures: agentOutput.keyFeatures || [],
      complexity: agentOutput.complexity as "low" | "medium" | "high" | undefined,
      claims: agentOutput.summary
        ? [{ statement: agentOutput.summary, evidence }]
        : [],
    });
  }

  const modulesArtifact: Artifact = {
    schemaVersion: "1.0.0",
    snapshotId: snapshot.id,
    generatedAt: new Date().toISOString(),
    data: enrichedModules,
  };

  // Synthetic artifacts are system-generated and don't require evidence,
  // but we still validate envelope fields and snapshot binding.
  const indexFactsForSynthetic = loadIndexFacts(codewikiDir) || { symbols: [], imports: [], blocks: [], modules: [] };

  const overviewArtifact = createArtifact(snapshot.id, "overview", {
    summary: `Repository overview for ${basename(repoPath)}`,
    modulesAnalyzed: modules.length,
    modulesComplete: modules.length - runRecord.incompleteModuleCount,
    modulesFailed: runRecord.modules.filter((m) => m.status === "failed").length,
    totalFiles: files.length,
    skippedFiles: skippedFiles.length,
  });
  const overviewValidation = validateArtifact(overviewArtifact, snapshot.id, indexFactsForSynthetic, { requireEvidence: false });
  if (!overviewValidation.valid) {
    runRecord.validationFailureCount++;
  }
  allArtifacts.push(overviewArtifact);

  const featuresArtifact = createArtifact(snapshot.id, "features", {
    candidates: featureCandidates,
    total: featureCandidates.length,
  });
  const featuresValidation = validateArtifact(featuresArtifact, snapshot.id, indexFactsForSynthetic, { requireEvidence: false });
  if (!featuresValidation.valid) {
    runRecord.validationFailureCount++;
  }
  allArtifacts.push(featuresArtifact);

  const codeMapArtifact = createArtifact(snapshot.id, "code-map", {
    files: files.map((f) => ({ path: f, module: modules.find((m) => m.files.includes(f))?.name || "unknown" })),
    modules: modules.map((m) => ({ name: m.name, type: m.type, fileCount: m.files.length })),
  });
  const codeMapValidation = validateArtifact(codeMapArtifact, snapshot.id, indexFactsForSynthetic, { requireEvidence: false });
  if (!codeMapValidation.valid) {
    runRecord.validationFailureCount++;
  }
  allArtifacts.push(codeMapArtifact);

  writeFileSync(
    join(artifactsDir, "modules.json"),
    JSON.stringify(modulesArtifact, null, 2)
  );
  writeFileSync(
    join(artifactsDir, "overview.json"),
    JSON.stringify(overviewArtifact, null, 2)
  );
  writeFileSync(
    join(artifactsDir, "features.json"),
    JSON.stringify(featuresArtifact, null, 2)
  );
  writeFileSync(
    join(artifactsDir, "code-map.json"),
    JSON.stringify(codeMapArtifact, null, 2)
  );

  runRecord.completedAt = new Date().toISOString();
  runRecord.status = runRecord.incompleteModuleCount > 0
    ? (runRecord.incompleteModuleCount === modules.length ? "failed" : "partial")
    : "success";
  runRecord.phase = runRecord.status === "failed" ? "failed" : "complete";
  writeRunRecord(codewikiDir, runRecord);

  return { runRecord, artifacts: allArtifacts };
}
