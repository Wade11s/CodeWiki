import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, loadConfigWithSources, writeRepoConfig, writeUserConfig } from "@codewiki/core";
import { scanCommand } from "../src/commands/scan.js";
import { statusCommand } from "../src/commands/status.js";
import { agentsCommand, detectAgent } from "../src/commands/agents.js";
import { askCommand } from "../src/commands/ask.js";

function createTempRepo(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `codewiki-config-${name}-`));
  return dir;
}

function cleanup(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function captureOutput<T>(fn: () => T | Promise<T>): Promise<{ result: T | undefined; output: string }> {
  let output = "";
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };

  return Promise.resolve()
    .then(() => fn())
    .then((result) => {
      console.log = originalLog;
      return { result, output };
    })
    .catch((err) => {
      console.log = originalLog;
      throw err;
    });
}

describe("Config precedence", () => {
  let userConfigDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    userConfigDir = mkdtempSync(join(tmpdir(), "codewiki-user-"));
    originalHome = process.env.HOME;
    process.env.HOME = userConfigDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    cleanup(userConfigDir);
  });

  it("returns defaults when no configs exist", () => {
    const config = loadConfig();
    expect(config.agent.default).toBe("codex");
    expect(config.agent.concurrency).toBe(2);
    expect(config.agent.timeoutSeconds).toBe(600);
    expect(config.agent.retries).toBe(1);
    expect(config.scan.interactiveConfig).toBe(true);
  });

  it("loads user-level config", () => {
    const codewikiDir = join(userConfigDir, ".codewiki");
    mkdirSync(codewikiDir, { recursive: true });
    writeFileSync(
      join(codewikiDir, "config.json"),
      JSON.stringify({ agent: { default: "claude" } })
    );

    const config = loadConfig();
    expect(config.agent.default).toBe("claude");
    expect(config.agent.concurrency).toBe(2); // still default
  });

  it("loads repo config overriding user config", () => {
    const codewikiDir = join(userConfigDir, ".codewiki");
    mkdirSync(codewikiDir, { recursive: true });
    writeFileSync(
      join(codewikiDir, "config.json"),
      JSON.stringify({ agent: { default: "claude", concurrency: 4 } })
    );

    const repo = createTempRepo("repo-precedence");
    const repoCodewiki = join(repo, ".codewiki");
    mkdirSync(repoCodewiki, { recursive: true });
    writeFileSync(
      join(repoCodewiki, "config.json"),
      JSON.stringify({ agent: { default: "aider" } })
    );

    const config = loadConfig(repo);
    expect(config.agent.default).toBe("aider"); // repo wins
    expect(config.agent.concurrency).toBe(4); // user wins (not in repo)

    cleanup(repo);
  });

  it("repo config takes full precedence over user config", () => {
    const codewikiDir = join(userConfigDir, ".codewiki");
    mkdirSync(codewikiDir, { recursive: true });
    writeFileSync(
      join(codewikiDir, "config.json"),
      JSON.stringify({ agent: { default: "claude", concurrency: 8, timeoutSeconds: 120, retries: 3 } })
    );

    const repo = createTempRepo("repo-full");
    const repoCodewiki = join(repo, ".codewiki");
    mkdirSync(repoCodewiki, { recursive: true });
    writeFileSync(
      join(repoCodewiki, "config.json"),
      JSON.stringify({ agent: { default: "aider" } })
    );

    const config = loadConfig(repo);
    expect(config.agent.default).toBe("aider"); // repo
    expect(config.agent.concurrency).toBe(8); // user
    expect(config.agent.timeoutSeconds).toBe(120); // user
    expect(config.agent.retries).toBe(3); // user

    cleanup(repo);
  });

  it("loadConfigWithSources tracks where each value came from", () => {
    const codewikiDir = join(userConfigDir, ".codewiki");
    mkdirSync(codewikiDir, { recursive: true });
    writeFileSync(
      join(codewikiDir, "config.json"),
      JSON.stringify({ agent: { concurrency: 4 } })
    );

    const repo = createTempRepo("sources");
    const repoCodewiki = join(repo, ".codewiki");
    mkdirSync(repoCodewiki, { recursive: true });
    writeFileSync(
      join(repoCodewiki, "config.json"),
      JSON.stringify({ agent: { default: "aider" } })
    );

    const { agent } = loadConfigWithSources(repo);
    expect(agent.sources.default).toBe("repo");
    expect(agent.sources.concurrency).toBe("user");
    expect(agent.sources.timeoutSeconds).toBe("default");
    expect(agent.sources.retries).toBe("default");

    cleanup(repo);
  });

  it("loadConfigWithSources treats explicit null as default source", () => {
    const codewikiDir = join(userConfigDir, ".codewiki");
    mkdirSync(codewikiDir, { recursive: true });
    writeFileSync(
      join(codewikiDir, "config.json"),
      JSON.stringify({ agent: { concurrency: null, retries: undefined } })
    );

    const { agent } = loadConfigWithSources();
    // null should be treated as "not set", so source should be "default"
    expect(agent.concurrency).toBe(2); // falls back to default
    expect(agent.sources.concurrency).toBe("default");
    expect(agent.retries).toBe(1);
    expect(agent.sources.retries).toBe("default");
  });
});

describe("writeRepoConfig", () => {
  let userConfigDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    userConfigDir = mkdtempSync(join(tmpdir(), "codewiki-user-"));
    originalHome = process.env.HOME;
    process.env.HOME = userConfigDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    cleanup(userConfigDir);
  });

  it("persists partial config to repo without overwriting other values", () => {
    const repo = createTempRepo("write-repo");
    writeRepoConfig(repo, { agent: { concurrency: 8 } });

    const configPath = join(repo, ".codewiki", "config.json");
    expect(existsSync(configPath)).toBe(true);

    const written = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(written.agent.concurrency).toBe(8);
    expect(written.agent.default).toBe("codex"); // default preserved
    expect(written.agent.timeoutSeconds).toBe(600);
    expect(written.agent.retries).toBe(1);

    cleanup(repo);
  });

  it("merges with existing repo config", () => {
    const repo = createTempRepo("merge-repo");
    const repoCodewiki = join(repo, ".codewiki");
    mkdirSync(repoCodewiki, { recursive: true });
    writeFileSync(
      join(repoCodewiki, "config.json"),
      JSON.stringify({ agent: { default: "claude" } })
    );

    writeRepoConfig(repo, { agent: { retries: 5 } });

    const written = JSON.parse(readFileSync(join(repoCodewiki, "config.json"), "utf-8"));
    expect(written.agent.default).toBe("claude"); // preserved
    expect(written.agent.retries).toBe(5); // updated
    expect(written.agent.concurrency).toBe(2); // default

    cleanup(repo);
  });
});

describe("writeUserConfig", () => {
  let userConfigDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    userConfigDir = mkdtempSync(join(tmpdir(), "codewiki-user-"));
    originalHome = process.env.HOME;
    process.env.HOME = userConfigDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    cleanup(userConfigDir);
  });

  it("creates user config file with defaults for unspecified fields", () => {
    writeUserConfig({ agent: { default: "claude" } });

    const configPath = join(userConfigDir, ".codewiki", "config.json");
    expect(existsSync(configPath)).toBe(true);

    const written = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(written.agent.default).toBe("claude");
    expect(written.agent.concurrency).toBe(2);
    expect(written.agent.timeoutSeconds).toBe(600);
    expect(written.agent.retries).toBe(1);
  });

  it("merges with existing user config", () => {
    const codewikiDir = join(userConfigDir, ".codewiki");
    mkdirSync(codewikiDir, { recursive: true });
    writeFileSync(
      join(codewikiDir, "config.json"),
      JSON.stringify({ agent: { default: "aider", concurrency: 4 } })
    );

    writeUserConfig({ agent: { retries: 3 } });

    const written = JSON.parse(readFileSync(join(codewikiDir, "config.json"), "utf-8"));
    expect(written.agent.default).toBe("aider"); // preserved
    expect(written.agent.concurrency).toBe(4); // preserved
    expect(written.agent.retries).toBe(3); // updated
  });
});

describe("agents --json", () => {
  it("returns machine-readable provider detection results", async () => {
    const { output } = await captureOutput(() => agentsCommand({ json: true }));

    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(1);

    for (const agent of parsed) {
      expect(agent).toHaveProperty("name");
      expect(agent).toHaveProperty("command");
      expect(agent).toHaveProperty("version");
      expect(agent).toHaveProperty("available");
      expect(agent).toHaveProperty("health");
      expect(agent).toHaveProperty("default");
      expect(["healthy", "degraded", "unavailable"]).toContain(agent.health);
      expect(typeof agent.default).toBe("boolean");
    }

    const defaults = parsed.filter((a: { default: boolean }) => a.default);
    expect(defaults.length).toBeLessThanOrEqual(1);
  });
});

describe("agents text output", () => {
  it("shows detected agents with health markers", async () => {
    const { output } = await captureOutput(() => agentsCommand({ json: false }));

    expect(output).toContain("Detected agents:");
    // At least one agent should be listed
    expect(output).toMatch(/codex|claude|aider|pi/);
  });
});

describe("detectAgent", () => {
  it("returns unavailable for non-existent command", () => {
    const agent = detectAgent("nonexistent", "this-command-definitely-does-not-exist-xyz", ["--version"]);
    expect(agent.available).toBe(false);
    expect(agent.health).toBe("unavailable");
    expect(agent.version).toBeNull();
  });
});

describe("scan one-off overrides", () => {
  let userConfigDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    userConfigDir = mkdtempSync(join(tmpdir(), "codewiki-user-"));
    originalHome = process.env.HOME;
    process.env.HOME = userConfigDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    cleanup(userConfigDir);
  });

  it("scan with --concurrency, --timeout, --retries does not persist by default", async () => {
    const repo = createTempRepo("scan-override");
    addFile(repo, "x.js", "const x = 1;\n");

    await scanCommand(repo, { concurrency: "99", timeout: "1", retries: "0", nonInteractive: true });

    // No config should be written
    expect(existsSync(join(repo, ".codewiki", "config.json"))).toBe(false);

    cleanup(repo);
  });

  it("scan with --write-config persists overrides to repo config", async () => {
    const repo = createTempRepo("scan-write");
    addFile(repo, "x.js", "const x = 1;\n");

    await scanCommand(repo, { concurrency: "99", timeout: "1", retries: "0", agent: "claude", writeConfig: true, nonInteractive: true });

    const configPath = join(repo, ".codewiki", "config.json");
    expect(existsSync(configPath)).toBe(true);

    const written = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(written.agent.concurrency).toBe(99);
    expect(written.agent.timeoutSeconds).toBe(1);
    expect(written.agent.retries).toBe(0);
    expect(written.agent.default).toBe("claude");

    cleanup(repo);
  });

  it("scan --agent override does not persist without --write-config", async () => {
    const repo = createTempRepo("scan-agent");
    addFile(repo, "y.js", "const y = 2;\n");

    await scanCommand(repo, { agent: "claude", nonInteractive: true });

    expect(existsSync(join(repo, ".codewiki", "config.json"))).toBe(false);

    cleanup(repo);
  });

  it("rejects invalid --concurrency with error", async () => {
    const repo = createTempRepo("scan-invalid-concurrency");
    addFile(repo, "z.js", "const z = 3;\n");

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => { exitCode = code; throw new Error(`exit ${code}`); }) as typeof process.exit;
    const originalError = console.error;
    let stderr = "";
    console.error = (...args: unknown[]) => { stderr += args.join(" ") + "\n"; };

    try {
      await scanCommand(repo, { concurrency: "abc", nonInteractive: true });
    } catch {
      // expected
    }

    process.exit = originalExit;
    console.error = originalError;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid concurrency");

    cleanup(repo);
  });

  it("rejects negative --timeout with error", async () => {
    const repo = createTempRepo("scan-negative-timeout");
    addFile(repo, "w.js", "const w = 4;\n");

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => { exitCode = code; throw new Error(`exit ${code}`); }) as typeof process.exit;
    const originalError = console.error;
    let stderr = "";
    console.error = (...args: unknown[]) => { stderr += args.join(" ") + "\n"; };

    try {
      await scanCommand(repo, { timeout: "-5", nonInteractive: true });
    } catch {
      // expected
    }

    process.exit = originalExit;
    console.error = originalError;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid timeout");

    cleanup(repo);
  });

  it("allows zero --retries as valid value", async () => {
    const repo = createTempRepo("scan-zero-retries");
    addFile(repo, "v.js", "const v = 5;\n");

    await scanCommand(repo, { retries: "0", nonInteractive: true });

    // Should succeed - no config written by default
    expect(existsSync(join(repo, ".codewiki", "config.json"))).toBe(false);

    cleanup(repo);
  });

  it("rejects negative --retries with error", async () => {
    const repo = createTempRepo("scan-negative-retries");
    addFile(repo, "u.js", "const u = 6;\n");

    let exitCode: number | undefined;
    const originalExit = process.exit;
    process.exit = ((code?: number) => { exitCode = code; throw new Error(`exit ${code}`); }) as typeof process.exit;
    const originalError = console.error;
    let stderr = "";
    console.error = (...args: unknown[]) => { stderr += args.join(" ") + "\n"; };

    try {
      await scanCommand(repo, { retries: "-1", nonInteractive: true });
    } catch {
      // expected
    }

    process.exit = originalExit;
    console.error = originalError;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid retries");

    cleanup(repo);
  });
});

describe("ask --agent override", () => {
  let userConfigDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    userConfigDir = mkdtempSync(join(tmpdir(), "codewiki-user-"));
    originalHome = process.env.HOME;
    process.env.HOME = userConfigDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    cleanup(userConfigDir);
  });

  it("ask uses --agent override in JSON output", async () => {
    const repo = createTempRepo("ask-agent");
    addFile(repo, "a.js", "const a = 1;\n");

    // Need a snapshot first
    await scanCommand(repo, { nonInteractive: true });

    const { output } = await captureOutput(() => askCommand(repo, "What is this?", { json: true, agent: "aider" }));
    const parsed = JSON.parse(output);
    expect(parsed.agent).toBe("aider");

    cleanup(repo);
  });

  it("ask falls back to config default when no --agent", async () => {
    const repo = createTempRepo("ask-default");
    addFile(repo, "b.js", "const b = 2;\n");

    await scanCommand(repo, { nonInteractive: true });

    const { output } = await captureOutput(() => askCommand(repo, "What is this?", { json: true }));
    const parsed = JSON.parse(output);
    expect(parsed.agent).toBe("codex"); // default

    cleanup(repo);
  });
});

describe("status reports effective config and sources", () => {
  let userConfigDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    userConfigDir = mkdtempSync(join(tmpdir(), "codewiki-user-"));
    originalHome = process.env.HOME;
    process.env.HOME = userConfigDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    cleanup(userConfigDir);
  });

  it("status --json includes config sources", async () => {
    const repo = createTempRepo("status-sources");
    addFile(repo, "z.js", "const z = 3;\n");

    const codewikiDir = join(userConfigDir, ".codewiki");
    mkdirSync(codewikiDir, { recursive: true });
    writeFileSync(
      join(codewikiDir, "config.json"),
      JSON.stringify({ agent: { default: "claude" } })
    );

    await scanCommand(repo, { nonInteractive: true });

    const { output } = await captureOutput(() => statusCommand(repo, { json: true }));
    const parsed = JSON.parse(output);

    expect(parsed).toHaveProperty("config");
    expect(parsed.config).toHaveProperty("agent");
    expect(parsed.config.agent).toHaveProperty("sources");
    expect(parsed.config.agent.sources.default).toBe("user");
    expect(parsed.config.agent.sources.concurrency).toBe("default");

    cleanup(repo);
  });

  it("status text output includes source annotations", async () => {
    const repo = createTempRepo("status-text");
    addFile(repo, "a.js", "const a = 1;\n");

    await scanCommand(repo, { nonInteractive: true });

    const { output } = await captureOutput(() => statusCommand(repo, {}));
    expect(output).toContain("Default provider:");
    expect(output).toContain("(default)");
    expect(output).toContain("Concurrency:");
    expect(output).toContain("Timeout:");
    expect(output).toContain("Retries:");

    cleanup(repo);
  });
});

function addFile(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  const parent = join(fullPath, "..");
  mkdirSync(parent, { recursive: true });
  writeFileSync(fullPath, content);
}
