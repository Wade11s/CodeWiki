import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ClaudeProvider,
  AgentRunner,
  RunStore,
  ValidationError,
} from "@codewiki/core";
import { FakeProvider } from "@codewiki/core/testing";
import type { RunTaskOptions } from "@codewiki/core";

function createTempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), `codewiki-runner-${name}-`));
}

function cleanup(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

const baseOptions: RunTaskOptions = {
  prompt: "FAKE:success test prompt",
  repoIndexPath: "/tmp",
  inputArtifacts: [],
  outputSchema: "",
  timeoutSeconds: 5,
  retries: 0,
};

describe("FakeProvider", () => {
  const provider = new FakeProvider();

  it("detects as available and healthy", async () => {
    const detected = await provider.detect();
    expect(detected).not.toBeNull();
    expect(detected!.available).toBe(true);
    expect(detected!.health).toBe("healthy");
    expect(detected!.name).toBe("fake");
  });

  it("returns deterministic task IDs for same prompt", async () => {
    const result1 = await provider.runTask({ ...baseOptions, prompt: "FAKE:success hello" });
    const result2 = await provider.runTask({ ...baseOptions, prompt: "FAKE:success hello" });
    expect(result1.taskId).toBe(result2.taskId);
  });

  it("returns success state for FAKE:success", async () => {
    const result = await provider.runTask({ ...baseOptions, prompt: "FAKE:success hello world" });
    expect(result.exitCode).toBe(0);
    expect(result.state).toBe("success");
    expect(result.stdout).toContain("Analysis for");
    expect(result.retries).toBe(0);
  });

  it("returns failed state for FAKE:fail", async () => {
    const result = await provider.runTask({ ...baseOptions, prompt: "FAKE:fail something broke" });
    expect(result.exitCode).toBe(1);
    expect(result.state).toBe("failed");
    expect(result.stderr).toContain("Fake failure");
  });

  it("returns failed state with validation errors for FAKE:schema", async () => {
    const result = await provider.runTask({ ...baseOptions, prompt: "FAKE:schema invalid output" });
    expect(result.exitCode).toBe(0);
    expect(result.state).toBe("failed");
    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.validationErrors[0].code).toBe("SCHEMA_ERROR");
    expect(result.validationErrors[0].message).toContain("schema");
  });

  it("returns timeout state for FAKE:timeout", async () => {
    const result = await provider.runTask({
      ...baseOptions,
      prompt: "FAKE:timeout slow task",
      timeoutSeconds: 2,
    });
    expect(result.exitCode).toBe(-1);
    expect(result.state).toBe("timeout");
    expect(result.durationMs).toBe(2000);
  });

  it("returns failed on first attempt for FAKE:retry", async () => {
    const result = await provider.runTask({
      ...baseOptions,
      prompt: "FAKE:retry needs retry",
      retries: 2,
    });
    // Direct provider call always gets attempt 1, so it fails
    expect(result.exitCode).toBe(1);
    expect(result.state).toBe("failed");
    expect(result.stderr).toContain("Retry simulation: first attempt failed");
  });
});

describe("ClaudeProvider", () => {
  it("detects claude CLI availability", async () => {
    const provider = new ClaudeProvider();
    const detected = await provider.detect();
    expect(detected).not.toBeNull();
    expect(detected!.name).toBe("claude");
    expect(detected!.command).toBe("claude");
    // health should be one of the valid states regardless of whether claude is installed
    expect(["healthy", "unavailable"]).toContain(detected!.health);
  });

  it("has the correct provider name", () => {
    const provider = new ClaudeProvider();
    expect(provider.name).toBe("claude");
  });
});

describe("AgentRunner", () => {
  let runner: AgentRunner;

  beforeEach(() => {
    runner = new AgentRunner();
    runner.register(new FakeProvider());
  });

  it("detects registered providers", async () => {
    const agents = await runner.detectAgents();
    expect(agents.length).toBe(1);
    expect(agents[0].name).toBe("fake");
  });

  it("throws for unknown provider", async () => {
    expect(async () => {
      await runner.runTask("nonexistent", baseOptions);
    }).toThrow("Provider not found: nonexistent");
  });

  it("runs a task through the fake provider", async () => {
    const result = await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:success run test",
    });
    expect(result.state).toBe("success");
    expect(result.exitCode).toBe(0);
  });

  it("retries on failure up to configured retries", async () => {
    const result = await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:fail always fails",
      retries: 2,
    });
    expect(result.state).toBe("failed");
    expect(result.retries).toBe(2); // 1 initial + 2 retries = 3 attempts
  });

  it("succeeds on retry when provider recovers", async () => {
    const result = await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:retry recover",
      retries: 2,
    });
    expect(result.state).toBe("success");
    expect(result.retries).toBe(1);
  });

  it("does not retry on timeout", async () => {
    const result = await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:timeout no retry",
      retries: 2,
    });
    expect(result.state).toBe("timeout");
    expect(result.retries).toBe(0); // timeout is not retried
  });
});

describe("AgentRunner with RunStore", () => {
  let runner: AgentRunner;
  let store: RunStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir("store");
    runner = new AgentRunner();
    runner.register(new FakeProvider());
    store = new RunStore(tempDir);
    runner.setRunStore(store);
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("persists run metadata after task execution", async () => {
    await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:success persist test",
    });

    const runs = store.listRuns();
    expect(runs.length).toBe(1);

    const run = store.readRun(runs[0]);
    expect(run).not.toBeNull();
    expect(run!.providerName).toBe("fake");
    expect(run!.tasks.length).toBe(1);
    expect(run!.summary.total).toBe(1);
    expect(run!.summary.success).toBe(1);
    expect(run!.summary.failed).toBe(0);
  });

  it("persists failed task metadata", async () => {
    await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:fail persist fail",
    });

    const runs = store.listRuns();
    const run = store.readRun(runs[0]);
    expect(run!.summary.failed).toBe(1);
    expect(run!.summary.success).toBe(0);

    const task = run!.tasks[0];
    expect(task.state).toBe("failed");
    expect(task.stderr).toContain("Fake failure");
  });

  it("persists timeout task metadata", async () => {
    await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:timeout persist timeout",
      timeoutSeconds: 1,
    });

    const runs = store.listRuns();
    const run = store.readRun(runs[0]);
    expect(run!.summary.timedOut).toBe(1);

    const task = run!.tasks[0];
    expect(task.state).toBe("timeout");
  });

  it("writes individual task files", async () => {
    await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:success task file",
    });

    const runs = store.listRuns();
    const run = store.readRun(runs[0]);
    const taskId = run!.tasks[0].taskId;

    const taskRecord = store.readTask(runs[0], taskId);
    expect(taskRecord).not.toBeNull();
    expect(taskRecord!.prompt).toBe("FAKE:success task file");
  });

  it("lists multiple runs", async () => {
    await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:success run 1",
    });
    await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:success run 2",
    });

    const runs = store.listRuns();
    expect(runs.length).toBe(2);
  });

  it("returns latest run", async () => {
    await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:success first",
    });
    await new Promise((r) => setTimeout(r, 50));
    await runner.runTask("fake", {
      ...baseOptions,
      prompt: "FAKE:success second",
    });

    const latest = store.getLatestRun();
    expect(latest).not.toBeNull();
    expect(latest!.tasks[0].prompt).toBe("FAKE:success second");
  });
});

describe("RunStore", () => {
  let tempDir: string;
  let store: RunStore;

  beforeEach(() => {
    tempDir = createTempDir("runstore");
    store = new RunStore(tempDir);
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it("creates runs directory if it does not exist", () => {
    const newDir = join(tempDir, "nested");
    const newStore = new RunStore(newDir);
    expect(existsSync(join(newDir, "runs"))).toBe(true);
  });

  it("returns null for non-existent run", () => {
    expect(store.readRun("nonexistent")).toBeNull();
  });

  it("returns null for non-existent task", () => {
    expect(store.readTask("nonexistent", "task-1")).toBeNull();
  });

  it("creates and reads a run record", () => {
    const run = store.createRun("test-run-1", "/repo", "fake");
    expect(run.runId).toBe("test-run-1");
    expect(run.providerName).toBe("fake");

    const readBack = store.readRun("test-run-1");
    expect(readBack).not.toBeNull();
    expect(readBack!.repoPath).toBe("/repo");
  });

  it("writes and reads task records", () => {
    store.createRun("test-run-2", "/repo", "fake");

    const task = {
      taskId: "task-abc",
      prompt: "test prompt",
      inputArtifacts: ["a.json"],
      outputSchema: "{}",
      state: "success" as const,
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      durationMs: 100,
      retries: 0,
      validationErrors: [] as ValidationError[],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    store.writeTask("test-run-2", task);
    const readBack = store.readTask("test-run-2", "task-abc");
    expect(readBack).not.toBeNull();
    expect(readBack!.prompt).toBe("test prompt");
    expect(readBack!.state).toBe("success");
  });
});
