import { readFileSync, statSync, openSync, readSync, closeSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { ScanConfig, SkipReason } from "./types.js";

const DEFAULT_SKIP_DIRS = [
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
  ".tox",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".egg-info",
  ".eggs",
  "vendor",
  "target",
  "out",
];

const GENERATED_PATTERNS = [
  /\.min\.(js|css)$/,
  /\.d\.ts$/,
  /\.map$/,
  /\.generated\./,
  /\.g\./,
];

const OVERSIZED_MAX_BYTES = 1024 * 1024; // 1 MB

const gitignoreCache = new Map<string, string[]>();

function parseGitignoreLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  return trimmed;
}

function readGitignorePatterns(repoPath: string): string[] {
  const cached = gitignoreCache.get(repoPath);
  if (cached) return cached;

  const gitignorePath = join(repoPath, ".gitignore");
  try {
    const content = readFileSync(gitignorePath, "utf-8");
    const patterns = content.split("\n").map(parseGitignoreLine).filter((p): p is string => p !== null);
    gitignoreCache.set(repoPath, patterns);
    return patterns;
  } catch {
    gitignoreCache.set(repoPath, []);
    return [];
  }
}

export function clearGitignoreCache(repoPath?: string): void {
  if (repoPath) {
    gitignoreCache.delete(repoPath);
  } else {
    gitignoreCache.clear();
  }
}

function matchPattern(pattern: string, relPath: string): boolean {
  // Handle negation patterns by returning false (caller handles negation)
  if (pattern.startsWith("!")) return false;

  const isDirPattern = pattern.endsWith("/");
  const cleanPattern = isDirPattern ? pattern.slice(0, -1) : pattern;
  const parts = relPath.split(/[/\\]/);
  const pathParts = isDirPattern ? parts.slice(0, -1) : parts;

  // Convert glob pattern to regex
  let regexPattern = cleanPattern;

  // Handle root-relative patterns
  const isRootRelative = regexPattern.startsWith("/");
  if (isRootRelative) {
    regexPattern = regexPattern.slice(1);
  }

  // Handle **/ prefix
  const anyDepth = regexPattern.startsWith("**/");
  if (anyDepth) {
    regexPattern = regexPattern.slice(3);
  }

  // Escape regex special chars except * and ?
  regexPattern = regexPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/\\\\]*")
    .replace(/\?/g, "[^/\\\\]");

  // Root-relative patterns match only at the root — no prefix wildcard
  const prefix = isRootRelative ? "" : "(?:.*/)?";
  const regex = new RegExp(`^${prefix}${regexPattern}$`);

  if (anyDepth) {
    return regex.test(relPath) || pathParts.some((part) => regex.test(part));
  }

  // Root-relative patterns match only against the full path from root
  if (isRootRelative) {
    return regex.test(relPath);
  }

  // Non-root-relative patterns match against the full path or individual parts
  return regex.test(relPath) || pathParts.some((part) => regex.test(part));
}

function isIgnoredByParsedGitignore(relPath: string, patterns: string[]): boolean {
  let ignored = false;
  for (const pattern of patterns) {
    if (pattern.startsWith("!")) {
      if (matchPattern(pattern.slice(1), relPath)) {
        ignored = false;
      }
    } else {
      if (matchPattern(pattern, relPath)) {
        ignored = true;
      }
    }
  }
  return ignored;
}

function isGitRepo(repoPath: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

export function isIgnoredByGit(relPath: string, repoPath: string): boolean {
  if (!isGitRepo(repoPath)) return false;
  try {
    execFileSync("git", ["check-ignore", "-q", relPath], {
      cwd: repoPath,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function isDefaultSkipped(relPath: string): boolean {
  const parts = relPath.split(/[/\\]/);
  return DEFAULT_SKIP_DIRS.some((s) => parts.includes(s));
}

function isExcludedByConfig(relPath: string, exclude: string[]): boolean {
  return exclude.some((pattern) => matchPattern(pattern, relPath));
}

function isIncludedByConfig(relPath: string, include: string[]): boolean {
  if (include.length === 0) return true;
  return include.some((pattern) => matchPattern(pattern, relPath));
}

export function isBinary(filePath: string): boolean {
  const fd = openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(8192);
    const bytesRead = readSync(fd, buffer, 0, 8192, 0);
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    closeSync(fd);
  }
}

export function isOversized(filePath: string, maxBytes = OVERSIZED_MAX_BYTES): boolean {
  try {
    const stats = statSync(filePath);
    return stats.size > maxBytes;
  } catch {
    return false;
  }
}

export function isGenerated(relPath: string): boolean {
  return GENERATED_PATTERNS.some((pattern) => pattern.test(relPath));
}

export interface SkipResult {
  skip: boolean;
  reason?: SkipReason;
  metadata?: Record<string, unknown>;
}

export function shouldSkipFile(
  relPath: string,
  fullPath: string,
  repoPath: string,
  config: ScanConfig
): SkipResult {
  // 1. Default skip directories
  if (isDefaultSkipped(relPath)) {
    return { skip: true, reason: "ignored", metadata: { source: "default" } };
  }

  // 2. Gitignore
  const gitignorePatterns = readGitignorePatterns(repoPath);
  if (isIgnoredByParsedGitignore(relPath, gitignorePatterns)) {
    return { skip: true, reason: "ignored", metadata: { source: "gitignore" } };
  }

  // 3. Config exclude rules
  const exclude = config.exclude ?? [];
  if (isExcludedByConfig(relPath, exclude)) {
    return { skip: true, reason: "ignored", metadata: { source: "config" } };
  }

  // 4. Config include rules (whitelist)
  const include = config.include ?? [];
  if (include.length > 0 && !isIncludedByConfig(relPath, include)) {
    return { skip: true, reason: "ignored", metadata: { source: "config", rule: "include" } };
  }

  // 5. Generated files
  if (isGenerated(relPath)) {
    return { skip: true, reason: "generated", metadata: { pattern: "generated-file" } };
  }

  // 6. Binary files
  if (isBinary(fullPath)) {
    const stats = statSync(fullPath);
    return { skip: true, reason: "binary", metadata: { size: stats.size } };
  }

  // 7. Oversized files
  if (isOversized(fullPath)) {
    const stats = statSync(fullPath);
    return { skip: true, reason: "oversized", metadata: { size: stats.size, maxSize: OVERSIZED_MAX_BYTES } };
  }

  return { skip: false };
}

export function shouldSkipDir(
  relPath: string,
  repoPath: string,
  config: ScanConfig
): SkipResult {
  // 1. Default skip directories
  if (isDefaultSkipped(relPath)) {
    return { skip: true, reason: "ignored", metadata: { source: "default" } };
  }

  // 2. Gitignore
  const gitignorePatterns = readGitignorePatterns(repoPath);
  if (isIgnoredByParsedGitignore(relPath, gitignorePatterns)) {
    return { skip: true, reason: "ignored", metadata: { source: "gitignore" } };
  }

  // 3. Config exclude rules
  const exclude = config.exclude ?? [];
  if (isExcludedByConfig(relPath, exclude)) {
    return { skip: true, reason: "ignored", metadata: { source: "config" } };
  }

  return { skip: false };
}

export function isCodewikiIgnored(repoPath: string): boolean {
  const gitignorePatterns = readGitignorePatterns(repoPath);
  return isIgnoredByParsedGitignore(".codewiki", gitignorePatterns) || isIgnoredByParsedGitignore(".codewiki/", gitignorePatterns);
}

export function addCodewikiToGitignore(repoPath: string): void {
  const gitignorePath = join(repoPath, ".gitignore");
  let content = "";
  try {
    content = readFileSync(gitignorePath, "utf-8");
    if (!content.endsWith("\n")) content += "\n";
  } catch {
    // .gitignore doesn't exist yet
  }
  content += ".codewiki\n";
  writeFileSync(gitignorePath, content);
  clearGitignoreCache(repoPath);
}
