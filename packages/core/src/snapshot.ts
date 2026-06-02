import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, statSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";
import type { Snapshot, ScanConfig } from "./types.js";
import { shouldSkipDir } from "./ignore.js";
import { loadConfig } from "./config.js";
import { SnapshotSchema } from "./schema.js";

function countFiles(dir: string, root: string, config: ScanConfig, count = 0): number {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);
    if (shouldSkipDir(relPath, root, config).skip) continue;
    if (entry.isDirectory()) {
      count = countFiles(fullPath, root, config, count);
    } else {
      count++;
    }
  }
  return count;
}

export function shouldSkip(relPath: string): boolean {
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

function hashFile(filePath: string): string {
  const data = readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

function walkFiles(
  dir: string,
  root: string,
  onFile: (relPath: string, fullPath: string) => void
): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);
    if (shouldSkip(relPath)) continue;
    if (entry.isDirectory()) {
      walkFiles(fullPath, root, onFile);
    } else {
      onFile(relPath, fullPath);
    }
  }
}

function computeFileHashes(repoPath: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  if (!existsSync(repoPath)) return hashes;
  walkFiles(repoPath, repoPath, (relPath, fullPath) => {
    hashes[relPath] = hashFile(fullPath);
  });
  return hashes;
}

export function createSnapshot(repoPath: string): Snapshot {
  let gitHead: string | null = null;
  let gitDirty = false;
  try {
    gitHead = execSync("git rev-parse HEAD", {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    const status = execSync("git status --porcelain", {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    gitDirty = status.length > 0;
  } catch {
    // not a git repo or git not available
  }

  const config = loadConfig(repoPath);
  const fileCount = existsSync(repoPath) ? countFiles(repoPath, repoPath, config.scan) : 0;
  const fileHashes = computeFileHashes(repoPath);

  const snapshot: Snapshot = {
    id: randomUUID(),
    schemaVersion: "1.0.0",
    createdAt: new Date().toISOString(),
    repoPath,
    gitHead,
    gitDirty,
    fileCount,
    fileHashes,
    parserVersion: "0.1.0",
    agentVersion: "0.1.0",
  };

  return snapshot;
}

export function isSnapshotStale(repoPath: string, snapshot: Snapshot): boolean {
  const currentHashes = computeFileHashes(repoPath);
  const snapshotHashes = snapshot.fileHashes;

  const currentKeys = Object.keys(currentHashes).sort();
  const snapshotKeys = Object.keys(snapshotHashes).sort();

  if (currentKeys.length !== snapshotKeys.length) return true;
  for (let i = 0; i < currentKeys.length; i++) {
    if (currentKeys[i] !== snapshotKeys[i]) return true;
  }
  for (const key of currentKeys) {
    if (currentHashes[key] !== snapshotHashes[key]) return true;
  }
  return false;
}

export function writeSnapshot(repoPath: string, snapshot: Snapshot): void {
  SnapshotSchema.parse(snapshot);
  const codewikiDir = join(repoPath, ".codewiki");
  if (!existsSync(codewikiDir)) {
    mkdirSync(codewikiDir, { recursive: true });
  }
  writeFileSync(
    join(codewikiDir, "snapshot.json"),
    JSON.stringify(snapshot, null, 2)
  );
}

export function readSnapshot(repoPath: string): Snapshot | null {
  const path = join(repoPath, ".codewiki", "snapshot.json");
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = SnapshotSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
