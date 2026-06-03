import type { AgentProvider, TaskResult, DetectedAgent, ValidationError } from "./types.js";

/**
 * A deterministic fake provider for testing.
 *
 * Behavior is controlled by the prompt prefix:
 *   "FAKE:success"   -> returns exitCode 0, stdout contains prompt
 *   "FAKE:fail"      -> returns exitCode 1, stderr contains error
 *   "FAKE:schema"    -> returns exitCode 0 but validationErrors non-empty
 *   "FAKE:timeout"   -> simulates a timeout (state "timeout", exitCode -1)
 *   "FAKE:retry"     -> fails on first attempt, succeeds on retry (requires retries > 0)
 *   "FAKE:overview"  -> returns a valid Overview artifact
 *   "FAKE:module"    -> returns a valid Module artifact
 *   "FAKE:feature"   -> returns a valid Feature artifact
 *   "FAKE:code-map"  -> returns a valid CodeMap artifact
 *   "FAKE:invalid"   -> returns an artifact with invalid schema (bad envelope)
 *   "FAKE:bad"       -> returns an artifact with invalid citations (missing file)
 *   anything else    -> defaults to success
 */
export class FakeProvider implements AgentProvider {
  name: string;
  private retryCounters = new Map<string, number>();
  private behavior: "default" | "validate" = "default";
  private snapshotId: string | null = null;

  constructor(name = "fake") {
    this.name = name;
  }

  setBehavior(behavior: "default" | "validate"): void {
    this.behavior = behavior;
  }

  setSnapshotId(id: string): void {
    this.snapshotId = id;
  }

  private getSnapshotId(fallback: string): string {
    return this.snapshotId ?? fallback;
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
          validationErrors: [] as ValidationError[],
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
          validationErrors: [] as ValidationError[],
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
        validationErrors: [] as ValidationError[],
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
        validationErrors: [] as ValidationError[],
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
        validationErrors: [
          { code: "SCHEMA_ERROR", path: "stdout", message: "Output does not match schema: expected object, got malformed JSON" },
        ] as ValidationError[],
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
        validationErrors: [] as ValidationError[],
        state: "timeout",
      };
    }

    // Structured artifact paths
    if (prompt.startsWith("FAKE:overview")) {
      return {
        taskId,
        exitCode: 0,
        durationMs: 10,
        stdout: JSON.stringify({
          schemaVersion: "1.0.0",
          snapshotId: this.getSnapshotId("snap-overview"),
          generatedAt: new Date().toISOString(),
          data: {
            type: "overview",
            summary: "Test repository overview",
            modulesAnalyzed: 2,
            modulesComplete: 2,
            modulesFailed: 0,
            totalFiles: 5,
            skippedFiles: 0,
          },
        }),
        stderr: "",
        retries: 0,
        validationErrors: [] as ValidationError[],
        state: "success",
      };
    }

    if (prompt.startsWith("FAKE:module")) {
      return {
        taskId,
        exitCode: 0,
        durationMs: 10,
        stdout: JSON.stringify({
          schemaVersion: "1.0.0",
          snapshotId: this.getSnapshotId("snap-module"),
          generatedAt: new Date().toISOString(),
          data: {
            type: "module",
            name: "core",
            summary: "Core module",
            keyFeatures: ["indexing", "validation"],
            complexity: "medium",
            claims: [
              {
                statement: "Module exports validation functions",
                evidence: [
                  { filePath: "src/validation.ts", lineStart: 1, lineEnd: 10, snippet: "export function validateArtifact" },
                ],
              },
            ],
          },
        }),
        stderr: "",
        retries: 0,
        validationErrors: [] as ValidationError[],
        state: "success",
      };
    }

    if (prompt.startsWith("FAKE:feature")) {
      return {
        taskId,
        exitCode: 0,
        durationMs: 10,
        stdout: JSON.stringify({
          schemaVersion: "1.0.0",
          snapshotId: this.getSnapshotId("snap-feature"),
          generatedAt: new Date().toISOString(),
          data: {
            type: "feature",
            id: "feat-1",
            category: "cli",
            name: "scan command",
            description: "Scans repository and generates artifacts",
            claims: [
              {
                statement: "Scan command indexes files",
                evidence: [
                  { filePath: "src/scan.ts", lineStart: 1, lineEnd: 5, snippet: "export function scan()" },
                ],
              },
            ],
          },
        }),
        stderr: "",
        retries: 0,
        validationErrors: [] as ValidationError[],
        state: "success",
      };
    }

    if (prompt.startsWith("FAKE:code-map")) {
      return {
        taskId,
        exitCode: 0,
        durationMs: 10,
        stdout: JSON.stringify({
          schemaVersion: "1.0.0",
          snapshotId: this.getSnapshotId("snap-codemap"),
          generatedAt: new Date().toISOString(),
          data: {
            type: "code-map",
            files: [{ path: "src/index.ts", module: "core" }],
            modules: [{ name: "core", type: "package", fileCount: 3 }],
          },
        }),
        stderr: "",
        retries: 0,
        validationErrors: [] as ValidationError[],
        state: "success",
      };
    }

    if (prompt.startsWith("FAKE:invalid")) {
      return {
        taskId,
        exitCode: 0,
        durationMs: 10,
        stdout: JSON.stringify({
          snapshotId: this.getSnapshotId("snap-invalid"),
          generatedAt: new Date().toISOString(),
          data: { type: "unknown-type", value: 42 },
        }),
        stderr: "",
        retries: 0,
        validationErrors: [] as ValidationError[],
        state: "success",
      };
    }

    if (prompt.startsWith("FAKE:bad")) {
      return {
        taskId,
        exitCode: 0,
        durationMs: 10,
        stdout: JSON.stringify({
          schemaVersion: "1.0.0",
          snapshotId: this.getSnapshotId("snap-bad"),
          generatedAt: new Date().toISOString(),
          data: {
            type: "module",
            name: "bad-module",
            summary: "Bad module",
            keyFeatures: [],
            complexity: "low",
            claims: [
              {
                statement: "This claim has bad evidence",
                evidence: [
                  { filePath: "nonexistent/file.ts", lineStart: 1, lineEnd: 5, snippet: "does not exist" },
                ],
              },
            ],
          },
        }),
        stderr: "",
        retries: 0,
        validationErrors: [] as ValidationError[],
        state: "success",
      };
    }

    // Default: success — always produce structured JSON with evidence
    const firstArtifactFile = options.inputArtifacts[0] || "src/example.ts";
    const stdout = JSON.stringify({
      summary: `Analysis for ${options.prompt.slice(0, 50)}`,
      keyFeatures: ["feature-a"],
      complexity: "low",
      evidence: [{ filePath: firstArtifactFile, lineStart: 1, lineEnd: 1, snippet: "export const x = 1;" }],
    });

    return {
      taskId,
      exitCode: 0,
      durationMs: 10,
      stdout,
      stderr: "",
      retries: 0,
      validationErrors: [] as ValidationError[],
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
