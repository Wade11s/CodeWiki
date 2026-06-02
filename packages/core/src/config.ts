import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CodeWikiConfig, ConfigSource, EffectiveAgentConfig, EffectiveScanConfig } from "./types.js";
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
    include: [],
    exclude: [],
  },
};

function getUserConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  return join(home, ".codewiki", "config.json");
}

function readConfigFile(path: string): Partial<CodeWikiConfig> | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as Partial<CodeWikiConfig>;
  } catch {
    return null;
  }
}

function deepMergeAgent(
  base: CodeWikiConfig["agent"],
  override: Partial<CodeWikiConfig["agent"]>
): CodeWikiConfig["agent"] {
  return {
    default: override.default ?? base.default,
    concurrency: override.concurrency ?? base.concurrency,
    timeoutSeconds: override.timeoutSeconds ?? base.timeoutSeconds,
    retries: override.retries ?? base.retries,
  };
}

function deepMergeScan(
  base: CodeWikiConfig["scan"],
  override: Partial<CodeWikiConfig["scan"]>
): CodeWikiConfig["scan"] {
  return {
    interactiveConfig: override.interactiveConfig ?? base.interactiveConfig,
  };
}

function isDefined(value: unknown): boolean {
  return value !== undefined && value !== null;
}

export function loadConfig(repoPath?: string): CodeWikiConfig {
  let merged: CodeWikiConfig = {
    agent: { ...DEFAULT_CONFIG.agent },
    scan: { ...DEFAULT_CONFIG.scan },
  };

  const userConfigPath = getUserConfigPath();
  const userConfig = readConfigFile(userConfigPath);
  if (userConfig) {
    merged = {
      agent: deepMergeAgent(merged.agent, userConfig.agent ?? {}),
      scan: deepMergeScan(merged.scan, userConfig.scan ?? {}),
    };
  }

  if (repoPath) {
    const repoConfigPath = join(repoPath, ".codewiki", "config.json");
    const repoConfig = readConfigFile(repoConfigPath);
    if (repoConfig) {
      merged = {
        agent: deepMergeAgent(merged.agent, repoConfig.agent ?? {}),
        scan: deepMergeScan(merged.scan, repoConfig.scan ?? {}),
      };
    }
  }

  const result = CodeWikiConfigSchema.safeParse(merged);
  return result.success ? result.data : DEFAULT_CONFIG;
}

function getConfigSource(
  key: keyof CodeWikiConfig["agent"],
  repoPath: string | undefined,
  userValue: unknown,
  repoValue: unknown
): ConfigSource {
  if (repoPath && isDefined(repoValue)) return "repo";
  if (isDefined(userValue)) return "user";
  return "default";
}

export function loadConfigWithSources(repoPath?: string): {
  agent: EffectiveAgentConfig;
  scan: EffectiveScanConfig;
} {
  let merged: CodeWikiConfig = {
    agent: { ...DEFAULT_CONFIG.agent },
    scan: { ...DEFAULT_CONFIG.scan },
  };

  const userConfigPath = getUserConfigPath();
  const userConfig = readConfigFile(userConfigPath);
  if (userConfig) {
    merged = {
      agent: deepMergeAgent(merged.agent, userConfig.agent ?? {}),
      scan: deepMergeScan(merged.scan, userConfig.scan ?? {}),
    };
  }

  let repoConfig: Partial<CodeWikiConfig> | null = null;
  if (repoPath) {
    const repoConfigPath = join(repoPath, ".codewiki", "config.json");
    repoConfig = readConfigFile(repoConfigPath);
    if (repoConfig) {
      merged = {
        agent: deepMergeAgent(merged.agent, repoConfig.agent ?? {}),
        scan: deepMergeScan(merged.scan, repoConfig.scan ?? {}),
      };
    }
  }

  const result = CodeWikiConfigSchema.safeParse(merged);
  const config = result.success ? result.data : DEFAULT_CONFIG;

  const userAgent = userConfig?.agent;
  const repoAgent = repoConfig?.agent;

  const agent: EffectiveAgentConfig = {
    default: config.agent.default,
    concurrency: config.agent.concurrency,
    timeoutSeconds: config.agent.timeoutSeconds,
    retries: config.agent.retries,
    sources: {
      default: getConfigSource("default", repoPath, userAgent?.default, repoAgent?.default),
      concurrency: getConfigSource("concurrency", repoPath, userAgent?.concurrency, repoAgent?.concurrency),
      timeoutSeconds: getConfigSource("timeoutSeconds", repoPath, userAgent?.timeoutSeconds, repoAgent?.timeoutSeconds),
      retries: getConfigSource("retries", repoPath, userAgent?.retries, repoAgent?.retries),
    },
  };

  const userScan = userConfig?.scan;
  const repoScan = repoConfig?.scan;

  const scan: EffectiveScanConfig = {
    interactiveConfig: config.scan.interactiveConfig,
    source: getConfigSource("interactiveConfig" as never, repoPath, userScan?.interactiveConfig, repoScan?.interactiveConfig),
  };

  return { agent, scan };
}

export interface PartialCodeWikiConfig {
  agent?: Partial<CodeWikiConfig["agent"]>;
  scan?: Partial<CodeWikiConfig["scan"]>;
}

export function writeRepoConfig(repoPath: string, config: PartialCodeWikiConfig): void {
  const codewikiDir = join(repoPath, ".codewiki");
  if (!existsSync(codewikiDir)) {
    mkdirSync(codewikiDir, { recursive: true });
  }
  const configPath = join(codewikiDir, "config.json");
  const current = loadConfig(repoPath);
  const merged: CodeWikiConfig = {
    agent: deepMergeAgent(current.agent, config.agent ?? {}),
    scan: deepMergeScan(current.scan, config.scan ?? {}),
  };
  writeFileSync(configPath, JSON.stringify(merged, null, 2));
}

export function writeUserConfig(config: PartialCodeWikiConfig): void {
  const configPath = getUserConfigPath();
  const codewikiDir = join(configPath, "..");
  if (!existsSync(codewikiDir)) {
    mkdirSync(codewikiDir, { recursive: true });
  }
  const current = readConfigFile(configPath) ?? {};
  const merged: CodeWikiConfig = {
    agent: deepMergeAgent(current.agent ?? DEFAULT_CONFIG.agent, config.agent ?? {}),
    scan: deepMergeScan(current.scan ?? DEFAULT_CONFIG.scan, config.scan ?? {}),
  };
  writeFileSync(configPath, JSON.stringify(merged, null, 2));
}
