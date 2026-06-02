import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createSnapshot, writeSnapshot, loadConfig, writeRepoConfig } from "@codewiki/core";

function shouldSkip(relPath: string): boolean {
  const skip = [
    "node_modules",
    ".git",
    ".codewiki",
    "dist",
    "build",
    "coverage",
    ".next",
    ".turbo",
    ".venv",
    "__pycache__",
  ];
  const parts = relPath.split(/[/\\]/);
  return skip.some((s) => parts.includes(s));
}

function listFiles(dir: string, root: string): string[] {
  const result: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);
    if (shouldSkip(relPath)) continue;
    if (entry.isDirectory()) {
      result.push(...listFiles(fullPath, root));
    } else {
      result.push(relPath);
    }
  }
  return result;
}

function writeIndexArtifacts(codewikiDir: string, snapshotId: string, files: string[]): void {
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
    JSON.stringify(envelope([]), null, 2)
  );

  writeFileSync(
    join(indexDir, "imports.json"),
    JSON.stringify(envelope([]), null, 2)
  );

  writeFileSync(
    join(indexDir, "blocks.json"),
    JSON.stringify(envelope([]), null, 2)
  );

  writeFileSync(
    join(indexDir, "feature-candidates.json"),
    JSON.stringify(envelope([]), null, 2)
  );

  writeFileSync(
    join(indexDir, "skipped-files.json"),
    JSON.stringify(envelope([]), null, 2)
  );
}

function writeArtifactFiles(codewikiDir: string, snapshotId: string): void {
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
    JSON.stringify(envelope([]), null, 2)
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

interface ScanOptions {
  concurrency?: string;
  timeout?: string;
  retries?: string;
  writeConfig?: boolean;
}

export async function scanCommand(repoPath: string, options: ScanOptions): Promise<void> {
  if (!existsSync(repoPath)) {
    console.error(`Error: Repository path does not exist: ${repoPath}`);
    process.exit(1);
  }

  const config = loadConfig(repoPath);

  const concurrency = options.concurrency ? parseInt(options.concurrency, 10) : config.agent.concurrency;
  const timeoutSeconds = options.timeout ? parseInt(options.timeout, 10) : config.agent.timeoutSeconds;
  const retries = options.retries ? parseInt(options.retries, 10) : config.agent.retries;

  const codewikiDir = join(repoPath, ".codewiki");
  mkdirSync(codewikiDir, { recursive: true });

  const snapshot = createSnapshot(repoPath);
  writeSnapshot(repoPath, snapshot);

  const files = listFiles(repoPath, repoPath);
  writeIndexArtifacts(codewikiDir, snapshot.id, files);
  writeArtifactFiles(codewikiDir, snapshot.id);

  if (options.writeConfig) {
    writeRepoConfig(repoPath, {
      agent: {
        ...config.agent,
        concurrency,
        timeoutSeconds,
        retries,
      },
    });
  }

  console.log(`Scanned ${files.length} files`);
  console.log(`Snapshot: ${snapshot.id}`);
  console.log(`Git head: ${snapshot.gitHead || "(not a git repo)"}`);
  console.log(`Dirty: ${snapshot.gitDirty}`);
  console.log(`Schema version: ${snapshot.schemaVersion}`);
}
