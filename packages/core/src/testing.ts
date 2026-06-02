import type { AgentProvider, TaskResult, DetectedAgent } from "./types.js";

/**
 * A deterministic fake provider for testing.
 *
 * Behavior is controlled by the prompt prefix:
 *   "FAKE:success"   -> returns exitCode 0, stdout contains prompt
 *   "FAKE:fail"      -> returns exitCode 1, stderr contains error
 *   "FAKE:schema"    -> returns exitCode 0 but validationErrors non-empty
 *   "FAKE:timeout"   -> simulates a timeout (state "timeout", exitCode -1)
 *   "FAKE:retry"     -> fails on first attempt, succeeds on retry (requires retries > 0)
 *   anything else    -> defaults to success
 */
export class FakeProvider implements AgentProvider {
  name: string;
  private retryCounters = new Map<string, number>();
  private behavior: "default" | "validate" = "default";

  constructor(name = "fake") {
    this.name = name;
  }

  setBehavior(behavior: "default" | "validate"): void {
    this.behavior = behavior;
  }

  async detect(): Promise<DetectedAgent | null> {
    return {
      name: "fake",
      command: "fake-agent",
      version: "0.1.0",
      available: true,
      health: "healthy",
      default: false,
    };
  }

  async runTask(options: {
    prompt: string;
    repoIndexPath: string;
    inputArtifacts: string[];
    outputSchema: string;
    timeoutSeconds: number;
    retries: number;
  }): Promise<TaskResult> {
    const prompt = options.prompt.trim();
    const taskId = `fake-${this.hashPrompt(prompt)}`;

    // Handle retry simulation
    if (prompt.startsWith("FAKE:retry")) {
      const attempt = (this.retryCounters.get(taskId) || 0) + 1;
      this.retryCounters.set(taskId, attempt);
      if (attempt <= 1 && options.retries < 1) {
        return {
          taskId,
          exitCode: 1,
          durationMs: 10,
          stdout: "",
          stderr: "Retry simulation: first attempt failed, no retries configured",
          retries: 0,
          validationErrors: [],
          state: "failed",
        };
      }
      if (attempt === 1) {
        return {
          taskId,
          exitCode: 1,
          durationMs: 10,
          stdout: "",
          stderr: "Retry simulation: first attempt failed",
          retries: 0,
          validationErrors: [],
          state: "failed",
        };
      }
      return {
        taskId,
        exitCode: 0,
        durationMs: 10,
        stdout: `Retry simulation: succeeded on attempt ${attempt}`,
        stderr: "",
        retries: attempt - 1,
        validationErrors: [],
        state: "success",
      };
    }

    if (prompt.startsWith("FAKE:fail")) {
      return {
        taskId,
        exitCode: 1,
        durationMs: 10,
        stdout: "",
        stderr: `Fake failure for: ${prompt}`,
        retries: 0,
        validationErrors: [],
        state: "failed",
      };
    }

    if (prompt.startsWith("FAKE:schema")) {
      return {
        taskId,
        exitCode: 0,
        durationMs: 10,
        stdout: "{ invalid json",
        stderr: "",
        retries: 0,
        validationErrors: ["Output does not match schema: expected object, got malformed JSON"],
        state: "failed",
      };
    }

    if (prompt.startsWith("FAKE:timeout")) {
      return {
        taskId,
        exitCode: -1,
        durationMs: options.timeoutSeconds * 1000,
        stdout: "",
        stderr: `Task timed out after ${options.timeoutSeconds}s`,
        retries: 0,
        validationErrors: [],
        state: "timeout",
      };
    }

    // Default: success
    const stdout = this.behavior === "validate"
      ? JSON.stringify({
          summary: `Analysis for ${options.prompt.slice(0, 50)}`,
          keyFeatures: ["feature-a"],
          complexity: "low",
          evidence: [{ filePath: "src/example.ts", lineStart: 1, lineEnd: 5, snippet: "export const x = 1;" }],
        })
      : `Fake response for: ${options.prompt.slice(0, 100)}`;

    return {
      taskId,
      exitCode: 0,
      durationMs: 10,
      stdout,
      stderr: "",
      retries: 0,
      validationErrors: [],
      state: "success",
    };
  }

  private hashPrompt(prompt: string): string {
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      const char = prompt.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36).padStart(8, "0");
  }
}
