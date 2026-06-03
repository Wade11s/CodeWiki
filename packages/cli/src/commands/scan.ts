import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  createSnapshot,
  writeSnapshot,
  loadConfig,
  writeRepoConfig,
  runIndexer,
  CodeWikiError,
  AgentRunner,
  FakeProvider,
  runPipeline,
} from "@codewiki/core";
import type { AgentRunner as AgentRunnerType } from "@codewiki/core";
import { generateSite } from "../site-generator.js";
import { shouldSkipFile, shouldSkipDir, isCodewikiIgnored, addCodewikiToGitignore, extractFeatureCandidates } from "@codewiki/core";
import type { SkippedFile, ScanConfig, FeatureCandidateGroup } from "@codewiki/core";

interface ScanOptions {
  concurrency?: string;
  timeout?: string;
  retries?: string;
  agent?: string;
  writeConfig?: boolean;
  nonInteractive?: boolean;
  _testConfirmFn?: () => Promise<boolean>;
  runner?: AgentRunnerType;
}

interface ScanResult {
  files: string[];
  skipped: SkippedFile[];
}

function scanDir(dir: string, root: string, scanConfig: ScanConfig): ScanResult {
  const files: string[] = [];
  const skipped: SkippedFile[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);

    if (entry.isDirectory()) {
      const dirResult = shouldSkipDir(relPath, root, scanConfig);
      if (dirResult.skip) {
        skipped.push({ path: relPath, reason: dirResult.reason!, metadata: dirResult.metadata });
        continue;
      }
      const sub = scanDir(fullPath, root, scanConfig);
      files.push(...sub.files);
      skipped.push(...sub.skipped);
    } else {
      const fileResult = shouldSkipFile(relPath, fullPath, root, scanConfig);
      if (fileResult.skip) {
        skipped.push({ path: relPath, reason: fileResult.reason!, metadata: fileResult.metadata });
        continue;
      }
      files.push(relPath);
    }
  }

  return { files, skipped };
}

function writeIndexArtifacts(
  codewikiDir: string,
  snapshotId: string,
  files: string[],
  skipped: SkippedFile[],
  repoPath: string,
  indexerResult: ReturnType<typeof runIndexer>,
  featureCandidates: FeatureCandidateGroup[]
): void {
  const indexDir = join(codewikiDir, "index");
  mkdirSync(indexDir, { recursive: true });

  const envelope = (data: unknown) => ({
    schemaVersion: "1.0.0",
    snapshotId,
    generatedAt: new Date().toISOString(),
    data,
  });

  writeFileSync(
    join(indexDir, "files.json"),
    JSON.stringify(envelope(files), null, 2)
  );

  writeFileSync(
    join(indexDir, "symbols.json"),
    JSON.stringify(envelope(indexerResult.symbols), null, 2)
  );

  writeFileSync(
    join(indexDir, "imports.json"),
    JSON.stringify(envelope(indexerResult.imports), null, 2)
  );

  writeFileSync(
    join(indexDir, "blocks.json"),
    JSON.stringify(envelope(indexerResult.blocks), null, 2)
  );

  writeFileSync(
    join(indexDir, "feature-candidates.json"),
    JSON.stringify(envelope(featureCandidates), null, 2)
  );

  writeFileSync(
    join(indexDir, "skipped-files.json"),
    JSON.stringify(envelope(skipped), null, 2)
  );

  writeFileSync(
    join(indexDir, "modules.json"),
    JSON.stringify(envelope(indexerResult.modules), null, 2)
  );
}

function writeArtifactFiles(
  codewikiDir: string,
  snapshotId: string,
  modules: unknown[]
): void {
  const artifactsDir = join(codewikiDir, "artifacts");
  mkdirSync(artifactsDir, { recursive: true });

  const envelope = (data: unknown) => ({
    schemaVersion: "1.0.0",
    snapshotId,
    generatedAt: new Date().toISOString(),
    data,
  });

  writeFileSync(
    join(artifactsDir, "overview.json"),
    JSON.stringify(envelope({ summary: "Overview not yet implemented" }), null, 2)
  );

  writeFileSync(
    join(artifactsDir, "modules.json"),
    JSON.stringify(envelope(modules), null, 2)
  );

  writeFileSync(
    join(artifactsDir, "features.json"),
    JSON.stringify(envelope([]), null, 2)
  );

  writeFileSync(
    join(artifactsDir, "code-map.json"),
    JSON.stringify(envelope({ files: [], symbols: [] }), null, 2)
  );
}

async function promptAddToGitignore(
  repoPath: string,
  interactive: boolean,
  confirmFn?: () => Promise<boolean>
): Promise<void> {
  if (!interactive) {
    console.warn("Warning: .codewiki is not in .gitignore. It is recommended to add it to prevent CodeWiki output from being tracked.");
    return;
  }

  try {
    let answer: boolean;
    if (confirmFn) {
      answer = await confirmFn();
    } else {
      const { confirm } = await import("@inquirer/prompts");
      answer = await confirm({ message: ".codewiki is not in .gitignore. Add it now?", default: true });
    }
    if (answer) {
      addCodewikiToGitignore(repoPath);
      console.log("Added .codewiki to .gitignore");
    }
  } catch {
    console.warn("Warning: .codewiki is not in .gitignore. It is recommended to add it to prevent CodeWiki output from being tracked.");
  }
}

function parseValidatedInt(value: string, min: number, name: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min) {
    throw new CodeWikiError(`Error: Invalid ${name} "${value}". Expected an integer >= ${min}.`);
  }
  return parsed;
}

export async function scanCommand(repoPath: string, options: ScanOptions): Promise<void> {
  if (!existsSync(repoPath)) {
    throw new CodeWikiError(`Error: Repository path does not exist: ${repoPath}`);
  }

  const config = loadConfig(repoPath);

  const concurrency = options.concurrency
    ? parseValidatedInt(options.concurrency, 1, "concurrency")
    : config.agent.concurrency;
  const timeoutSeconds = options.timeout
    ? parseValidatedInt(options.timeout, 1, "timeout")
    : config.agent.timeoutSeconds;
  const retries = options.retries
    ? parseValidatedInt(options.retries, 0, "retries")
    : config.agent.retries;
  const providerName = options.agent || config.agent.default;

  const codewikiDir = join(repoPath, ".codewiki");
  mkdirSync(codewikiDir, { recursive: true });
  mkdirSync(join(codewikiDir, "config"), { recursive: true });
  mkdirSync(join(codewikiDir, "runs"), { recursive: true });
  mkdirSync(join(codewikiDir, "site"), { recursive: true });

  const snapshot = createSnapshot(repoPath);
  writeSnapshot(repoPath, snapshot);

  const { files, skipped } = scanDir(repoPath, repoPath, config.scan);
  const indexerResult = runIndexer(repoPath, files);
  const featureCandidates = extractFeatureCandidates(repoPath, files);
  writeIndexArtifacts(codewikiDir, snapshot.id, files, skipped, repoPath, indexerResult, featureCandidates);
  writeArtifactFiles(codewikiDir, snapshot.id, indexerResult.modules);

  // Set up runner
  const runner = options.runner || new AgentRunner();
  if (!options.runner) {
    const fakeProvider = new FakeProvider(providerName);
    runner.register(fakeProvider);
  }

  const scanConfig = {
    ...config.agent,
    default: providerName,
    concurrency,
    timeoutSeconds,
    retries,
  };

  console.log(`Indexing ${files.length} files (${skipped.length} skipped)`);
  console.log(`Running pipeline with concurrency=${concurrency}, timeout=${timeoutSeconds}s, retries=${retries}`);

  const { runRecord } = await runPipeline({
    repoPath,
    snapshot,
    files,
    skippedFiles: skipped.map((s) => s.path),
    config: scanConfig,
    providerName,
    runner,
    codewikiDir,
    indexerModules: indexerResult.modules,
  });

  if (options.writeConfig) {
    writeRepoConfig(repoPath, {
      agent: scanConfig,
    });
  }

  const siteResult = generateSite(repoPath);
  if (siteResult.success) {
    console.log(`Site: ${siteResult.siteDir}`);
  }
  if (siteResult.errors.length > 0) {
    console.error(`Site generation warnings:`);
    for (const err of siteResult.errors) {
      console.error(`  - ${err}`);
    }
  }

  // Check if .codewiki is ignored
  if (!isCodewikiIgnored(repoPath)) {
    const isInteractive = !options.nonInteractive && config.scan.interactiveConfig;
    await promptAddToGitignore(repoPath, isInteractive, options._testConfirmFn);
  }

  console.log(`Scanned ${files.length} files`);
  console.log(`Snapshot: ${snapshot.id}`);
  console.log(`Run: ${runRecord.runId}`);
  console.log(`Git head: ${snapshot.gitHead || "(not a git repo)"}`);
  console.log(`Dirty: ${snapshot.gitDirty}`);
  console.log(`Schema version: ${snapshot.schemaVersion}`);
  console.log(`Modules: ${runRecord.modules.length}`);
  console.log(`Complete: ${runRecord.modules.filter((m) => m.status === "complete").length}`);
  console.log(`Incomplete: ${runRecord.incompleteModuleCount}`);
  console.log(`Failed tasks: ${runRecord.failedTaskCount}`);
  console.log(`Status: ${runRecord.status}`);
}
