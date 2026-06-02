import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanCommand } from "../src/commands/scan.js";
import { statusCommand } from "../src/commands/status.js";
import { debugCommand } from "../src/commands/debug.js";
import { AgentRunner, RunStore } from "@codewiki/core";
import { FakeProvider } from "@codewiki/core/testing";

function createTempRepo(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `codewiki-sd-${name}-`));
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

describe("status with failed tasks", () => {
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

  it("reports failed task summaries in JSON output", async () => {
    const repo = createTempRepo("status-fail");
    addFile(repo, "x.js", "const x = 1;\n");

    await scanCommand(repo, { nonInteractive: true });

    // Create a fake run with a failed task
    const store = new RunStore(join(repo, ".codewiki"));
    const runner = new AgentRunner();
    runner.register(new FakeProvider());
    runner.setRunStore(store);
    await runner.runTask("fake", {
      prompt: "FAKE:fail status test",
      repoIndexPath: repo,
      inputArtifacts: [],
      outputSchema: "",
      timeoutSeconds: 5,
      retries: 0,
    });

    const { output } = await captureOutput(() => statusCommand(repo, { json: true }));
    const parsed = JSON.parse(output);

    expect(parsed.agentFailedTasks).toBe(1);
    expect(parsed.failedTaskSummaries).toBeArray();
    expect(parsed.failedTaskSummaries.length).toBe(1);
    expect(parsed.failedTaskSummaries[0].state).toBe("failed");
    expect(parsed.failedTaskSummaries[0].summary).toContain("Fake failure");

    cleanup(repo);
  });

  it("reports zero failed tasks when no runs exist", async () => {
    const repo = createTempRepo("status-clean");
    addFile(repo, "x.js", "const x = 1;\n");

    await scanCommand(repo, { nonInteractive: true });

    const { output } = await captureOutput(() => statusCommand(repo, { json: true }));
    const parsed = JSON.parse(output);

    expect(parsed.agentFailedTasks).toBe(0);
    expect(parsed.failedTaskSummaries).toBeArray();
    expect(parsed.failedTaskSummaries.length).toBe(0);

    cleanup(repo);
  });

  it("shows failed tasks in text output", async () => {
    const repo = createTempRepo("status-text");
    addFile(repo, "x.js", "const x = 1;\n");

    await scanCommand(repo, { nonInteractive: true });

    const store = new RunStore(join(repo, ".codewiki"));
    const runner = new AgentRunner();
    runner.register(new FakeProvider());
    runner.setRunStore(store);
    await runner.runTask("fake", {
      prompt: "FAKE:fail text test",
      repoIndexPath: repo,
      inputArtifacts: [],
      outputSchema: "",
      timeoutSeconds: 5,
      retries: 0,
    });

    const { output } = await captureOutput(() => statusCommand(repo, {}));
    expect(output).toContain("Agent failed tasks: 1");
    expect(output).toContain("failed");

    cleanup(repo);
  });
});

describe("debug command", () => {
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

  it("lists runs with summary in JSON output", async () => {
    const repo = createTempRepo("debug-runs");
    addFile(repo, "x.js", "const x = 1;\n");

    await scanCommand(repo, { nonInteractive: true });

    const store = new RunStore(join(repo, ".codewiki"));
    const runner = new AgentRunner();
    runner.register(new FakeProvider());
    runner.setRunStore(store);
    await runner.runTask("fake", {
      prompt: "FAKE:success debug test",
      repoIndexPath: repo,
      inputArtifacts: [],
      outputSchema: "",
      timeoutSeconds: 5,
      retries: 0,
    });

    const { output } = await captureOutput(() => debugCommand(repo, { json: true }));
    const parsed = JSON.parse(output);

    expect(parsed.runs).toBeArray();
    expect(parsed.runs.length).toBe(1);
    expect(parsed.runs[0].taskCount).toBe(1);
    expect(parsed.runs[0].summary.success).toBe(1);

    cleanup(repo);
  });

  it("inspects specific task metadata", async () => {
    const repo = createTempRepo("debug-task");
    addFile(repo, "x.js", "const x = 1;\n");

    await scanCommand(repo, { nonInteractive: true });

    const store = new RunStore(join(repo, ".codewiki"));
    const runner = new AgentRunner();
    runner.register(new FakeProvider());
    runner.setRunStore(store);
    const result = await runner.runTask("fake", {
      prompt: "FAKE:fail debug task",
      repoIndexPath: repo,
      inputArtifacts: [],
      outputSchema: "",
      timeoutSeconds: 5,
      retries: 0,
    });

    const { output } = await captureOutput(() =>
      debugCommand(repo, { json: true, task: result.taskId })
    );
    const parsed = JSON.parse(output);

    expect(parsed.taskDetails).not.toBeNull();
    expect(parsed.taskDetails.prompt).toBe("FAKE:fail debug task");
    expect(parsed.taskDetails.state).toBe("failed");

    cleanup(repo);
  });

  it("inspects specific run metadata", async () => {
    const repo = createTempRepo("debug-run");
    addFile(repo, "x.js", "const x = 1;\n");

    await scanCommand(repo, { nonInteractive: true });

    const store = new RunStore(join(repo, ".codewiki"));
    const runner = new AgentRunner();
    runner.register(new FakeProvider());
    runner.setRunStore(store);
    await runner.runTask("fake", {
      prompt: "FAKE:success debug run",
      repoIndexPath: repo,
      inputArtifacts: [],
      outputSchema: "",
      timeoutSeconds: 5,
      retries: 0,
    });

    const runs = store.listRuns();
    const runId = runs[0];

    const { output } = await captureOutput(() =>
      debugCommand(repo, { json: true, run: runId })
    );
    const parsed = JSON.parse(output);

    expect(parsed.runDetails).not.toBeNull();
    expect(parsed.runDetails.runId).toBe(runId);
    expect(parsed.runDetails.providerName).toBe("fake");

    cleanup(repo);
  });

  it("reports error for non-existent task", async () => {
    const repo = createTempRepo("debug-missing");
    addFile(repo, "x.js", "const x = 1;\n");

    await scanCommand(repo, { nonInteractive: true });

    const { output } = await captureOutput(() =>
      debugCommand(repo, { json: true, task: "nonexistent-task" })
    );
    const parsed = JSON.parse(output);

    expect(parsed.taskDetails).not.toBeNull();
    expect(parsed.taskDetails.error).toContain("Task not found");

    cleanup(repo);
  });
});
