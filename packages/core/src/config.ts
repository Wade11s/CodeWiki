import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeWikiConfig } from "./types.js";
import { CodeWikiConfigSchema } from "./schema.js";

export const DEFAULT_CONFIG: CodeWikiConfig = {
  agent: {
    default: "codex",
    concurrency: 2,
    timeoutSeconds: 600,
    retries: 1,
  },
  scan: {
    interactiveConfig: true,
  },
};

export function loadConfig(repoPath?: string): CodeWikiConfig {
  let merged = { ...DEFAULT_CONFIG };

  // TODO: Load user-level config from ~/.codewiki/config.json

  if (repoPath) {
    const repoConfigPath = join(repoPath, ".codewiki", "config.json");
    if (existsSync(repoConfigPath)) {
      try {
        const raw = readFileSync(repoConfigPath, "utf-8");
        const parsed = JSON.parse(raw);
        merged = { ...merged, ...parsed };
      } catch {
        // ignore invalid repo config
      }
    }
  }

  const result = CodeWikiConfigSchema.safeParse(merged);
  return result.success ? result.data : DEFAULT_CONFIG;
}

export function writeRepoConfig(repoPath: string, config: Partial<CodeWikiConfig>): void {
  const codewikiDir = join(repoPath, ".codewiki");
  if (!existsSync(codewikiDir)) {
    mkdirSync(codewikiDir, { recursive: true });
  }
  const configPath = join(codewikiDir, "config.json");
  const current = loadConfig(repoPath);
  const merged = { ...current, ...config };
  writeFileSync(configPath, JSON.stringify(merged, null, 2));
}
