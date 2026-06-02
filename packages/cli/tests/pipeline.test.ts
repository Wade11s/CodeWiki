import { describe, it, expect } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanCommand } from "../src/commands/scan.js";
import { statusCommand } from "../src/commands/status.js";
import { debugCommand } from "../src/commands/debug.js";
import { AgentRunner, FakeProvider, type AgentProvider, type TaskResult } from "@codewiki/core";

function createTempRepo(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `codewiki-pipeline-${name}-`));
  return dir;
}

function cleanup(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

function addFile(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  const parent = join(fullPath, "..");
  mkdirSync(parent, { recursive: true });
  writeFileSync(fullPath, content);
}

class SelectiveFakeProvider implements AgentProvider {
  name = "selective-fake";
  private failModules: Set<string> = new Set();
  private flakyModules: Map<string, number> = new Map();
  private callCounts: Map<string, number> = new Map();
  private invalidEvidenceModules: Set<string> = new Set();

  setFailModules(modules: string[]): void {
    this.failModules = new Set(modules);
  }

  setFlakyModule(moduleName: string, failCount: number): void {
    this.flakyModules.set(moduleName, failCount);
    this.callCounts.set(moduleName, 0);
  }

  setInvalidEvidenceModules(modules: string[]): void {
    this.invalidEvidenceModules = new Set(modules);
  }

  async detect(): Promise<null> {
    return null;
  }

  async runTask(options: {
    prompt: string;
    repoIndexPath: string;
    inputArtifacts: string[];
    outputSchema: string;
    timeoutSeconds: number;
  }): Promise<TaskResult> {
    const match = options.prompt.match(/Module:\s*(.+)/);
    const moduleName = match ? match[1].trim() : "unknown";

    if (this.failModules.has(moduleName)) {
      return {
        taskId: `fail-${Date.now()}`,
        exitCode: 1,
        durationMs: 10,
        stdout: "",
        stderr: `Simulated failure for module ${moduleName}`,
        retries: 0,
        validationErrors: [],
      };
    }

    const flakyFailCount = this.flakyModules.get(moduleName);
    if (flakyFailCount !== undefined) {
      const current = (this.callCounts.get(moduleName) || 0) + 1;
      this.callCounts.set(moduleName, current);
      if (current <= flakyFailCount) {
        return {
          taskId: `flaky-${Date.now()}`,
          exitCode: 1,
          durationMs: 10,
          stdout: "",
          stderr: `Flaky attempt ${current} for ${moduleName}`,
          retries: 0,
          validationErrors: [],
        };
      }
    }

    const evidence = this.invalidEvidenceModules.has(moduleName)
      ? [{ filePath: "", lineStart: 1, lineEnd: 5, snippet: "bad evidence" }]
      : [{ filePath: "src/example.ts", lineStart: 1, lineEnd: 5, snippet: "export const x = 1;" }];

    return {
      taskId: `ok-${Date.now()}`,
      exitCode: 0,
      durationMs: 5,
      stdout: JSON.stringify({
        summary: `Analysis of ${moduleName}`,
        keyFeatures: ["feature-a", "feature-b"],
        complexity: "medium",
        evidence,
      }),
      stderr: "",
      retries: 0,
      validationErrors: [],
    };
  }
}

describe("Pipeline acceptance criteria", () => {
  it("full success: all modules complete with valid artifacts", async () => {
    const repo = createTempRepo("full-success");
    addFile(repo, "src/a.ts", "export const a = 1;\n");
    addFile(repo, "src/b.ts", "export const b = 2;\n");
    addFile(repo, "README.md", "# Project\n");

    const runner = new AgentRunner();
    const fake = new FakeProvider("codex");
    fake.setBehavior("validate");
    runner.register(fake);

    await scanCommand(repo, { runner });

    const runPath = join(repo, ".codewiki", "runs");
    expect(existsSync(runPath)).toBe(true);
    expect(readdirSync(runPath).length).toBeGreaterThanOrEqual(1);

    expect(existsSync(join(repo, ".codewiki", "artifacts", "overview.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "artifacts", "modules.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "artifacts", "features.json"))).toBe(true);
    expect(existsSync(join(repo, ".codewiki", "artifacts", "code-map.json"))).toBe(true);

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, { json: true });
    console.log = originalLog;

    const status = JSON.parse(output);
    expect(status.runStatus).toBe("success");
    expect(status.failedTasks).toBe(0);
    expect(status.incompleteModules).toBe(0);

    cleanup(repo);
  });

  it("partial agent failure: some modules fail, others succeed", async () => {
    const repo = createTempRepo("partial-fail");
    addFile(repo, "src/a.ts", "export const a = 1;\n");
    addFile(repo, "lib/b.ts", "export const b = 2;\n");

    const runner = new AgentRunner();
    const selective = new SelectiveFakeProvider();
    selective.setFailModules(["lib"]);
    runner.register(selective);

    await scanCommand(repo, { runner, agent: "selective-fake" });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, { json: true });
    console.log = originalLog;

    const status = JSON.parse(output);
    expect(status.runStatus).toBe("partial");
    expect(status.failedTasks).toBeGreaterThanOrEqual(1);
    expect(status.incompleteModules).toBeGreaterThanOrEqual(1);

    const runsDir = join(repo, ".codewiki", "runs");
    expect(existsSync(runsDir)).toBe(true);
    expect(readdirSync(runsDir).length).toBeGreaterThanOrEqual(1);

    cleanup(repo);
  });

  it("validation failure: invalid artifacts are rejected, modules marked incomplete", async () => {
    const repo = createTempRepo("validation-fail");
    addFile(repo, "src/a.ts", "export const a = 1;\n");

    const runner = new AgentRunner();
    const selective = new SelectiveFakeProvider();
    selective.setInvalidEvidenceModules(["src"]);
    runner.register(selective);

    await scanCommand(repo, { runner, agent: "selective-fake" });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, { json: true });
    console.log = originalLog;

    const status = JSON.parse(output);
    expect(status.incompleteModules).toBeGreaterThanOrEqual(1);

    cleanup(repo);
  });

  it("retry success: flaky provider eventually succeeds", async () => {
    const repo = createTempRepo("retry-success");
    addFile(repo, "src/a.ts", "export const a = 1;\n");
    addFile(repo, "src/b.ts", "export const b = 2;\n");

    const runner = new AgentRunner();
    const selective = new SelectiveFakeProvider();
    selective.setFlakyModule("src", 2);
    runner.register(selective);

    await scanCommand(repo, { runner, agent: "selective-fake", retries: "3" });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, { json: true });
    console.log = originalLog;

    const status = JSON.parse(output);
    expect(status.runStatus).toBe("success");
    expect(status.failedTasks).toBe(0);

    cleanup(repo);
  });

  it("retry exhaustion: all retries fail, module marked failed", async () => {
    const repo = createTempRepo("retry-exhaust");
    addFile(repo, "src/a.ts", "export const a = 1;\n");

    const runner = new AgentRunner();
    const selective = new SelectiveFakeProvider();
    selective.setFlakyModule("src", 5);
    runner.register(selective);

    await scanCommand(repo, { runner, agent: "selective-fake", retries: "2" });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, { json: true });
    console.log = originalLog;

    const status = JSON.parse(output);
    expect(status.runStatus).toBe("failed");
    expect(status.failedTasks).toBeGreaterThanOrEqual(1);
    expect(status.incompleteModules).toBeGreaterThanOrEqual(1);

    cleanup(repo);
  });

  it("module incomplete reporting: status and debug show incomplete modules", async () => {
    const repo = createTempRepo("incomplete-report");
    addFile(repo, "src/a.ts", "export const a = 1;\n");
    addFile(repo, "lib/b.ts", "export const b = 2;\n");

    const runner = new AgentRunner();
    const selective = new SelectiveFakeProvider();
    selective.setFailModules(["lib"]);
    runner.register(selective);

    await scanCommand(repo, { runner, agent: "selective-fake" });

    let output = "";
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await statusCommand(repo, {});
    console.log = originalLog;

    expect(output).toContain("Failed tasks:");
    expect(output).toContain("Incomplete modules:");

    output = "";
    console.log = (...args: unknown[]) => { output += args.join(" ") + "\n"; };
    await debugCommand(repo, { json: true });
    console.log = originalLog;

    const debug = JSON.parse(output);
    expect(debug.runDiagnostics).not.toBeNull();
    const rd = debug.runDiagnostics as Record<string, unknown>;
    expect(rd.status).toBe("partial");
    const moduleSummary = rd.moduleSummary as Array<Record<string, unknown>>;
    const failedModule = moduleSummary.find((m) => m.status === "failed" || m.status === "incomplete");
    expect(failedModule).toBeTruthy();

    cleanup(repo);
  });
});
