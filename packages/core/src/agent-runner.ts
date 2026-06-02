import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { AgentProvider, TaskResult, DetectedAgent, RunRecord, TaskRunRecord, TaskState } from "./types.js";
import { FakeProvider } from "./testing.js";

// --- Claude Provider ---

export class ClaudeProvider implements AgentProvider {
  name = "claude";

  async detect(): Promise<DetectedAgent | null> {
    try {
      const result = spawnSync("claude", ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
        shell: false,
      });
      const version = result.status === 0 ? result.stdout.trim().split("\n")[0] || null : null;
      const available = result.status === 0;
      return {
        name: "claude",
        command: "claude",
        version,
        available,
        health: available ? "healthy" : "unavailable",
        default: false,
      };
    } catch {
      return {
        name: "claude",
        command: "claude",
        version: null,
        available: false,
        health: "unavailable",
        default: false,
      };
    }
  }

  async runTask(options: {
    prompt: string;
    repoIndexPath: string;
    inputArtifacts: string[];
    outputSchema: string;
    timeoutSeconds: number;
    retries: number;
  }): Promise<TaskResult> {
    const taskId = `claude-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    // Build a prompt file for Claude CLI
    const promptContent = this.buildPrompt(options);

    try {
      const result = spawnSync("claude", ["-p", promptContent], {
        encoding: "utf-8",
        timeout: options.timeoutSeconds * 1000,
        shell: false,
        cwd: options.repoIndexPath,
      });

      const durationMs = Date.now() - startTime;
      const timedOut = result.error?.name === "Error" && result.stderr?.includes("timeout");

      if (timedOut || result.signal === "SIGTERM") {
        return {
          taskId,
          exitCode: -1,
          durationMs: options.timeoutSeconds * 1000,
          stdout: result.stdout || "",
          stderr: `Task timed out after ${options.timeoutSeconds}s`,
          retries: 0,
          validationErrors: [],
          state: "timeout",
        };
      }

      const validationErrors: string[] = [];
      if (result.status === 0 && options.outputSchema) {
        try {
          const parsed = JSON.parse(result.stdout);
          // Basic schema validation: ensure output is an object
          if (typeof parsed !== "object" || parsed === null) {
            validationErrors.push("Output does not match schema: expected object");
          }
        } catch {
          validationErrors.push("Output does not match schema: invalid JSON");
        }
      }

      const state: TaskState = result.status === 0 && validationErrors.length === 0 ? "success" : "failed";

      return {
        taskId,
        exitCode: result.status ?? -1,
        durationMs,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        retries: 0,
        validationErrors,
        state,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        taskId,
        exitCode: -1,
        durationMs,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        retries: 0,
        validationErrors: [],
        state: "failed",
      };
    }
  }

  private buildPrompt(options: {
    prompt: string;
    repoIndexPath: string;
    inputArtifacts: string[];
    outputSchema: string;
  }): string {
    const parts: string[] = [options.prompt];

    if (options.inputArtifacts.length > 0) {
      parts.push("\n\nInput artifacts:");
      for (const artifact of options.inputArtifacts) {
        parts.push(`- ${artifact}`);
      }
    }

    if (options.outputSchema) {
      parts.push(`\n\nOutput must conform to this schema:\n${options.outputSchema}`);
    }

    return parts.join("\n");
  }
}

// --- Run Persistence ---

export class RunStore {
  private runsDir: string;

  constructor(codewikiDir: string) {
    this.runsDir = join(codewikiDir, "runs");
    if (!existsSync(this.runsDir)) {
      mkdirSync(this.runsDir, { recursive: true });
    }
  }

  private runDir(runId: string): string {
    return join(this.runsDir, runId);
  }

  private tasksDir(runId: string): string {
    return join(this.runDir(runId), "tasks");
  }

  createRun(runId: string, repoPath: string, providerName: string): RunRecord {
    const runDir = this.runDir(runId);
    const tasksDir = this.tasksDir(runId);
    if (!existsSync(runDir)) mkdirSync(runDir, { recursive: true });
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });

    const record: RunRecord = {
      runId,
      repoPath,
      providerName,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      tasks: [],
      summary: { total: 0, success: 0, failed: 0, timedOut: 0 },
    };

    this.writeRun(record);
    return record;
  }

  writeTask(runId: string, task: TaskRunRecord): void {
    const taskPath = join(this.tasksDir(runId), `${task.taskId}.json`);
    writeFileSync(taskPath, JSON.stringify(task, null, 2));
  }

  writeRun(record: RunRecord): void {
    const runPath = join(this.runDir(record.runId), "run.json");
    writeFileSync(runPath, JSON.stringify(record, null, 2));
  }

  readRun(runId: string): RunRecord | null {
    const runPath = join(this.runDir(runId), "run.json");
    if (!existsSync(runPath)) return null;
    try {
      return JSON.parse(readFileSync(runPath, "utf-8")) as RunRecord;
    } catch {
      return null;
    }
  }

  readTask(runId: string, taskId: string): TaskRunRecord | null {
    const taskPath = join(this.tasksDir(runId), `${taskId}.json`);
    if (!existsSync(taskPath)) return null;
    try {
      return JSON.parse(readFileSync(taskPath, "utf-8")) as TaskRunRecord;
    } catch {
      return null;
    }
  }

  listRuns(): string[] {
    if (!existsSync(this.runsDir)) return [];
    return readdirSync(this.runsDir);
  }

  listRunRecords(): RunRecord[] {
    const runs: RunRecord[] = [];
    for (const runId of this.listRuns()) {
      const record = this.readRun(runId);
      if (record) runs.push(record);
    }
    return runs;
  }

  getLatestRun(): RunRecord | null {
    const records = this.listRunRecords();
    if (records.length === 0) return null;
    return records.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  }
}

// --- Agent Runner ---

export interface RunTaskOptions {
  prompt: string;
  repoIndexPath: string;
  inputArtifacts: string[];
  outputSchema: string;
  timeoutSeconds: number;
  retries: number;
}

export class AgentRunner {
  private providers: AgentProvider[] = [];
  private runStore: RunStore | null = null;

  register(provider: AgentProvider): void {
    this.providers.push(provider);
  }

  setRunStore(store: RunStore): void {
    this.runStore = store;
  }

  async detectAgents(): Promise<DetectedAgent[]> {
    const results: DetectedAgent[] = [];
    for (const provider of this.providers) {
      const detected = await provider.detect();
      if (detected) results.push(detected);
    }
    return results;
  }

  async runTask(
    providerName: string,
    options: RunTaskOptions
  ): Promise<TaskResult> {
    const provider = this.providers.find((p) => p.name === providerName);
    if (!provider) {
      throw new Error(`Provider not found: ${providerName}`);
    }

    const runId = this.generateRunId();
    const taskId = `${providerName}-${Date.now()}`;
    const startedAt = new Date().toISOString();

    if (this.runStore) {
      this.runStore.createRun(runId, options.repoIndexPath, providerName);
    }

    let lastResult: TaskResult | null = null;
    let attempt = 0;
    const maxAttempts = options.retries + 1;

    while (attempt < maxAttempts) {
      attempt++;
      const attemptStart = Date.now();

      try {
        const result = await this.runWithTimeout(provider, options);
        lastResult = result;

        if (result.state === "success") {
          break;
        }

        // If timed out, don't retry (timeout is not a transient failure)
        if (result.state === "timeout") {
          break;
        }
      } catch (error) {
        const durationMs = Date.now() - attemptStart;
        lastResult = {
          taskId,
          exitCode: -1,
          durationMs,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          retries: attempt - 1,
          validationErrors: [],
          state: "failed",
        };
      }
    }

    const finalResult = lastResult ?? {
      taskId,
      exitCode: -1,
      durationMs: 0,
      stdout: "",
      stderr: "No result produced",
      retries: attempt - 1,
      validationErrors: ["No result produced after all attempts"],
      state: "failed",
    };

    // Override retries in final result to reflect total attempts
    const resultWithRetries: TaskResult = {
      ...finalResult,
      retries: attempt - 1,
    };

    const completedAt = new Date().toISOString();

    if (this.runStore) {
      const taskRecord: TaskRunRecord = {
        taskId: resultWithRetries.taskId,
        prompt: options.prompt,
        inputArtifacts: options.inputArtifacts,
        outputSchema: options.outputSchema,
        state: resultWithRetries.state,
        exitCode: resultWithRetries.exitCode,
        stdout: resultWithRetries.stdout,
        stderr: resultWithRetries.stderr,
        durationMs: resultWithRetries.durationMs,
        retries: resultWithRetries.retries,
        validationErrors: resultWithRetries.validationErrors,
        startedAt,
        completedAt,
      };

      this.runStore.writeTask(runId, taskRecord);

      const summary = {
        total: 1,
        success: resultWithRetries.state === "success" ? 1 : 0,
        failed: resultWithRetries.state === "failed" ? 1 : 0,
        timedOut: resultWithRetries.state === "timeout" ? 1 : 0,
      };

      const runRecord: RunRecord = {
        runId,
        repoPath: options.repoIndexPath,
        providerName,
        startedAt,
        completedAt,
        tasks: [taskRecord],
        summary,
      };

      this.runStore.writeRun(runRecord);
    }

    return resultWithRetries;
  }

  private async runWithTimeout(
    provider: AgentProvider,
    options: RunTaskOptions
  ): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      const timeoutMs = options.timeoutSeconds * 1000;
      const startTime = Date.now();

      const timer = setTimeout(() => {
        const taskId = `${provider.name}-timeout-${Date.now()}`;
        resolve({
          taskId,
          exitCode: -1,
          durationMs: Date.now() - startTime,
          stdout: "",
          stderr: `Task timed out after ${options.timeoutSeconds}s`,
          retries: 0,
          validationErrors: [],
          state: "timeout",
        });
      }, timeoutMs);

      provider
        .runTask(options)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private generateRunId(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, "");
    const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
    const rand = Math.random().toString(36).slice(2, 6);
    return `${date}-${time}-${rand}`;
  }
}

export function createDefaultRunner(): AgentRunner {
  const runner = new AgentRunner();
  runner.register(new FakeProvider());
  runner.register(new ClaudeProvider());
  return runner;
}
