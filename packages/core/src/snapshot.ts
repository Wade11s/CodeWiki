import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, statSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative } from "node:path";
import type { Snapshot } from "./types.js";

function countFiles(dir: string, root: string, count = 0): number {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);
    if (shouldSkip(relPath)) continue;
    if (entry.isDirectory()) {
      count = countFiles(fullPath, root, count);
    } else {
      count++;
    }
  }
  return count;
}

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

  const fileCount = existsSync(repoPath) ? countFiles(repoPath, repoPath) : 0;

  const snapshot: Snapshot = {
    id: randomUUID(),
    schemaVersion: "1.0.0",
    createdAt: new Date().toISOString(),
    repoPath,
    gitHead,
    gitDirty,
    fileCount,
    parserVersion: "0.1.0",
    agentVersion: "0.1.0",
  };

  return snapshot;
}

export function writeSnapshot(repoPath: string, snapshot: Snapshot): void {
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
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}
